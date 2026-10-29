import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { MercadoPagoConfig, Payment, Preference, WebhookSignatureValidator } from 'mercadopago';
import { checkoutReturnConfig } from '../../common/web-url';
import { Database, lock } from '../../common/database';
import { BookingTokenDto } from '../../common/dtos';
import { busyWhere, effectiveStatus } from '../../common/time';
import { AdminGuard, AuthModule, OwnerGuard } from '../auth/auth';
import {
  notifyReservation,
  ReservationsModule,
  ReservationsService,
} from '../reservations/reservations';
import { Reservation } from '@prisma/client';
export interface ProviderPayment {
  id: string;
  externalReference: string;
  status: string;
  amount: number;
  currency: string;
  updatedAt: Date;
}
@Injectable()
export class PaymentProvider {
  private client() {
    if (!process.env.ACCESS_TOKEN) throw new ServiceUnavailableException('Pagos no configurados');
    return new MercadoPagoConfig({
      accessToken: process.env.ACCESS_TOKEN,
      options: { timeout: 10000 },
    });
  }
  async checkout(r: Reservation) {
    const returnConfig = checkoutReturnConfig();
    const preference = await new Preference(this.client()).create({
      requestOptions: { idempotencyKey: r.checkoutKey },
      body: {
        items: [
          {
            id: r.serviceId,
            title: r.serviceName,
            quantity: 1,
            unit_price: r.priceSnapshot,
            currency_id: 'CLP',
          },
        ],
        external_reference: r.legacyReference || r.id,
        payer: { email: r.customerEmail },
        ...returnConfig,
        notification_url: process.env.MP_WEBHOOK_URL,
        expires: true,
        expiration_date_to: r.expiresAt.toISOString(),
      },
    });
    if (!preference.id || !preference.init_point)
      throw new BadGatewayException('Preferencia inválida');
    return { preferenceId: preference.id, checkoutUrl: preference.init_point };
  }
  async get(id: string): Promise<ProviderPayment> {
    const p = await new Payment(this.client()).get({ id });
    return {
      id: String(p.id),
      externalReference: p.external_reference || '',
      status: p.status || 'pending',
      amount: Number(p.transaction_amount),
      currency: p.currency_id || '',
      updatedAt: new Date(p.date_last_updated || p.date_created || ''),
    };
  }
  async search(reference: string) {
    const result = await new Payment(this.client()).search({
      options: {
        external_reference: reference,
        limit: 100,
        sort: 'date_last_updated',
        criteria: 'desc',
      },
    });
    return (result.results || []).map((p) => String(p.id));
  }
}
@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    private db: Database,
    private reservations: ReservationsService,
    private provider: PaymentProvider,
  ) {}
  onModuleInit() {
    if (process.env.BACKGROUND_JOBS !== 'false')
      this.timer = setInterval(() => void this.tick(), 60_000);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async checkout(id: string, token: string) {
    await this.reservations.owned(id, token);
    const leaseToken = randomUUID();
    const r = await this.db.$transaction(async (tx) => {
      await lock(tx, 'agenda');
      const r = await tx.reservation.findUniqueOrThrow({ where: { id } });
      if (effectiveStatus(r) !== 'PENDING_PAYMENT')
        throw new ConflictException('Reserva vencida o no pagable');
      if (r.checkoutUrl) return r;
      if (r.checkoutLeaseUntil && r.checkoutLeaseUntil > new Date())
        throw new ConflictException('Estamos iniciando el pago. Reintenta en unos segundos');
      await tx.reservation.update({
        where: { id },
        data: {
          checkoutLeaseUntil: new Date(Date.now() + 30_000),
          checkoutLeaseToken: leaseToken,
          checkoutStartedAt: r.checkoutStartedAt || new Date(),
        },
      });
      return r;
    });
    if (r.checkoutUrl) return { checkoutUrl: r.checkoutUrl };
    try {
      const result = await this.provider.checkout(r);
      const payable = await this.db.$transaction(async (tx) => {
        await lock(tx, 'agenda');
        const current = await tx.reservation.findUniqueOrThrow({ where: { id } });
        if (current.checkoutLeaseToken !== leaseToken) return false;
        const payable = effectiveStatus(current) === 'PENDING_PAYMENT';
        // Keep the external preference for reconciliation, even when no longer payable.
        await tx.reservation.update({
          where: { id },
          data: { ...result, checkoutLeaseUntil: null, checkoutLeaseToken: null },
        });
        return payable;
      });
      if (!payable) throw new ConflictException('Reserva vencida o no pagable');
      return { checkoutUrl: result.checkoutUrl };
    } catch (e) {
      await this.db.reservation.updateMany({
        where: { id, checkoutLeaseToken: leaseToken },
        data: { checkoutLeaseUntil: null, checkoutLeaseToken: null },
      });
      if (e instanceof ServiceUnavailableException || e instanceof ConflictException) throw e;
      throw new BadGatewayException(
        'No se pudo iniciar el pago. Puedes reintentar la misma reserva',
      );
    }
  }

  async apply(p: ProviderPayment) {
    if (
      !/^(?:[0-9a-f-]{36}:)?[0-9a-f-]{36}$/i.test(p.externalReference) ||
      !Number.isFinite(p.updatedAt.getTime())
    )
      return { ignored: true };
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'agenda');
      const r = await tx.reservation.findUnique({
        where: p.externalReference.includes(':')
          ? { legacyReference: p.externalReference }
          : { id: p.externalReference },
      });
      if (!r) return { ignored: true };
      const prior = await tx.paymentAttempt.findUnique({ where: { id: p.id } });
      if (prior && prior.reservationId !== r.id)
        throw new ConflictException('Pago asociado a otra reserva');
      if (prior && prior.providerUpdatedAt >= p.updatedAt) return { duplicate: true };
      if (
        prior &&
        prior.status === p.status &&
        Number(prior.amount) === p.amount &&
        prior.currency === p.currency
      ) {
        await tx.paymentAttempt.update({
          where: { id: p.id },
          data: { providerUpdatedAt: p.updatedAt },
        });
        return { duplicate: true };
      }
      const mismatch = p.amount !== r.priceSnapshot || p.currency !== 'CLP';
      const holds =
        r.status === 'CONFIRMED' ||
        (r.status === 'PAYMENT_REVIEW' && r.reviewHoldsSlot) ||
        effectiveStatus(r) === 'PENDING_PAYMENT';
      const isReversed = ['refunded', 'charged_back'].includes(p.status);
      const isPrimary = r.approvedPaymentId === p.id;
      const reviewRequired =
        p.status === 'approved'
          ? mismatch ||
            r.status === 'CANCELLED' ||
            effectiveStatus(r) !== 'PENDING_PAYMENT' ||
            Boolean(prior)
          : isReversed
            ? isPrimary && r.status !== 'CANCELLED'
            : false;
      await tx.paymentAttempt.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          reservationId: r.id,
          status: p.status,
          reviewRequired,
          amount: p.amount,
          currency: p.currency,
          providerUpdatedAt: p.updatedAt,
        },
        update: {
          status: p.status,
          amount: p.amount,
          currency: p.currency,
          providerUpdatedAt: p.updatedAt,
          reviewRequired,
        },
      });
      if (
        mismatch &&
        (!prior || Number(prior.amount) !== p.amount || prior.currency !== p.currency)
      ) {
        await tx.auditEvent.create({
          data: {
            actorId: 'provider',
            action: 'AMOUNT_MISMATCH',
            reservationId: r.id,
            note: `Pago ${p.id} (${p.status}): ${p.amount} ${p.currency}; esperado ${r.priceSnapshot} CLP`,
          },
        });
      }
      if (p.status === 'approved' && r.status === 'CANCELLED') {
        await tx.auditEvent.create({
          data: {
            actorId: 'provider',
            action: 'LATE_PAYMENT',
            reservationId: r.id,
            note: `Revisar devolución manual del pago ${p.id}`,
          },
        });
        return { review: true };
      }
      if (p.status === 'approved' && mismatch) {
        await tx.reservation.update({
          where: { id: r.id },
          data: {
            status: 'PAYMENT_REVIEW',
            reviewHoldsSlot: holds,
          },
        });
        await notifyReservation(tx, r, 'Pago con importe inconsistente en revisión');
        return { review: true };
      }
      if (p.status === 'approved') {
        if (r.approvedPaymentId && r.approvedPaymentId !== p.id) {
          await tx.reservation.update({
            where: { id: r.id },
            data: { status: 'PAYMENT_REVIEW', reviewHoldsSlot: holds },
          });
          await tx.auditEvent.create({
            data: {
              actorId: 'provider',
              action: 'DUPLICATE_PAYMENT',
              reservationId: r.id,
              note: `Revisar devolución del pago ${p.id}`,
            },
          });
          await notifyReservation(tx, r, 'Pago duplicado en revisión');
          return { review: true };
        }
        if (r.approvedPaymentId === p.id) return { received: true };
        let status: 'CONFIRMED' | 'PAYMENT_REVIEW' = 'PAYMENT_REVIEW';
        if (effectiveStatus(r) === 'PENDING_PAYMENT') {
          const overlap = {
            professionalId: r.professionalId,
            startsAt: { lt: r.endsAt },
            endsAt: { gt: r.startsAt },
          };
          const clash = await tx.reservation.findFirst({
            where: { ...overlap, id: { not: r.id }, ...busyWhere() },
          });
          const block = await tx.scheduleBlock.findFirst({ where: overlap });
          if (!clash && !block) status = 'CONFIRMED';
        }
        await tx.reservation.update({
          where: { id: r.id },
          data: {
            status,
            approvedPaymentId: p.id,
            reviewHoldsSlot: status === 'PAYMENT_REVIEW' && holds,
          },
        });
        await tx.paymentAttempt.update({
          where: { id: p.id },
          data: { reviewRequired: status === 'PAYMENT_REVIEW' },
        });
        if (status === 'PAYMENT_REVIEW')
          await tx.auditEvent.create({
            data: {
              actorId: 'provider',
              action: 'PAYMENT_REVIEW',
              reservationId: r.id,
              note: `Revisar pago ${p.id}; horario retenido: ${holds}`,
            },
          });
        await notifyReservation(
          tx,
          r,
          status === 'CONFIRMED' ? 'Reserva confirmada' : 'Pago en revisión',
        );
      } else if (isReversed) {
        await tx.auditEvent.create({
          data: {
            actorId: 'provider',
            action: p.status === 'refunded' ? 'REFUND_RECORDED' : 'CHARGEBACK_RECORDED',
            reservationId: r.id,
            note: `Pago ${p.id}: ${p.status}`,
          },
        });
        if (r.status === 'CANCELLED') {
          // Expected outcome of a cancellation: record it, do not reopen the case.
          await notifyReservation(tx, r, 'Devolución registrada');
        } else if (isPrimary) {
          await tx.reservation.update({
            where: { id: r.id },
            data: { status: 'PAYMENT_REVIEW', reviewHoldsSlot: holds },
          });
          await notifyReservation(tx, r, 'Devolución o contracargo en revisión');
        } else {
          if (r.status === 'PAYMENT_REVIEW' && r.reviewHoldsSlot && r.approvedPaymentId) {
            const validPrimary = await tx.paymentAttempt.findFirst({
              where: {
                id: r.approvedPaymentId,
                reservationId: r.id,
                status: 'approved',
                amount: r.priceSnapshot,
                currency: 'CLP',
                reviewRequired: false,
              },
            });
            const pendingReviews = await tx.paymentAttempt.count({
              where: { reservationId: r.id, reviewRequired: true },
            });
            const overlap = {
              professionalId: r.professionalId,
              startsAt: { lt: r.endsAt },
              endsAt: { gt: r.startsAt },
            };
            const clash = await tx.reservation.findFirst({
              where: { ...overlap, id: { not: r.id }, ...busyWhere() },
            });
            const block = await tx.scheduleBlock.findFirst({ where: overlap });
            if (validPrimary && pendingReviews === 0 && !clash && !block) {
              await tx.reservation.update({
                where: { id: r.id },
                data: { status: 'CONFIRMED', reviewHoldsSlot: false },
              });
            }
          }
          await notifyReservation(tx, r, 'Devolución registrada');
        }
      }
      return { received: true };
    });
  }
  async reconcile(id: string) {
    const r = await this.db.reservation.findUnique({ where: { id } });
    if (!r) throw new NotFoundException();
    const ids = await this.provider.search(r.legacyReference || id);
    // One failing payment must not hide the others (e.g. a later approved retry).
    let failed = 0;
    for (const paymentId of ids) {
      try {
        await this.apply(await this.provider.get(paymentId));
      } catch {
        failed++;
        console.error(
          JSON.stringify({ event: 'payment_apply_failed', reservationId: id, paymentId }),
        );
      }
    }
    if (failed && failed === ids.length)
      throw new BadGatewayException('No se pudo conciliar ningún pago');
    return { checked: ids.length, failed };
  }
  private async tick() {
    if (this.running || !process.env.ACCESS_TOKEN) return;
    this.running = true;
    try {
      // Oldest checked records rotate through the queue, including late approvals and refunds.
      const rows = await this.db.reservation.findMany({
        where: {
          OR: [{ preferenceId: { not: null } }, { checkoutStartedAt: { not: null } }],
          createdAt: { gt: new Date(Date.now() - 180 * 86400_000) },
        },
        orderBy: { updatedAt: 'asc' },
        take: 10,
      });
      for (const r of rows) {
        try {
          await this.reconcile(r.id);
          await this.db.reservation.update({
            where: { id: r.id },
            data: { updatedAt: new Date() },
          });
        } catch {
          console.error(JSON.stringify({ event: 'reconciliation_failed', reservationId: r.id }));
        }
      }
    } finally {
      this.running = false;
    }
  }
  async webhook(
    id: string,
    signature: string,
    requestId: string,
    body: { type?: string; data?: { id?: string | number } },
    type?: string,
  ) {
    const secret = process.env.MP_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Webhook no configurado');
    if (!/^\d{1,30}$/.test(id || '') || (body.data?.id && String(body.data.id) !== id))
      throw new UnauthorizedException('Notificación inválida');
    try {
      WebhookSignatureValidator.validate({
        xSignature: signature,
        xRequestId: requestId,
        dataId: id,
        secret,
        toleranceSeconds: 1200,
      });
    } catch {
      throw new UnauthorizedException('Firma inválida');
    }
    if ((type || body.type) !== 'payment') return { ignored: true };
    return this.apply(await this.provider.get(id));
  }
}
@Controller()
export class PaymentsController {
  constructor(
    private payments: PaymentsService,
    private db: Database,
  ) {}
  @Get('api/public/payments/config') config() {
    return { returnUrl: checkoutReturnConfig().back_urls.success };
  }
  @Post('api/public/reservations/:id/checkout') checkout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BookingTokenDto,
    @Headers('origin') origin: string,
  ) {
    if (origin !== new URL(checkoutReturnConfig().back_urls.success).origin)
      throw new BadRequestException(
        'Abre la reserva desde la URL pública del salón para conservarla al volver del pago',
      );
    return this.payments.checkout(id, dto.bookingToken);
  }
  @Post('api/webhooks/mercadopago')
  @HttpCode(200)
  webhook(
    @Query('data.id') id: string,
    @Query('type') type: string,
    @Headers('x-signature') signature: string,
    @Headers('x-request-id') requestId: string,
    @Body() body: any,
  ) {
    return this.payments.webhook(id, signature, requestId, body || {}, type);
  }
  @Post('api/admin/reservations/:id/reconcile')
  @UseGuards(AdminGuard, OwnerGuard)
  reconcile(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.reconcile(id);
  }
  @Get('api/admin/reservations/:id/payments')
  @UseGuards(AdminGuard, OwnerGuard)
  async attempts(@Param('id', ParseUUIDPipe) id: string) {
    const attempts = await this.db.paymentAttempt.findMany({
      where: { reservationId: id },
      orderBy: { providerUpdatedAt: 'desc' },
    });
    return attempts.map((attempt) => ({ ...attempt, amount: Number(attempt.amount) }));
  }
  @Get('api/admin/reservations/:id/audit')
  @UseGuards(AdminGuard, OwnerGuard)
  audit(@Param('id', ParseUUIDPipe) id: string) {
    return this.db.auditEvent.findMany({
      where: { reservationId: id },
      orderBy: { createdAt: 'desc' },
    });
  }
}
@Module({
  imports: [AuthModule, ReservationsModule],
  controllers: [PaymentsController],
  providers: [PaymentProvider, PaymentsService],
  exports: [PaymentsService, PaymentProvider],
})
export class PaymentsModule {}
