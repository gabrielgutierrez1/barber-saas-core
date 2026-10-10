import { NestFactory } from '@nestjs/core';
import { configureApp,requireEnv } from '../../../packages/common/src/bootstrap';
import { GatewayModule } from './module';
import { tenantHeader } from '../../../packages/common/src/tenant-context';
async function main(){
 requireEnv('JWT_SECRET');requireEnv('INTERNAL_API_KEY');
 const app=await NestFactory.create(GatewayModule,{rawBody:true});configureApp(app);
 app.use((req:{path:string;headers:Record<string,string|undefined>;tenantId?:string},res:any,next:(error?:unknown)=>void)=>{
  if((req as any).method==='OPTIONS'||req.path==='/health'||req.path==='/api/webhooks/mercadopago')return next();
  try{req.tenantId=tenantHeader(req.headers['x-tenant-id']);next();}catch(error){next(error);}
 });
 const origins=(process.env.CORS_ORIGINS||'http://localhost:3000').split(',').map(v=>v.trim());
 app.enableCors({origin:origins,methods:['GET','POST','PATCH','OPTIONS'],allowedHeaders:['Content-Type','Authorization','x-tenant-id'],maxAge:600});
 await app.listen(4000,'0.0.0.0');
}
main().catch(e=>{console.error(e);process.exit(1)});
