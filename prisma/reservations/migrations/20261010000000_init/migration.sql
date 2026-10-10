CREATE TYPE "ReservationStatus" AS ENUM ('PENDING_PAYMENT','CONFIRMED','EXPIRED','CANCELLED','PAYMENT_REVIEW');
CREATE TABLE "Reservation" (
 "id" UUID NOT NULL,
 "serviceId" UUID NOT NULL,
 "serviceName" TEXT NOT NULL,
 "customerName" TEXT NOT NULL,
 "customerEmail" TEXT NOT NULL,
 "customerPhone" TEXT,
 "startsAt" TIMESTAMPTZ(3) NOT NULL,
 "endsAt" TIMESTAMPTZ(3) NOT NULL,
 "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
 "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "bookingTokenHash" TEXT NOT NULL,
 "priceSnapshot" INTEGER NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "Reservation_pkey" PRIMARY KEY("id")
);
CREATE INDEX "Reservation_serviceId_startsAt_endsAt_idx" ON "Reservation"("serviceId","startsAt","endsAt");
CREATE INDEX "Reservation_status_expiresAt_idx" ON "Reservation"("status","expiresAt");
