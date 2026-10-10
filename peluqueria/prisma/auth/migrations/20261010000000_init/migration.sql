CREATE TYPE "UserRole" AS ENUM ('OWNER','STAFF');
CREATE TABLE "User" (
 "id" UUID NOT NULL,
 "email" TEXT NOT NULL,
 "passwordHash" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "role" "UserRole" NOT NULL DEFAULT 'OWNER',
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
