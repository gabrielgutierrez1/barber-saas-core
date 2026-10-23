import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { DateTime } from 'luxon';
import type { ReservationStatus } from '@prisma/client';
import { testApp } from '../helpers/test-app';

test('cola de notificaciones: fallos, reintentos y reservas', { timeout: 60_000 }, async (t) => {
  process.env.SMTP_HOST = 'smtp.invalid';
  process.env.SMTP_FROM = 'no-reply@salon.test';
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  const { db, worker, app } = await testApp(t);
  let failing = false;
  const delivered: nodemailer.SendMailOptions[] = [];
  const send = t.mock.method(nodemailer, 'createTransport', () => ({
    sendMail: async (mail: nodemailer.SendMailOptions) => {
      if (failing) throw new Error('controlled SMTP unavailable');
      delivered.push(mail);
    },
  }));
  const errors = t.mock.method(console, 'error', () => {});
  const fresh = (id: string) => db.emailJob.findUniqueOrThrow({ where: { id } });
  const enqueue = (attempts = 0) =>
    db.emailJob.create({
      data: {
        key: `test:${randomUUID()}`,
        to: 'client@example.test',
        subject: 'Notificación',
        text: 'Texto plano',
        attempts,
      },
    });

  await t.test(
    'SMTP caído conserva el trabajo y programa 30 segundos; recuperado libera lease',
    async () => {
      const job = await enqueue();
      failing = true;
      const before = Date.now();
      await worker.tick();
      const failed = await fresh(job.id);
      assert.equal(failed.sentAt, null);
      assert.equal(failed.attempts, 1);
      assert.equal(failed.leaseUntil, null);
      assert.ok(failed.availableAt.getTime() >= before + 30_000);
      assert.ok(failed.availableAt.getTime() <= Date.now() + 30_000);
      assert.equal(errors.mock.calls.length, 1);
      assert.deepEqual(JSON.parse(errors.mock.calls[0].arguments[0]), {
        event: 'email_delivery_failed',
        jobId: job.id,
      });
      failing = false;
      await worker.tick();
      assert.equal((await fresh(job.id)).attempts, 1, 'no adelanta el reintento');
      await db.emailJob.update({ where: { id: job.id }, data: { availableAt: new Date(0) } });
      await worker.tick();
      const recovered = await fresh(job.id);
      assert.ok(recovered.sentAt);
      assert.equal(recovered.attempts, 2);
      assert.equal(recovered.leaseUntil, null);
      assert.equal(delivered.length, 1);
      assert.equal(delivered[0].text, job.text);
      assert.ok(String(delivered[0].html).includes('Salón SMTP &amp; Spa'));
      await worker.tick();
      assert.equal(delivered.length, 1);
      assert.equal((await fresh(job.id)).attempts, 2);
    },
  );

  await t.test('backoff exponencial hasta una hora y máximo de ocho intentos', async () => {
    const job = await enqueue();
    failing = true;
    for (let attempt = 0; attempt < 8; attempt++) {
      await db.emailJob.update({ where: { id: job.id }, data: { availableAt: new Date(0) } });
      const before = Date.now();
      await worker.tick();
      const row = await fresh(job.id);
      const backoff = Math.min(3600, 2 ** attempt * 30) * 1000;
      assert.equal(row.attempts, attempt + 1);
      assert.equal(row.sentAt, null);
      assert.equal(row.leaseUntil, null);
      assert.ok(row.availableAt.getTime() >= before + backoff);
      assert.ok(row.availableAt.getTime() <= Date.now() + backoff);
    }
    failing = false;
    await db.emailJob.update({ where: { id: job.id }, data: { availableAt: new Date(0) } });
    const count = delivered.length;
    await worker.tick();
    assert.equal(delivered.length, count);
    assert.equal((await fresh(job.id)).attempts, 8);
    assert.equal((await fresh(job.id)).sentAt, null, 'agotado permanece para revisión');
  });

  await t.test('respeta lease vigente y recupera lease vencido', async () => {
    const job = await enqueue();
    await db.emailJob.update({
      where: { id: job.id },
      data: { leaseUntil: new Date(Date.now() + 60_000) },
    });
    await worker.tick();
    assert.equal((await fresh(job.id)).attempts, 0);
    await db.emailJob.update({ where: { id: job.id }, data: { leaseUntil: new Date(0) } });
    await Promise.all([worker.tick(), worker.tick()]);
    assert.equal((await fresh(job.id)).attempts, 1);
    assert.equal((await fresh(job.id)).leaseUntil, null);
    assert.equal(delivered.filter((m) => m.messageId?.startsWith(`<${job.id}@`)).length, 1);
  });

  const service = await db.service.create({
    data: { name: 'Corte SMTP', price: 12000, durationMin: 30 },
  });
  const professional = await db.professional.create({
    data: {
      name: 'Profesional',
      openingHour: 0,
      closingHour: 24,
      workDays: [1, 2, 3, 4, 5, 6, 7],
      services: { connect: { id: service.id } },
    },
  });
  const reservation = (status: ReservationStatus, hours: number) =>
    db.reservation.create({
      data: {
        serviceId: service.id,
        professionalId: professional.id,
        serviceName: service.name,
        customerName: 'Ana',
        customerEmail: `booking-${randomUUID()}@example.test`,
        startsAt: new Date(Date.now() + hours * 3600_000),
        endsAt: new Date(Date.now() + hours * 3600_000 + 1800_000),
        expiresAt: new Date(Date.now() + 600_000),
        bookingTokenHash: randomUUID(),
        priceSnapshot: 12000,
        status,
      },
    });
  const { ReservationsService } = await import('../../dist/modules/reservations/reservations.js');
  const reservations = app.get(ReservationsService);

  await t.test(
    'solo confirmadas futuras dentro de 24 horas reciben un recordatorio único',
    async () => {
      const valid = await reservation('CONFIRMED', 2);
      for (const status of ['CANCELLED', 'EXPIRED', 'PENDING_PAYMENT', 'PAYMENT_REVIEW'] as const)
        await reservation(status, 3);
      await reservation('CONFIRMED', -2);
      await reservation('CONFIRMED', 25);
      await worker.tick();
      await worker.tick();
      const reminders = await db.emailJob.findMany({ where: { key: { startsWith: 'reminder:' } } });
      assert.equal(reminders.length, 1);
      assert.equal(reminders[0].key, `reminder:${valid.id}:${valid.startsAt.toISOString()}`);
      assert.equal(reminders[0].to, valid.customerEmail);
      assert.ok(
        reminders[0].text.includes(
          DateTime.fromJSDate(valid.startsAt)
            .setZone('America/Santiago')
            .toFormat('dd/MM/yyyy HH:mm'),
        ),
      );
      assert.ok(reminders[0].sentAt);
      assert.equal(reminders[0].attempts, 1);
    },
  );

  await t.test(
    'cancelar elimina recordatorio pendiente y envía la cancelación una sola vez',
    async () => {
      const r = await reservation('CONFIRMED', 4);
      failing = true;
      await worker.tick();
      const old = await db.emailJob.findUniqueOrThrow({
        where: { key: `reminder:${r.id}:${r.startsAt.toISOString()}` },
      });
      assert.equal(old.sentAt, null);
      await reservations.cancel(r.id, 'test');
      await reservations.cancel(r.id, 'test');
      assert.equal(await db.emailJob.count({ where: { id: old.id } }), 0);
      failing = false;
      await worker.tick();
      await worker.tick();
      const mails = delivered.filter((m) => m.to === r.customerEmail);
      assert.equal(mails.length, 1);
      assert.ok(String(mails[0].subject).includes('Reserva cancelada'));
      assert.ok(String(mails[0].text).includes('Ana, tu reserva de Corte SMTP'));
    },
  );

  await t.test(
    'reprogramar elimina recordatorio antiguo e informa nueva fecha en la zona del salón',
    async () => {
      const r = await reservation('CONFIRMED', 6);
      failing = true;
      await worker.tick();
      const oldKey = `reminder:${r.id}:${r.startsAt.toISOString()}`;
      assert.equal(await db.emailJob.count({ where: { key: oldKey, sentAt: null } }), 1);
      const next = DateTime.now().setZone('America/Santiago').plus({ hours: 10 }).startOf('hour');
      await reservations.move(
        r.id,
        { date: next.toISODate()!, time: next.toFormat('HH:mm'), professionalId: professional.id },
        'test',
      );
      assert.equal(await db.emailJob.count({ where: { key: oldKey } }), 0);
      failing = false;
      await worker.tick();
      await worker.tick();
      const mails = delivered.filter((m) => m.to === r.customerEmail);
      assert.equal(mails.length, 2, 'solo aviso de cambio y recordatorio nuevo');
      assert.ok(mails.some((m) => String(m.subject).includes('Reprogramada')));
      assert.ok(mails.some((m) => String(m.subject).includes('Recordatorio')));
      for (const mail of mails)
        assert.ok(String(mail.text).includes(next.toFormat('dd/MM/yyyy HH:mm')));
      assert.equal(
        await db.emailJob.count({ where: { key: { startsWith: `reminder:${r.id}:` } } }),
        1,
      );
    },
  );

  await t.test('sin SMTP configurado no intenta procesar la cola', async () => {
    delete process.env.SMTP_HOST;
    const count = send.mock.calls.length;
    await worker.tick();
    assert.equal(send.mock.calls.length, count);
  });
});
