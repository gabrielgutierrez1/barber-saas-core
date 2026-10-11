import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
export function localStart(date: string, time: string, zone: string) {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone });
  if (!dt.isValid || dt.toFormat('yyyy-MM-dd') !== date || dt.toFormat('HH:mm') !== time)
    throw new BadRequestException('Fecha u hora inválida');
  return dt;
}
export function effectiveStatus<T extends { status: string; expiresAt: Date }>(
  r: T,
  now = new Date(),
): string {
  return r.status === 'PENDING_PAYMENT' && r.expiresAt <= now ? 'EXPIRED' : r.status;
}
export function busyWhere(now = new Date()) {
  return {
    OR: [
      { status: 'CONFIRMED' as const },
      { status: 'PENDING_PAYMENT' as const, expiresAt: { gt: now } },
      // A paying customer keeps the slot while the owner resolves the review
      // (duplicate payment, refund/chargeback or late approval).
      { status: 'PAYMENT_REVIEW' as const, approvedPaymentId: { not: null } },
    ],
  };
}
