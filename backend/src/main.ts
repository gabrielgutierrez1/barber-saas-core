import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule, ApiErrors } from './app';
async function main() {
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'PUBLIC_WEB_URL'])
    if (!process.env[key] || process.env[key]!.startsWith('CAMBIAR_'))
      throw new Error(`Configura ${key}`);
  if (process.env.JWT_SECRET!.length < 32) throw new Error('JWT_SECRET requiere 32 caracteres');
  const web = new URL(process.env.PUBLIC_WEB_URL!);
  if (!['http:', 'https:'].includes(web.protocol)) throw new Error('PUBLIC_WEB_URL inválida');
  if (process.env.MP_WEBHOOK_URL && new URL(process.env.MP_WEBHOOK_URL).protocol !== 'https:')
    throw new Error('MP_WEBHOOK_URL requiere HTTPS');
  if (process.env.ACCESS_TOKEN && (!process.env.MP_WEBHOOK_SECRET || !process.env.MP_WEBHOOK_URL))
    throw new Error('Configura firma y URL de webhooks antes de activar pagos');
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.use((_req: any, res: any, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiErrors());
  app.enableCors({
    origin: web.origin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 4000), '0.0.0.0');
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Error de inicio');
  process.exit(1);
});
