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
  await t.test(
    'reembolso o contracargo de pago secundario no invalida reserva confirmada ni pago principal',
    async () => {
      const r = await reservations.create(dto('20:00'));
      await payments.apply(payment('primary-a', r.id));
      assert.equal((await fresh(r.id)).status, 'CONFIRMED');
      assert.equal((await fresh(r.id)).approvedPaymentId, 'primary-a');
      assert.equal(await free('20:00'), false);

      await payments.apply({
        ...payment('secondary-b', r.id),
        status: 'rejected',
        updatedAt: new Date('2026-01-01'),
      });
      await payments.apply({
        ...payment('secondary-b', r.id),
        status: 'refunded',
        updatedAt: new Date('2026-01-02'),
      });

      const primary = await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'primary-a' } });
      const secondary = await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'secondary-b' } });
      assert.equal(primary.status, 'approved');
      assert.equal(primary.reviewRequired, false);
      assert.equal(secondary.status, 'refunded');
      assert.equal(secondary.reviewRequired, false);
      assert.equal((await fresh(r.id)).approvedPaymentId, 'primary-a');
      assert.equal((await fresh(r.id)).status, 'CONFIRMED');
      assert.equal(await free('20:00'), false);
      assert.equal(
        await db.auditEvent.count({ where: { reservationId: r.id, action: 'REFUND_RECORDED' } }),
        1,
      );

      // Eventos duplicados y antiguos fuera de orden no duplican auditoría ni alteran estado.
      assert.deepEqual(
        await payments.apply({
          ...payment('secondary-b', r.id),
          status: 'refunded',
          updatedAt: new Date('2026-01-02'),
        }),
        { duplicate: true },
      );
      assert.deepEqual(
        await payments.apply({
          ...payment('secondary-b', r.id),
          status: 'approved',
          updatedAt: new Date('2026-01-01'),
        }),
        { duplicate: true },
      );
      assert.equal(
        await db.auditEvent.count({ where: { reservationId: r.id, action: 'REFUND_RECORDED' } }),
        1,
      );
      assert.equal((await fresh(r.id)).status, 'CONFIRMED');

      // Contracargo de otro pago secundario tampoco invalida la reserva confirmada.
      await payments.apply({
        ...payment('secondary-c', r.id),
        status: 'charged_back',
        updatedAt: new Date('2026-01-03'),
      });
      assert.equal((await fresh(r.id)).status, 'CONFIRMED');
      assert.equal((await fresh(r.id)).approvedPaymentId, 'primary-a');
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'secondary-c' } }))
          .reviewRequired,
        false,
      );
      assert.equal(
        await db.auditEvent.count({
          where: { reservationId: r.id, action: 'CHARGEBACK_RECORDED' },
        }),
        1,
      );

      // Si la reserva estaba en PAYMENT_REVIEW por pagos duplicados, solo vuelve a CONFIRMED
      // cuando no quedan otras incidencias pendientes.
      const r2 = await reservations.create(dto('20:30'));
      await payments.apply(payment('primary-a2', r2.id));
      await payments.apply(payment('dup-d', r2.id));
      await payments.apply(payment('dup-e', r2.id, 5000));
      assert.equal((await fresh(r2.id)).status, 'PAYMENT_REVIEW');
      assert.equal((await fresh(r2.id)).reviewHoldsSlot, true);

      await payments.apply({
        ...payment('dup-d', r2.id),
        status: 'refunded',
        updatedAt: new Date('2026-01-02'),
      });
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'dup-d' } })).reviewRequired,
        false,
      );
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'dup-e' } })).reviewRequired,
        true,
      );
      assert.equal((await fresh(r2.id)).status, 'PAYMENT_REVIEW');
      assert.equal(await free('20:30'), false);

      await payments.apply({
        ...payment('dup-e', r2.id, 5000),
        status: 'refunded',
        updatedAt: new Date('2026-01-03'),
      });
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'dup-e' } })).reviewRequired,
        false,
      );
      assert.equal(
        await db.auditEvent.count({ where: { reservationId: r2.id, action: 'AMOUNT_MISMATCH' } }),
        1,
      );
      assert.equal((await fresh(r2.id)).status, 'CONFIRMED');
      assert.equal((await fresh(r2.id)).approvedPaymentId, 'primary-a2');
      assert.equal(await free('20:30'), false);
    },
  );
  await t.test(
    'reembolso y contracargo del pago principal pasan a revisión conservando retención',
    async () => {
      const rRefund = await reservations.create(dto('21:00'));
      await payments.apply(payment('main-refund', rRefund.id));
      assert.equal((await fresh(rRefund.id)).status, 'CONFIRMED');

      await payments.apply({
        ...payment('main-refund', rRefund.id),
        status: 'refunded',
        updatedAt: new Date('2026-01-02'),
      });
      assert.equal((await fresh(rRefund.id)).status, 'PAYMENT_REVIEW');
      assert.equal((await fresh(rRefund.id)).reviewHoldsSlot, true);
      assert.equal(await free('21:00'), false);
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'main-refund' } }))
          .reviewRequired,
        true,
      );
      assert.equal(
        await db.auditEvent.count({
          where: { reservationId: rRefund.id, action: 'REFUND_RECORDED' },
        }),
        1,
      );
      await assert.rejects(
        reservations.review(
          rRefund.id,
          { status: 'CONFIRMED', paymentAttemptId: 'main-refund', note: 'Pago ya reembolsado' },
          'owner',
        ),
      );

      const rCb = await reservations.create(dto('21:30'));
      await payments.apply(payment('main-cb', rCb.id));
      await payments.apply({
        ...payment('main-cb', rCb.id),
        status: 'charged_back',
        updatedAt: new Date('2026-01-02'),
      });
      assert.equal((await fresh(rCb.id)).status, 'PAYMENT_REVIEW');
      assert.equal((await fresh(rCb.id)).reviewHoldsSlot, true);
      assert.equal(await free('21:30'), false);
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'main-cb' } })).reviewRequired,
        true,
      );
      assert.equal(
        await db.auditEvent.count({
          where: { reservationId: rCb.id, action: 'CHARGEBACK_RECORDED' },
        }),
        1,
      );
    },
  );
  await t.test(
    'resolución administrativa por pago mantiene otros pendientes, horario y trazabilidad',
    async () => {
      // 1. Reserva con un solo pago pendiente de revisión.
      const rSingle = await reservations.create(dto('22:00'));
      await db.reservation.update({
        where: { id: rSingle.id },
        data: { expiresAt: new Date(0) },
      });
      await payments.apply(payment('single-pending', rSingle.id));
      assert.equal((await fresh(rSingle.id)).status, 'PAYMENT_REVIEW');
      await reservations.review(
        rSingle.id,
        {
          status: 'CONFIRMED',
          paymentAttemptId: 'single-single-invalid',
          note: 'Pago inexistente',
        },
        'admin-1',
      ).catch(() => {});
      await assert.rejects(
        reservations.review(
          rSingle.id,
          {
            status: 'CONFIRMED',
            paymentAttemptId: 'single-single-invalid',
            note: 'Pago inexistente',
          },
          'admin-1',
        ),
      );
      await reservations.review(
        rSingle.id,
        {
          status: 'CONFIRMED',
          paymentAttemptId: 'single-pending',
          note: 'Confirmado pago único',
        },
        'admin-1',
      );
      assert.equal((await fresh(rSingle.id)).status, 'CONFIRMED');
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'single-pending' } }))
          .reviewRequired,
        false,
      );
      assert.equal(await free('22:00'), false);

      // 2. Reserva con dos pagos y solo uno pendiente, luego un tercero pendiente (dos pendientes).
      const rMulti = await reservations.create(dto('22:30'));
      await payments.apply(payment('multi-main', rMulti.id));
      await payments.apply(payment('multi-dup', rMulti.id));
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'multi-main' } })).reviewRequired,
        false,
      );
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'multi-dup' } })).reviewRequired,
        true,
      );

      // Si el administrador confirma la reserva apuntando al pago principal, el duplicado sigue pendiente.
      await reservations.review(
        rMulti.id,
        {
          status: 'CONFIRMED',
          paymentAttemptId: 'multi-main',
          note: 'Se confirma horario con pago principal',
        },
        'admin-owner',
      );
      assert.equal((await fresh(rMulti.id)).status, 'CONFIRMED');
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'multi-dup' } })).reviewRequired,
        true,
      );

      // Llega otro pago con importe incorrecto: ahora hay dos pagos pendientes (multi-dup y multi-bad).
      await payments.apply(payment('multi-bad', rMulti.id, 7000));
      assert.equal((await fresh(rMulti.id)).status, 'PAYMENT_REVIEW');
      assert.equal(
        await db.paymentAttempt.count({ where: { reservationId: rMulti.id, reviewRequired: true } }),
        2,
      );

      // Sin paymentAttemptId cuando hay múltiples pendientes debe fallar.
      await assert.rejects(
        reservations.review(
          rMulti.id,
          { status: 'CONFIRMED', note: 'Ambiguo sin indicar pago' },
          'admin-owner',
        ),
      );

      // Intento de resolver un pago perteneciente a otra reserva debe fallar.
      await assert.rejects(
        reservations.review(
          rMulti.id,
          {
            status: 'CONFIRMED',
            paymentAttemptId: 'single-pending',
            note: 'Pago de otra reserva',
          },
          'admin-owner',
        ),
      );

      // Resolución del pago A (multi-dup) sin modificar el pendiente del pago B (multi-bad).
      await reservations.review(
        rMulti.id,
        {
          status: 'CONFIRMED',
          paymentAttemptId: 'multi-dup',
          note: 'Devolución de duplicado gestionada',
        },
        'admin-owner',
      );
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'multi-dup' } })).reviewRequired,
        false,
      );
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'multi-bad' } })).reviewRequired,
        true,
      );
      assert.equal(await free('22:30'), false);

      // El panel administrativo continúa mostrando únicamente el pago no resuelto (multi-bad).
      const listAfterFirst = await reservations.list(1);
      const itemAfterFirst = listAfterFirst.items.find((i) => i.id === rMulti.id);
      assert.ok(itemAfterFirst);
      assert.deepEqual(itemAfterFirst.payments, [{ id: 'multi-bad' }]);

      // Resolución del pago B (multi-bad) después del pago A.
      await reservations.review(
        rMulti.id,
        {
          status: 'CONFIRMED',
          paymentAttemptId: 'multi-bad',
          note: 'Devolución de importe incorrecto gestionada',
        },
        'admin-owner',
      );
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'multi-bad' } })).reviewRequired,
        false,
      );
      const listAfterSecond = await reservations.list(1);
      const itemAfterSecond = listAfterSecond.items.find((i) => i.id === rMulti.id);
      assert.ok(itemAfterSecond);
      assert.deepEqual(itemAfterSecond.payments, []);
      assert.equal(await free('22:30'), false);

      // Verificación de auditoría con administrador, reserva y pagos afectados.
      const audits = await db.auditEvent.findMany({
        where: { reservationId: rMulti.id, action: 'REVIEW_CONFIRMED' },
        orderBy: { createdAt: 'asc' },
      });
      assert.equal(audits.length, 3);
      assert.ok(audits.every((a) => a.actorId === 'admin-owner'));
      assert.ok(audits.some((a) => a.note.includes('multi-dup')));
      assert.ok(audits.some((a) => a.note.includes('multi-bad')));

      // Reserva cancelada con dos devoluciones pendientes se resuelve individualmente sin reactivarse.
      const rCancelled = await reservations.create(dto('23:00'));
      await payments.apply(payment('canc-a', rCancelled.id));
      await payments.apply(payment('canc-b', rCancelled.id));
      await reservations.cancel(rCancelled.id, 'admin-owner');
      assert.equal((await fresh(rCancelled.id)).status, 'CANCELLED');
      assert.equal(await free('23:00'), true);
      assert.equal(
        await db.paymentAttempt.count({
          where: { reservationId: rCancelled.id, reviewRequired: true },
        }),
        2,
      );

      await assert.rejects(
        reservations.review(
          rCancelled.id,
          { status: 'CONFIRMED', paymentAttemptId: 'canc-a', note: 'No debe reactivar' },
          'admin-owner',
        ),
      );
      assert.equal((await fresh(rCancelled.id)).status, 'CANCELLED');

      await reservations.review(
        rCancelled.id,
        { status: 'CANCELLED', paymentAttemptId: 'canc-a', note: 'Reembolsado canc-a' },
        'admin-owner',
      );
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'canc-a' } })).reviewRequired,
        false,
      );
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'canc-b' } })).reviewRequired,
        true,
      );
      assert.equal((await fresh(rCancelled.id)).status, 'CANCELLED');
      assert.equal(await free('23:00'), true);

      await reservations.review(
        rCancelled.id,
        { status: 'CANCELLED', paymentAttemptId: 'canc-b', note: 'Reembolsado canc-b' },
        'admin-owner',
      );
      assert.equal(
        (await db.paymentAttempt.findUniqueOrThrow({ where: { id: 'canc-b' } })).reviewRequired,
        false,
      );
      assert.equal((await fresh(rCancelled.id)).status, 'CANCELLED');
      assert.equal(await free('23:00'), true);
    },
  );
});
