import { NestFactory } from '@nestjs/core';
import { configureApp,internalOnly } from '../../../packages/common/src/bootstrap';
import { TenantMiddleware } from '../../../packages/common/src/tenant-context';
import { PaymentsModule } from './module';
async function main(){
 const app=await NestFactory.create(PaymentsModule);configureApp(app);internalOnly(app);
 const middleware=new TenantMiddleware();app.use((req:any,res:any,next:any)=>middleware.use(req,res,next));
 await app.listen(4003,'0.0.0.0');
}
main().catch(e=>{console.error(e);process.exit(1)});
