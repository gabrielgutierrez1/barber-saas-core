ALTER TABLE "Professional" ADD COLUMN "bio" TEXT NOT NULL DEFAULT '', ADD COLUMN "photoUrl" TEXT NOT NULL DEFAULT '', ADD COLUMN "specialties" TEXT NOT NULL DEFAULT '';
CREATE TABLE "SiteContent" (
 "id" INTEGER NOT NULL DEFAULT 1 PRIMARY KEY,
 "address" TEXT NOT NULL DEFAULT '', "about" TEXT NOT NULL DEFAULT '',
 "cancellationPolicy" TEXT NOT NULL DEFAULT '', "privacyPolicy" TEXT NOT NULL DEFAULT '',
 "faqs" JSONB NOT NULL DEFAULT '[]', "gallery" JSONB NOT NULL DEFAULT '[]'
);
INSERT INTO "SiteContent" ("id") VALUES (1);
CREATE TABLE "BookingAccess" ("tokenHash" TEXT PRIMARY KEY, "reservationId" UUID NOT NULL REFERENCES "Reservation"("id") ON DELETE CASCADE, "expiresAt" TIMESTAMPTZ(3) NOT NULL);
CREATE INDEX "BookingAccess_expiresAt_idx" ON "BookingAccess"("expiresAt");
