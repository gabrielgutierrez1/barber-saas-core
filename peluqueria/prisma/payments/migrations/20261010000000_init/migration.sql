CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED','PENDING','APPROVED','REJECTED','REFUNDED');
CREATE TABLE "Payment" (
 "id" UUID NOT NULL,
 "reservationId" UUID NOT NULL,
 "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
 "amount" INTEGER NOT NULL,
 "currency" TEXT NOT NULL DEFAULT 'CLP',
 "preferenceId" TEXT,
 "checkoutUrl" TEXT,
 "mpPaymentId" TEXT,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "Payment_pkey" PRIMARY KEY("id")
);
CREATE UNIQUE INDEX "Payment_reservationId_key" ON "Payment"("reservationId");
CREATE UNIQUE INDEX "Payment_mpPaymentId_key" ON "Payment"("mpPaymentId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
