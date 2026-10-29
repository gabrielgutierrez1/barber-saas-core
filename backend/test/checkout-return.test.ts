import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Preference } from 'mercadopago';
import { PaymentProvider, PaymentsController } from '../dist/modules/payments/payments';
import { checkoutReturnConfig, publicWebUrl } from '../dist/common/web-url';
import {
  assertCheckoutOrigin,
  loadBookingStatus,
  readBooking,
} from '../../frontend/src/lib/booking-return';

test('Checkout Pro: HTTPS, URLs de retorno y protección del origen', async (t) => {
  const old = { ...process.env };
  t.after(() => {
    process.env = old;
  });
  process.env.PUBLIC_WEB_URL = 'https://salon.example.com';
  process.env.MP_WEBHOOK_URL = 'https://api.example.com/api/webhooks/mercadopago';
  process.env.ACCESS_TOKEN = 'TEST-placeholder';
  let body: any;
  t.mock.method(Preference.prototype, 'create', async (input: any) => {
    body = input;
    return { id: 'pref-test', init_point: 'https://www.mercadopago.cl/checkout/test' };
  });
  const reservation = {
    id: '1',
    serviceId: '2',
    serviceName: 'Corte',
    priceSnapshot: 10000,
    customerEmail: 'buyer@example.com',
    checkoutKey: 'same-key',
    expiresAt: new Date(Date.now() + 60000),
  };
  await new PaymentProvider().checkout(reservation as any);
  assert.equal(body.requestOptions.idempotencyKey, 'same-key');
  assert.equal(body.body.auto_return, 'approved');
  assert.deepEqual(
    body.body.back_urls,
    Object.fromEntries(
      ['success', 'failure', 'pending'].map((k) => [k, 'https://salon.example.com/resultado']),
    ),
  );
  assert.equal(body.body.notification_url, process.env.MP_WEBHOOK_URL);
  const controller = new PaymentsController({ checkout: () => 'ok' } as any, {} as any);
  assert.throws(
    () => controller.checkout('1', { bookingToken: 'x' }, 'http://localhost:3100'),
    /URL pública/,
  );
  assert.equal(controller.checkout('1', { bookingToken: 'x' }, 'https://salon.example.com'), 'ok');
  for (const invalid of [
    'http://localhost:3100',
    'https://localhost:3100',
    'https://127.0.0.1',
    'https://[::1]',
    'http://salon.example.com',
    'https://salon.local',
  ]) {
    process.env.PUBLIC_WEB_URL = invalid;
    assert.throws(() => checkoutReturnConfig(), /HTTPS público/);
    await assert.rejects(new PaymentProvider().checkout(reservation as any), /HTTPS público/);
  }
  assert.equal(publicWebUrl('http://localhost:3100').origin, 'http://localhost:3100');
  for (const invalid of [
    '',
    'not-url',
    'https://user:secret@salon.example.com',
    'https://salon.example.com/api',
    'https://salon.example.com/?token=x',
  ])
    assert.throws(() => publicWebUrl(invalid));
});

test('retorno conserva el token local y obtiene estado únicamente del backend', async (t) => {
  const booking = { id: '12345678-1234-1234-1234-123456789012', bookingToken: 'a'.repeat(64) };
  const storage = { getItem: () => JSON.stringify(booking) };
  assertCheckoutOrigin('https://salon.example.com/resultado', 'https://salon.example.com');
  assert.throws(() =>
    assertCheckoutOrigin('https://salon.example.com/resultado', 'http://localhost:3100'),
  );
  for (const returnedStatus of ['approved', 'rejected', 'pending']) {
    // Query params supplied by MP (or an attacker) never enter the status request.
    t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      assert.ok(url.endsWith(`/api/public/reservations/${booking.id}/status`));
      assert.ok(!url.includes(booking.bookingToken));
      assert.equal(init.method, 'POST');
      assert.deepEqual(JSON.parse(init.body as string), { bookingToken: booking.bookingToken });
      return new Response(JSON.stringify({ status: 'PENDING_PAYMENT' }));
    });
    const result = await loadBookingStatus<{ status: string }>(storage);
    assert.equal(result.status, 'PENDING_PAYMENT', returnedStatus);
    assert.deepEqual(readBooking(storage), booking);
    t.mock.restoreAll();
  }
  for (const raw of [null, '{', '{}', JSON.stringify({ ...booking, bookingToken: 'bad' })])
    assert.throws(() => readBooking({ getItem: () => raw }), /recuperar/);
  assert.throws(
    () =>
      readBooking({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    /recuperar/,
  );
});
