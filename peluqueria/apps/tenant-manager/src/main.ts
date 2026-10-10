import { NestFactory } from '@nestjs/core';
import { configureApp, internalOnly, requireEnv } from '../../../packages/common/src/bootstrap';
import { TenantManagerModule } from './module';
async function main(){requireEnv('MANAGER_DATABASE_URL');const app=await NestFactory.create(TenantManagerModule);configureApp(app);internalOnly(app);await app.listen(4004,'0.0.0.0');}
main().catch(e=>{console.error(e);process.exit(1)});
