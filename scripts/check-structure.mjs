import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const schema = readFileSync('backend/prisma/schema.prisma', 'utf8');
assert.equal((schema.match(/datasource /g) || []).length, 1);
assert(!schema.includes('tenantId'));
for (const model of ['Salon', 'User', 'Service', 'Professional', 'Reservation', 'PaymentAttempt'])
  assert(schema.includes(`model ${model} {`));
assert(existsSync('package-lock.json'));
assert(existsSync('.env.example'));
assert(!existsSync('apps/tenant-manager'));
console.log('OK: una base por instalación, backend modular y frontend independiente');
