ALTER TABLE "Reservation"
  ADD COLUMN "reviewHoldsSlot" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "checkoutLeaseToken" UUID,
  ADD COLUMN "checkoutStartedAt" TIMESTAMPTZ(3);
ALTER TABLE "PaymentAttempt"
  ALTER COLUMN "amount" TYPE DECIMAL(20,6),
  ADD COLUMN "reviewRequired" BOOLEAN NOT NULL DEFAULT false;
-- Preserve historical holds, except where a confirmed replacement already owns the slot.
UPDATE "Reservation" r SET "reviewHoldsSlot" = true
WHERE r.status = 'PAYMENT_REVIEW' AND r."approvedPaymentId" IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM "Reservation" other WHERE other.id <> r.id
  AND other."professionalId" = r."professionalId" AND other.status = 'CONFIRMED'
  AND other."startsAt" < r."endsAt" AND other."endsAt" > r."startsAt");
UPDATE "PaymentAttempt" p SET "reviewRequired" = true
FROM "Reservation" r WHERE p."reservationId" = r.id AND p.status = 'approved'
AND r.status IN ('CANCELLED', 'PAYMENT_REVIEW', 'EXPIRED');
UPDATE "Reservation" SET "checkoutStartedAt" = "createdAt"
WHERE "preferenceId" IS NOT NULL OR "checkoutLeaseUntil" IS NOT NULL;
