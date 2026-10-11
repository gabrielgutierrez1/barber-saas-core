import test from 'node:test';
import assert from 'node:assert/strict';
import { busyWhere, effectiveStatus, localStart } from '../src/common/time';
test('el vencimiento es consistente y no altera reservas pagadas', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  assert.equal(effectiveStatus({ status: 'PENDING_PAYMENT', expiresAt: now }, now), 'EXPIRED');
  assert.equal(effectiveStatus({ status: 'CONFIRMED', expiresAt: now }, now), 'CONFIRMED');
});
test('valida fechas reales y respeta la zona del negocio', () => {
  assert.throws(() => localStart('2026-02-30', '10:00', 'America/Santiago'));
  assert.throws(() => localStart('2026-10-12', '10:00', 'Zona/Inexistente'));
  assert.equal(localStart('2026-10-12', '10:00', 'America/Santiago').toUTC().hour, 13);
});
test('una revisión con pago aprobado sigue ocupando el horario', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  assert.deepEqual(busyWhere(now).OR, [
    { status: 'CONFIRMED' },
    { status: 'PENDING_PAYMENT', expiresAt: { gt: now } },
    { status: 'PAYMENT_REVIEW', approvedPaymentId: { not: null } },
  ]);
});
