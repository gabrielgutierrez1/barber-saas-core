import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { TestContext } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';

/** Only the randomly created schema is removed, never public or an existing schema. */
export async function testApp(t: TestContext) {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error('Define TEST_DATABASE_URL de una base descartable');
  const url = new URL(process.env.TEST_DATABASE_URL);
  if (!/(^|_)test($|_)/.test(url.pathname.slice(1)))
    throw new Error('TEST_DATABASE_URL debe identificar una base con nombre test');
  const schema = `smtp_test_${randomUUID().replaceAll('-', '')}`;
  url.searchParams.set('schema', schema);
  const databaseUrl = url.href;
  const admin = new PrismaClient({ datasourceUrl: databaseUrl });
  let app: INestApplication | undefined;
  t.after(async () => {
    await app?.close();
    try {
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await admin.$disconnect();
    }
  });
  execFileSync(
    process.execPath,
    [
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--schema',
      'backend/prisma/schema.prisma',
    ],
    {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
      timeout: 30_000,
    },
  );
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = 'test-only-secret-32-characters-long';
  process.env.BACKGROUND_JOBS = 'false';
  process.env.PUBLIC_WEB_URL = 'http://localhost:3000';
  // No production payment credentials are needed by these tests.
  delete process.env.ACCESS_TOKEN;
  const { AppModule, ApiErrors } = await import('../../dist/app.js');
  const { Database } = await import('../../dist/common/database.js');
  const { NotificationsService } = await import(
    '../../dist/modules/notifications/notifications.js'
  );
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiErrors());
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const db = app.get(Database);
  await db.salon.create({
    data: {
      name: 'Salón SMTP & Spa',
      timeZone: 'America/Santiago',
      contactEmail: 'salon@example.test',
      contactPhone: '+56 9 1234 5678',
      workDays: [1, 2, 3, 4, 5, 6, 7],
      openingHour: 0,
      closingHour: 24,
    },
  });
  const request = async (path: string, body: unknown) => {
    const response = await fetch(`${base}/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    return { status: response.status, data: await response.json() };
  };
  return { app, db, worker: app.get(NotificationsService), request };
}
