import { NestFactory } from '@nestjs/core';
import { configureApp, internalOnly } from '../../../packages/common/src/bootstrap';
import { AuthModule } from './module';
import { TenantMiddleware } from '../../../packages/common/src/tenant-context';
async function main(){const app=await NestFactory.create(AuthModule);configureApp(app);internalOnly(app);const middleware=new TenantMiddleware();app.use((req:any,res:any,next:any)=>middleware.use(req,res,next));await app.listen(4005,'0.0.0.0');}
main().catch(e=>{console.error(e);process.exit(1)});
