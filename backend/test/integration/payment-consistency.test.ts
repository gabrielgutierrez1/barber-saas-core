import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DateTime } from 'luxon';
import { testApp } from '../helpers/test-app';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
test('consistencia transaccional de pagos y reservas', { timeout: 90000 }, async (t) => {
  const { app, db } = await testApp(t);
  const { PaymentsService, PaymentProvider } = await import(
    '../../dist/modules/payments/payments.js'
  );
  const { ReservationsService } = await import('../../dist/modules/reservations/reservations.js');
  const payments = app.get(PaymentsService),
    provider = app.get(PaymentProvider);
  const reservations = app.get(ReservationsService);
  await db.salon.update({ where: { id: 1 }, data: { timeZone: 'UTC' } });
  const service = await db.service.create({
    data: { name: 'Corte', price: 12000, durationMin: 30 },
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
  const date = DateTime.utc().plus({ days: 2 }).toISODate()!;
  const dto = (time: string) => ({
    serviceId: service.id,
    professionalId: professional.id,
    date,
    time,
    customerName: 'Cliente',
    customerEmail: 'test@example.test',
    bookingToken: randomBytes(32).toString('hex'),
  });
  const fresh = (id: string) => db.reservation.findUniqueOrThrow({ where: { id } });
  const free = async (time: string) =>
    (
      await reservations.availability({
        serviceId: service.id,
        professionalId: professional.id,
        date,
      })
    ).slots.includes(time);
  const payment = (id: string, reference: string, amount = 12000, currency = 'CLP') => ({
    id,
    externalReference: reference,
    amount,
    currency,
    status: 'approved',
    updatedAt: new Date('2026-01-01'),
  });
  for (const currency of ['CLP', 'USD'])
    await t.test(
      `importe/moneda inconsistente ${currency} retiene y permite resolución`,
      async () => {
        const time = currency === 'CLP' ? '09:00' : '10:00';
        const r = await reservations.create(dto(time));
        const amount = currency === 'CLP' ? 1.25 : 12000;
      const p = payment(`bad-${currency}`, r.id, amount, currency);
        await payments.apply(p);
        assert.equal((await fresh(r.id)).status, 'PAYMENT_REVIEW');
        assert.equal((await fresh(r.id)).approvedPaymentId, null);
        assert.equal(await free(time), false);
        await assert.rejects(reservations.create(dto(time)));
        await assert.rejects(
          reservations.review(r.id, { status: 'CONFIRMED', note: 'No válido' }, 'owner'),
        );
        const emails = await db.emailJob.count();
        await payments.apply(p);
        await payments.apply({ ...p, updatedAt: new Date('2026-01-02') });
        assert.equal(await db.emailJob.count(), emails);
        assert.equal(
          await db.auditEvent.count({ where: { reservationId: r.id, action: 'AMOUNT_MISMATCH' } }),
          1,
        );
        const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: p.id } });
        assert.equal(Number(attempt.amount), amount);
        assert.equal(attempt.reviewRequired, true);
        await reservations.review(
          r.id,
          { status: 'CANCELLED', note: 'Coordinar devolución manual' },
          'owner',
        );
        assert.equal(await free(time), true);
      },
    );
  for (const replacement of [false, true])
    await t.test(`vencimiento no recupera horario; reemplazo ${replacement}`, async () => {
      const time = replacement ? '11:00' : '12:00';
      const r = await reservations.create(dto(time));
      await db.reservation.update({ where: { id: r.id }, data: { expiresAt: new Date(0) } });
      let next;
      if (replacement) {
        next = await reservations.create(dto(time));
        await payments.apply(payment('replacement', next.id));
      }
      await payments.apply(payment(`expired-${replacement}`, r.id, 1));
      assert.equal((await fresh(r.id)).reviewHoldsSlot, false);
      assert.equal(await free(time), !replacement);
      if (next) assert.equal((await fresh(next.id)).status, 'CONFIRMED');
    });
  await t.test(
    'cancelación, cobros tardíos duplicados y devolución mantienen liberado el horario',
    async () => {
      const r = await reservations.create(dto('13:00'));
      await reservations.cancel(r.id, 'customer');
      const p = payment('late', r.id);
      await payments.apply(p);
      await payments.apply(p);
      assert.equal((await fresh(r.id)).status, 'CANCELLED');
      assert.equal(await free('13:00'), true);
      assert.equal(
        await db.auditEvent.count({ where: { reservationId: r.id, action: 'LATE_PAYMENT' } }),
        1,
      );
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: p.id } })).reviewRequired,
        true,
      );
      const next = await reservations.create(dto('13:00'));
      await payments.apply(payment('replacement-late', next.id));
      await payments.apply(payment('late-extra', r.id, 2));
      await payments.apply({ ...p, status: 'refunded', updatedAt: new Date('2026-01-02') });
      assert.equal((await fresh(r.id)).status, 'CANCELLED');
      assert.equal((await fresh(next.id)).status, 'CONFIRMED');
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: p.id } })).reviewRequired,
        false,
      );
      assert.equal(
        await db.auditEvent.count({ where: { reservationId: r.id, action: 'REFUND_RECORDED' } }),
        1,
      );
    },
  );
  for (const outcome of ['cancel', 'expire', 'approve'])
    await t.test(`checkout en vuelo: ${outcome}`, async () => {
      const time = { cancel: '14:00', expire: '15:00', approve: '16:00' }[outcome]!;
      const r = await reservations.create(dto(time));
      const entered = deferred(),
        release = deferred();
      provider.checkout = async () => {
        entered.resolve();
        await release.promise;
        return { preferenceId: `pref-${outcome}`, checkoutUrl: 'https://example.test/pay' };
      };
      const checkout = payments.checkout(r.id, r.bookingToken);
      const rejected = assert.rejects(checkout, /no pagable/);
      await entered.promise;
      await assert.rejects(payments.checkout(r.id, r.bookingToken));
      if (outcome === 'cancel') await reservations.cancel(r.id, 'customer');
      if (outcome === 'expire')
        await db.reservation.update({ where: { id: r.id }, data: { expiresAt: new Date(0) } });
      if (outcome === 'approve') await payments.apply(payment('during-checkout', r.id));
      release.resolve();
      await rejected;
      const row = await fresh(r.id);
      assert.equal(row.preferenceId, `pref-${outcome}`);
      assert.equal(row.checkoutLeaseUntil, null);
      assert.equal(row.checkoutLeaseToken, null);
      await assert.rejects(payments.checkout(r.id, r.bookingToken));
    });
  await t.test(
    'respuesta perdida conserva referencia y clave estable para reintentar y conciliar',
    async () => {
      const r = await reservations.create(dto('17:00'));
      const keys: string[] = [];
      provider.checkout = async (row) => {
        keys.push(row.checkoutKey);
        throw new Error('response lost');
      };
      await assert.rejects(payments.checkout(r.id, r.bookingToken));
      assert.ok((await fresh(r.id)).checkoutStartedAt);
      assert.equal((await fresh(r.id)).checkoutLeaseUntil, null);
      provider.checkout = async (row) => {
        keys.push(row.checkoutKey);
        return { preferenceId: 'retried', checkoutUrl: 'https://example.test/pay' };
      };
      assert.deepEqual(await payments.checkout(r.id, r.bookingToken), {
        checkoutUrl: 'https://example.test/pay',
      });
      assert.equal(keys[0], keys[1]);
      await payments.checkout(r.id, r.bookingToken);
      assert.equal(keys.length, 2);
    },
  );
  await t.test('un lease viejo no borra ni sobrescribe un checkout nuevo', async () => {
    const r = await reservations.create(dto('18:00'));
    const entered = deferred(),
      release = deferred();
    provider.checkout = async () => {
      entered.resolve();
      await release.promise;
      return { preferenceId: 'stale', checkoutUrl: 'https://example.test/stale' };
    };
    const old = payments.checkout(r.id, r.bookingToken);
    const rejected = assert.rejects(old, /no pagable/);
    await entered.promise;
    await db.reservation.update({ where: { id: r.id }, data: { checkoutLeaseUntil: new Date(0) } });
    provider.checkout = async () => ({
      preferenceId: 'new',
      checkoutUrl: 'https://example.test/new',
    });
    await payments.checkout(r.id, r.bookingToken);
    release.resolve();
    await rejected;
    assert.equal((await fresh(r.id)).preferenceId, 'new');
    assert.equal((await fresh(r.id)).checkoutLeaseToken, null);
  });
  await t.test('revisión administrativa no desplaza al reemplazo confirmado', async () => {
    const r = await reservations.create(dto('19:00'));
    await db.reservation.update({ where: { id: r.id }, data: { expiresAt: new Date(0) } });
    const next = await reservations.create(dto('19:00'));
    await payments.apply(payment('next-review', next.id));
    await payments.apply(payment('late-review', r.id));
    await assert.rejects(
      reservations.review(r.id, { status: 'CONFIRMED', note: 'Intento de confirmar' }, 'owner'),
    );
    assert.equal((await fresh(r.id)).reviewHoldsSlot, false);
    assert.equal((await fresh(next.id)).status, 'CONFIRMED');
    await reservations.cancel(r.id, 'owner');
    await payments.apply({
      ...payment('late-review', r.id),
      status: 'charged_back',
      updatedAt: new Date('2026-01-03'),
    });
    assert.equal((await fresh(r.id)).status, 'CANCELLED');
    assert.equal(
      await db.auditEvent.count({ where: { reservationId: r.id, action: 'CHARGEBACK_RECORDED' } }),
      1,
    );
    await reservations.review(
      r.id,
      { status: 'CANCELLED', note: 'Contracargo verificado' },
      'owner',
    );
    assert.equal(
      await db.paymentAttempt.count({ where: { reservationId: r.id, reviewRequired: true } }),
      0,
    );
  });
});
