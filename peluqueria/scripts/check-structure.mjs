import { readFileSync,existsSync } from 'node:fs';
import assert from 'node:assert/strict';
for(const name of ['manager','catalog','reservations','payments','auth']){
 const src=readFileSync(`prisma/${name}/schema.prisma`,'utf8');
 assert(!src.includes('tenantId')||name==='manager',`Found shared tenantId in ${name}`);
 assert(existsSync(`prisma/${name}/migrations/20261010000000_init/migration.sql`));
}
const home=readFileSync('apps/web/src/app/page.tsx','utf8');
assert(!home.includes('Ver Barbería Central'));
const api=readFileSync('apps/web/src/lib/types.ts','utf8');
assert(api.includes("'x-tenant-id':tenantId"));
console.log('OK estructura aislada/white-label');
