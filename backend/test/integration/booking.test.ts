import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { DateTime } from 'luxon';
import bcrypt from 'bcryptjs';
import { testApp } from '../helpers/test-app';

test('instalación independiente: reservas, pagos y autenticación', { timeout: 90_000 }, async (t) => {
  const { app, db } = await testApp(t);
  const { PaymentsService, PaymentProvider } = await import('../../dist/modules/payments/payments.js');
  const url = await app.getUrl();
  await db.salon.update({
    where: { id: 1 },
    data: { name: 'Salón de prueba', timeZone: 'UTC', contactEmail: 'test@example.com' },
  });
  const owner = await db.user.create({
    data: {
      name: 'Owner',
      email: 'owner@example.com',
      passwordHash: await bcrypt.hash('test-password-123', 4),
      role: 'OWNER',
    },
  });
  const s1 = await db.service.create({ data: { name: 'Corte', price: 12000, durationMin: 30 } }),
    s2 = await db.service.create({ data: { name: 'Barba', price: 8000, durationMin: 30 } });
  const staff = await db.professional.create({
    data: {
      name: 'Profesional A',
      openingHour: 0,
      closingHour: 24,
      workDays: [1, 2, 3, 4, 5, 6, 7],
      services: { connect: [{ id: s1.id }, { id: s2.id }] },
    },
  });
  const other = await db.professional.create({
    data: {
      name: 'Profesional B',
      openingHour: 0,
      closingHour: 24,
      workDays: [1, 2, 3, 4, 5, 6, 7],
      services: { connect: [{ id: s1.id }] },
    },
  });
  const date = DateTime.utc().plus({ days: 2 }).toISODate()!;
  const body = (serviceId = s1.id, professionalId = staff.id, time = '12:00') => ({
    serviceId,
    professionalId,
    date,
    time,
    customerName: 'Cliente',
    customerEmail: 'client@example.com',
    bookingToken: randomBytes(32).toString('hex'),
  });
  const request = async (path: string, body?: unknown, token?: string) => {
    const res = await fetch(url + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, data: await res.json() };
  };
  let first: any, firstBody: any;
  await t.test('bloquea concurrencia entre servicios del mismo profesional', async () => {
    const a = body(),
      b = body(s2.id);
    const results = await Promise.all([
      request('/api/public/reservations', a),
      request('/api/public/reservations', b),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const index = results.findIndex((r) => r.status === 201);
    first = results[index].data;
    firstBody = index === 0 ? a : b;
  });
  await t.test('permite dos profesionales a la misma hora', async () =>
    assert.equal((await request('/api/public/reservations', body(s1.id, other.id))).status, 201),
  );
  await t.test('reintentar el mismo token devuelve la misma reserva', async () => {
    const result = await request('/api/public/reservations', firstBody);
    assert.equal(result.data.id, first.id);
    assert.equal(await db.reservation.count(), 2);
  });
  await t.test('token incorrecto no expone reservas', async () =>
    assert.equal(
      (
        await request(`/api/public/reservations/${first.id}/status`, {
          bookingToken: 'f'.repeat(64),
        })
      ).status,
      404,
    ),
  );
  const payments = app.get(PaymentsService),
    provider = app.get(PaymentProvider);
  await t.test('checkout concurrente genera una sola preferencia y permite reintento', async () => {
    let calls = 0;
    provider.checkout = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 150));
      return { preferenceId: 'test-preference', checkoutUrl: 'https://example.com/checkout' };
    };
    const results = await Promise.allSettled([
      payments.checkout(first.id, firstBody.bookingToken),
      payments.checkout(first.id, firstBody.bookingToken),
    ]);
    assert.equal(calls, 1);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    await payments.checkout(first.id, firstBody.bookingToken);
    assert.equal(calls, 1);
  });
  await t.test('URL approved no confirma; webhook exige firma y verifica proveedor', async () => {
    const before = await request(`/api/public/reservations/${first.id}/status?status=approved&collection_status=approved`, { bookingToken: firstBody.bookingToken });
    assert.equal(before.data.status, 'PENDING_PAYMENT');
    process.env.MP_WEBHOOK_SECRET = 'test-webhook-secret';
    const ts = String(Date.now());
    const requestId = 'test-request';
    const hash = createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
      .update(`id:900;request-id:${requestId};ts:${ts};`).digest('hex');
    const get = provider.get;
    let calls = 0;
    provider.get = async () => {
      calls++;
      return { id: '900', externalReference: first.id, status: 'pending',
        amount: firstBody.serviceId === s1.id ? 12000 : 8000,
        currency: 'CLP', updatedAt: new Date() };
    };
    try {
      await assert.rejects(payments.webhook('900', `ts=${ts},v1=bad`, requestId, { type: 'payment', data: { id: '900' } }));
      assert.equal(calls, 0);
      await payments.webhook('900', `ts=${ts},v1=${hash}`, requestId, { type: 'payment', data: { id: '900' } });
      assert.equal(calls, 1);
      assert.equal((await db.reservation.findUniqueOrThrow({ where: { id: first.id } })).status, 'PENDING_PAYMENT');
      await db.paymentAttempt.delete({ where: { id: '900' } });
    } finally { provider.get = get; }
  });
  await t.test('rechazo seguido de otro pago aprobado confirma sin bloquearse', async () => {
    const amount = firstBody.serviceId === s1.id ? 12000 : 8000;
    await payments.apply({
      id: '100',
      externalReference: first.id,
      status: 'rejected',
      amount,
      currency: 'CLP',
      updatedAt: new Date('2026-01-01'),
    });
    await payments.apply({
      id: '101',
      externalReference: first.id,
      status: 'approved',
      amount,
      currency: 'CLP',
      updatedAt: new Date('2026-01-02'),
    });
    assert.equal(
      (await db.reservation.findUniqueOrThrow({ where: { id: first.id } })).status,
      'CONFIRMED',
    );
    assert.equal(await db.paymentAttempt.count(), 2);
    await payments.apply({
      id: '101',
      externalReference: first.id,
      status: 'approved',
      amount,
      currency: 'CLP',
      updatedAt: new Date('2026-01-02'),
    });
    assert.equal(await db.emailJob.count(), 1);
    const confirmation = await db.emailJob.findFirstOrThrow();
    assert.equal(confirmation.to, firstBody.customerEmail);
    assert.match(confirmation.subject, /Salón de prueba.*confirmada/i);
    assert.ok(confirmation.text.includes(first.id));
    assert.ok(confirmation.text.includes(`${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)} 12:00`));
  });
  await t.test('un reembolso y eventos antiguos no revierten el estado', async () => {
    const amount = firstBody.serviceId === s1.id ? 12000 : 8000;
    await payments.apply({
      id: '101',
      externalReference: first.id,
      status: 'refunded',
      amount,
      currency: 'CLP',
      updatedAt: new Date('2026-01-03'),
    });
    await payments.apply({
      id: '101',
      externalReference: first.id,
      status: 'approved',
      amount,
      currency: 'CLP',
      updatedAt: new Date('2026-01-02'),
    });
    assert.equal(
      (await db.paymentAttempt.findUniqueOrThrow({ where: { id: '101' } })).status,
      'refunded',
    );
    assert.equal(
      (await db.reservation.findUniqueOrThrow({ where: { id: first.id } })).status,
      'PAYMENT_REVIEW',
    );
  });
  let token = '';
  await t.test('administración requiere sesión; login funciona', async () => {
    assert.equal((await request('/api/admin/reservations')).status, 401);
    const login = await request('/api/auth/login', {
      email: owner.email,
      password: 'test-password-123',
    });
    assert.equal(login.status, 201);
    token = login.data.accessToken;
  });
  await t.test('panel y cliente coinciden en reservas vencidas', async () => {
    const r = await request('/api/public/reservations', body(s1.id, staff.id, '14:00'));
    await db.reservation.update({ where: { id: r.data.id }, data: { expiresAt: new Date(0) } });
    assert.equal(
      (
        await request(`/api/public/reservations/${r.data.id}/status`, {
          bookingToken: r.data.bookingToken,
        })
      ).data.status,
      'EXPIRED',
    );
    const page = await request('/api/admin/reservations?page=1', undefined, token);
    assert.equal(page.data.items.find((x: any) => x.id === r.data.id).status, 'EXPIRED');
    assert.equal(page.data.total, 3);
  });
  await t.test('pagos tardíos no confirman horarios vencidos', async () => {
    const r = await db.reservation.findFirstOrThrow({ where: { status: 'EXPIRED' } });
    await payments.apply({
      id: '102',
      externalReference: r.id,
      status: 'approved',
      amount: r.priceSnapshot,
      currency: 'CLP',
      updatedAt: new Date(),
    });
    assert.equal(
      (await db.reservation.findUniqueOrThrow({ where: { id: r.id } })).status,
      'PAYMENT_REVIEW',
    );
  });
  await t.test('bloqueos del profesional se reflejan en disponibilidad', async () => {
    const block = await request(
      '/api/admin/blocks',
      {
        professionalId: staff.id,
        startsAt: `${date}T16:00:00Z`,
        endsAt: `${date}T17:00:00Z`,
        reason: 'Descanso',
      },
      token,
    );
    assert.equal(block.status, 201);
    const slots = await request(
      `/api/public/availability?serviceId=${s1.id}&professionalId=${staff.id}&date=${date}`,
    );
    assert(!slots.data.slots.includes('16:00'));
    assert(!slots.data.slots.includes('16:30'));
    assert.equal(
      (await request('/api/public/reservations', body(s1.id, staff.id, '16:00'))).status,
      409,
    );
  });
  await t.test('importe incorrecto queda auditado sin registrar ni confirmar', async () => {
    const bad = {
      id: 'bad-amount',
      externalReference: first.id,
      status: 'approved',
      amount: 1,
      currency: 'CLP',
      updatedAt: new Date(),
    };
    assert.deepEqual(await payments.apply(bad), { review: true });
    assert.deepEqual(await payments.apply(bad), { review: true });
    assert.equal(await db.paymentAttempt.count({ where: { id: 'bad-amount' } }), 0);
    assert.equal(
      await db.auditEvent.count({ where: { reservationId: first.id, action: 'AMOUNT_MISMATCH' } }),
      1,
    );
  });
  const pending = async (time: string) => {
    const b = body(s1.id, staff.id, time);
    const res = await request('/api/public/reservations', b);
    assert.equal(res.status, 201);
    return res.data.id as string;
  };
  await t.test('conciliación sigue con los demás pagos si uno es inconsistente', async () => {
    const id = await pending('18:00');
    const found: Record<string, any> = {
      'mismatch-1': {
        id: 'mismatch-1',
        externalReference: id,
        status: 'rejected',
        amount: 999,
        currency: 'CLP',
        updatedAt: new Date('2026-02-01'),
      },
      'broken-1': null,
      'ok-1': {
        id: 'ok-1',
        externalReference: id,
        status: 'approved',
        amount: 12000,
        currency: 'CLP',
        updatedAt: new Date('2026-02-02'),
      },
    };
    provider.search = async () => Object.keys(found);
    provider.get = async (paymentId: string) => {
      if (!found[paymentId]) throw new Error('provider timeout');
      return found[paymentId];
    };
    assert.deepEqual(await payments.reconcile(id), { checked: 3, failed: 1 });
    const r = await db.reservation.findUniqueOrThrow({ where: { id } });
    assert.equal(r.status, 'CONFIRMED');
    assert.equal(r.approvedPaymentId, 'ok-1');
  });
  await t.test('pago duplicado pasa a revisión sin liberar el horario', async () => {
    const r = await db.reservation.findFirstOrThrow({ where: { approvedPaymentId: 'ok-1' } });
    await payments.apply({
      id: 'dup-1',
      externalReference: r.id,
      status: 'approved',
      amount: 12000,
      currency: 'CLP',
      updatedAt: new Date('2026-02-03'),
    });
    assert.equal(
      (await db.reservation.findUniqueOrThrow({ where: { id: r.id } })).status,
      'PAYMENT_REVIEW',
    );
    const slots = await request(
      `/api/public/availability?serviceId=${s1.id}&professionalId=${staff.id}&date=${date}`,
    );
    assert(!slots.data.slots.includes('18:00'));
    assert.equal(
      (await request('/api/public/reservations', body(s2.id, staff.id, '18:00'))).status,
      409,
    );
  });
  await t.test('reembolso de una reserva cancelada la mantiene cancelada', async () => {
    const id = await pending('20:00');
    await payments.apply({
      id: 'cancel-1',
      externalReference: id,
      status: 'approved',
      amount: 12000,
      currency: 'CLP',
      updatedAt: new Date('2026-03-01'),
    });
    assert.equal((await request(`/api/admin/reservations/${id}/cancel`, {}, token)).status, 201);
    await payments.apply({
      id: 'cancel-1',
      externalReference: id,
      status: 'refunded',
      amount: 12000,
      currency: 'CLP',
      updatedAt: new Date('2026-03-02'),
    });
    assert.equal((await db.reservation.findUniqueOrThrow({ where: { id } })).status, 'CANCELLED');
    assert.equal(
      await db.auditEvent.count({ where: { reservationId: id, action: 'REFUND_RECORDED' } }),
      1,
    );
    const slots = await request(
      `/api/public/availability?serviceId=${s1.id}&professionalId=${staff.id}&date=${date}`,
    );
    assert(slots.data.slots.includes('20:00'));
  });
  await t.test('personal no puede modificar catálogo ni resolver pagos', async () => {
    await db.user.create({
      data: {
        name: 'Personal',
        email: 'staff@example.com',
        role: 'STAFF',
        passwordHash: await bcrypt.hash('test-password-123', 4),
      },
    });
    const login = await request('/api/auth/login', {
      email: 'staff@example.com',
      password: 'test-password-123',
    });
    assert.equal(
      (
        await request(
          '/api/admin/services',
          { name: 'Otro', price: 5000, durationMin: 30 },
          login.data.accessToken,
        )
      ).status,
      403,
    );
  });
  await t.test('recuperación utiliza token de un solo uso', async () => {
    await request('/api/auth/forgot-password', { email: 'staff@example.com' });
    const user = await db.user.findUniqueOrThrow({ where: { email: 'staff@example.com' } });
    assert(user.resetTokenHash);
    const job = await db.emailJob.findFirstOrThrow({ where: { key: { startsWith: 'reset:' } } });
    const resetToken = job.text.match(/reset=([a-f0-9]{64})/)?.[1];
    assert(resetToken);
    assert.equal(
      (
        await request('/api/auth/reset-password', {
          token: resetToken,
          password: 'a-new-password-123',
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await request('/api/auth/reset-password', {
          token: resetToken,
          password: 'a-new-password-123',
        })
      ).status,
      401,
    );
  });
  await t.test('cerrar sesión revoca el JWT', async () => {
    await request('/api/auth/logout', {}, token);
    assert.equal((await request('/api/admin/reservations', undefined, token)).status, 401);
  });
});
