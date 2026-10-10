CREATE TABLE "Tenant" (
 "id" UUID NOT NULL,
 "slug" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "description" TEXT,
 "logoUrl" TEXT,
 "primaryColor" TEXT NOT NULL DEFAULT '#c48860',
 "timeZone" TEXT NOT NULL DEFAULT 'America/Santiago',
 "openingHour" INTEGER NOT NULL DEFAULT 9,
 "closingHour" INTEGER NOT NULL DEFAULT 19,
 "active" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE TABLE "TenantDatabase" (
 "id" UUID NOT NULL,
 "tenantId" UUID NOT NULL,
 "service" TEXT NOT NULL,
 "connectionUrl" TEXT NOT NULL,
 CONSTRAINT "TenantDatabase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TenantDatabase_tenantId_service_key" ON "TenantDatabase"("tenantId","service");
ALTER TABLE "TenantDatabase" ADD CONSTRAINT "TenantDatabase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
