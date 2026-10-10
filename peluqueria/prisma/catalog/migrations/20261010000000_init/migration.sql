CREATE TABLE "Service" (
 "id" UUID NOT NULL,
 "name" TEXT NOT NULL,
 "description" TEXT,
 "price" INTEGER NOT NULL,
 "durationMin" INTEGER NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "Service_pkey" PRIMARY KEY("id")
);
CREATE INDEX "Service_active_idx" ON "Service"("active");
