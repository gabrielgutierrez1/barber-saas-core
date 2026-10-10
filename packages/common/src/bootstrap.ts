import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
export function configureApp(app: INestApplication) {
  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true,
    transformOptions:{enableImplicitConversion:false}}));
  app.enableShutdownHooks();
}
export function internalOnly(app: INestApplication) {
  const secret = process.env.INTERNAL_API_KEY;
  if (!secret || secret.length < 32 || secret.startsWith('CAMBIAR_')) throw new Error('INTERNAL_API_KEY insegura');
  app.use((req: {path:string;headers:Record<string,string>}, res:{status:(code:number)=>{json:(v:object)=>void}}, next:()=>void) => {
    if(req.path === '/health') return next();
    const supplied = req.headers['x-internal-key'];
    // Secret comparison length is fixed here, compared in constant time.
    const crypto = require('node:crypto') as typeof import('node:crypto');
    const a=Buffer.from(String(supplied||'')); const b=Buffer.from(secret);
    if (a.length!==b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({message:'Unauthorized'});
    next();
  });
}
export function requireEnv(key:string) {
  const value=process.env[key];
  if(!value || value.startsWith('CAMBIAR_') || (['JWT_SECRET','INTERNAL_API_KEY'].includes(key) && value.length < 32)) throw new Error(`Variable requerida inválida: ${key}`);
  return value;
}
