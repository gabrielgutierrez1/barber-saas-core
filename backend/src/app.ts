import {
  ArgumentsHost,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpException,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Database, DatabaseModule } from './common/database';
import { AuthModule } from './modules/auth/auth';
import { CatalogModule } from './modules/catalog/catalog';
import { ReservationsModule } from './modules/reservations/reservations';
import { PaymentsModule } from './modules/payments/payments';
import { NotificationsModule } from './modules/notifications/notifications';
import { ExperienceModule } from './modules/experience/experience';
import { Prisma } from '@prisma/client';
@Catch()
export class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (error instanceof HttpException)
      return res.status(error.getStatus()).json(error.getResponse());
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025')
        return res.status(404).json({ message: 'Registro no encontrado' });
      if (['P2002', 'P2003'].includes(error.code))
        return res
          .status(409)
          .json({ message: 'El registro ya existe o tiene referencias incompatibles' });
    }
    console.error(
      JSON.stringify({
        event: 'request_failed',
        kind: error instanceof Error ? error.name : 'unknown',
      }),
    );
    return res.status(500).json({ message: 'No se pudo procesar la solicitud' });
  }
}
@Controller()
class HealthController {
  constructor(private db: Database) {}
  @Get('health') async health() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { ok: true, service: 'salon-backend' };
    } catch {
      throw new ServiceUnavailableException('Base de datos no disponible');
    }
  }
}
@Module({
  imports: [
    DatabaseModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    CatalogModule,
    ExperienceModule,
    ReservationsModule,
    PaymentsModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
