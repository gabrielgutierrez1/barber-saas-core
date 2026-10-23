import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  DefaultValuePipe,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { Database, lock, Tx } from '../../common/database';
import { BookingTokenDto, CreateReservationDto, DateQueryDto } from '../../common/dtos';
import { CustomerMoveDto, CustomerSlotsDto, MoveSlotsDto, MoveDto, ReviewDto } from '../../common/management-dtos';
import { busyWhere, effectiveStatus, localStart } from '../../common/time';
import { AdminGuard, AdminRequest, AuthModule, hashToken, OwnerGuard } from '../auth/auth';
import { SearchDto } from '../experience/dtos';
import { Prisma, Reservation } from '@prisma/client';
export async function notifyReservation(tx: Tx, r: Reservation, event: string) {
  const salon = await tx.salon.findUniqueOrThrow({ where: { id: 1 } });
  const date = DateTime.fromJSDate(r.startsAt).setZone(salon.timeZone).toFormat('dd/MM/yyyy HH:mm');
  await tx.emailJob.upsert({
    where: { key: `${r.id}:${event}` },
    update: {},
    create: {
      key: `${r.id}:${event}`,
      to: r.customerEmail,
      subject: `${salon.name}: ${event}`,
      text: `${r.customerName}, tu reserva de ${r.serviceName} para ${date}: ${event}.\nReferencia: ${r.id}\nContacto: ${salon.contactEmail} ${salon.contactPhone}`,
    },
  });
}
@Injectable()
export class ReservationsService {
  constructor(private db: Database) {}
  async context(tx: Tx, serviceId: string, professionalId: string) {
    const [salon, service, professional] = await Promise.all([
      tx.salon.findUniqueOrThrow({ where: { id: 1 } }),
      tx.service.findUnique({ where: { id: serviceId } }),
      tx.professional.findFirst({
        where: { id: professionalId, active: true, services: { some: { id: serviceId } } },
      }),
    ]);
    if (!service?.active || !professional)
      throw new NotFoundException('Servicio o profesional no disponible');
    return { salon, service, professional };
  }
  async interval(tx: Tx, serviceId: string, dto: MoveDto, duration?: number) {
    const context = await this.context(tx, serviceId, dto.professionalId),
      { salon, service, professional } = context;
    const start = localStart(dto.date, dto.time, salon.timeZone),
      minutes = duration ?? service.durationMin;
    const end = start.plus({ minutes });
    if (
      !salon.workDays.includes(start.weekday) ||
      !professional.workDays.includes(start.weekday) ||
      start.hour < Math.max(salon.openingHour, professional.openingHour) ||
      end.toMillis() >
        start
          .startOf('day')
          .plus({ hours: Math.min(salon.closingHour, professional.closingHour) })
          .toMillis() ||
      ![0, 30].includes(start.minute) ||
      start.toMillis() < Date.now() + 30 * 60_000 ||
      start.toMillis() > Date.now() + 90 * 86400_000
    )
      throw new BadRequestException('Fuera del horario o plazo de atención');
    return { ...context, startsAt: start.toJSDate(), endsAt: end.toJSDate() };
  }
  async assertFree(tx: Tx, professionalId: string, startsAt: Date, endsAt: Date, exclude?: string) {
    const overlap = { professionalId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } };
    if (
      (await tx.reservation.findFirst({
        where: { ...overlap, ...busyWhere(), ...(exclude ? { id: { not: exclude } } : {}) },
      })) ||
      (await tx.scheduleBlock.findFirst({ where: overlap }))
    )
      throw new ConflictException('El horario ya está ocupado');
  }
  async availability(dto: DateQueryDto, exclude?: Reservation) {
    const { salon, service, professional } = await this.context(
      this.db,
      dto.serviceId,
      dto.professionalId,
    );
    const base = localStart(dto.date, '00:00', salon.timeZone);
    const overlap = {
      professionalId: professional.id,
      startsAt: { lt: base.plus({ days: 1 }).toJSDate() },
      endsAt: { gt: base.toJSDate() },
    };
    const taken = [
      ...(await this.db.reservation.findMany({ where: { ...overlap, ...busyWhere(), ...(exclude ? { id: { not: exclude.id } } : {}) } })),
      ...(await this.db.scheduleBlock.findMany({ where: overlap })),
    ];
    const duration = exclude ? (exclude.endsAt.getTime() - exclude.startsAt.getTime()) / 60000 : service.durationMin;
    const slots: string[] = [];
    for (
      let h = Math.max(salon.openingHour, professional.openingHour) * 60;
      h + duration <= Math.min(salon.closingHour, professional.closingHour) * 60;
      h += 30
    ) {
      const time = `${Math.floor(h / 60)
        .toString()
        .padStart(2, '0')}:${(h % 60).toString().padStart(2, '0')}`;
      const start = localStart(dto.date, time, salon.timeZone),
        end = start.plus({ minutes: duration });
      if (
        !salon.workDays.includes(start.weekday) ||
        !professional.workDays.includes(start.weekday) ||
        start.toMillis() < Date.now() + 30 * 60_000 ||
        start.toMillis() > Date.now() + 90 * 86400_000
      )
        continue;
      if (!taken.some((r) => r.startsAt < end.toJSDate() && r.endsAt > start.toJSDate()))
        slots.push(time);
    }
    return { date: dto.date, timeZone: salon.timeZone, slots };
  }
  async create(dto: CreateReservationDto) {
    const bookingTokenHash = hashToken(dto.bookingToken);
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'agenda');
      const prior = await tx.reservation.findUnique({ where: { bookingTokenHash } });
      if (prior)
        return {
          id: prior.id,
          bookingToken: dto.bookingToken,
          status: effectiveStatus(prior),
          expiresAt: prior.expiresAt,
        };
      const { service, startsAt, endsAt } = await this.interval(tx, dto.serviceId, dto);
      await this.assertFree(tx, dto.professionalId, startsAt, endsAt);
      const r = await tx.reservation.create({
        data: {
          serviceId: service.id,
          professionalId: dto.professionalId,
          serviceName: service.name,
          customerName: dto.customerName.trim(),
          customerEmail: dto.customerEmail.trim().toLowerCase(),
          customerPhone: dto.customerPhone,
          bookingTokenHash,
          priceSnapshot: service.price,
          startsAt,
          endsAt,
          expiresAt: new Date(Date.now() + 15 * 60_000),
        },
      });
      return { id: r.id, bookingToken: dto.bookingToken, status: r.status, expiresAt: r.expiresAt };
    });
  }
  getForMove(id: string) { return this.db.reservation.findUniqueOrThrow({ where: { id } }); }
  async owned(id: string, token: string) {
    const r = await this.db.reservation.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Reserva no encontrada');
    const recovered = hashToken(token) === r.bookingTokenHash || await this.db.bookingAccess.findFirst({ where: { tokenHash: hashToken(token), reservationId: id, expiresAt: { gt: new Date() } } });
    if (!recovered)
      throw new NotFoundException('Reserva no encontrada');
    return r;
  }
  async status(id: string, token: string) {
    const r = await this.owned(id, token);
    const professional = await this.db.professional.findUniqueOrThrow({ where: { id: r.professionalId }, select: { name: true } });
    const salon = await this.db.salon.findUniqueOrThrow({ where: { id: 1 } });
    return { id: r.id, status: effectiveStatus(r), startsAt: r.startsAt, endsAt: r.endsAt, serviceName: r.serviceName, serviceId: r.serviceId, professionalId: r.professionalId, professional, priceSnapshot: r.priceSnapshot, timeZone: salon.timeZone, customerName: r.customerName };
  }
  async list(page: number, filters: SearchDto = { page: 1 }) {
    const where: Prisma.ReservationWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.professionalId ? { professionalId: filters.professionalId } : {}),
      ...(filters.q ? { OR: [{ customerName: { contains: filters.q, mode: 'insensitive' } }, { customerEmail: { contains: filters.q, mode: 'insensitive' } }] } : {}),
    };
    if (filters.date) {
      const salon = await this.db.salon.findUniqueOrThrow({ where: { id: 1 } });
      const start = localStart(filters.date, '00:00', salon.timeZone);
      where.startsAt = { gte: start.toJSDate(), lt: start.plus({ days: 1 }).toJSDate() };
    }
    if (page < 1 || page > 100000) throw new BadRequestException('Página inválida');
    const now = new Date();
    return this.db.$transaction(async (tx) => {
      await tx.reservation.updateMany({
        where: { status: 'PENDING_PAYMENT', expiresAt: { lte: now } },
        data: { status: 'EXPIRED' },
      });
      const [items, total, confirmed, review] = await Promise.all([
        tx.reservation.findMany({
          where,
          orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
          skip: (page - 1) * 25,
          take: 25,
          select: {
            id: true,
            customerName: true,
            customerEmail: true,
            customerPhone: true,
            startsAt: true,
            endsAt: true,
            status: true,
            priceSnapshot: true,
            serviceName: true,
            professionalId: true,
            service: { select: { id: true, name: true } },
            professional: { select: { name: true } },
          },
        }),
        tx.reservation.count({ where }),
        tx.reservation.count({ where: { ...where, status: 'CONFIRMED' } }),
        tx.reservation.count({ where: { ...where, status: 'PAYMENT_REVIEW' } }),
      ]);
      return { items, total, confirmed, review, page, pageSize: 25 };
    });
  }
  async cancel(id: string, actor: string) {
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'agenda');
      const r = await tx.reservation.findUniqueOrThrow({ where: { id } });
      if (r.status === 'CANCELLED') return { ok: true };
      await tx.reservation.update({ where: { id }, data: { status: 'CANCELLED' } });
      await tx.emailJob.deleteMany({
        where: { key: { startsWith: `reminder:${id}:` }, sentAt: null },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor,
          action: 'CANCEL',
          reservationId: id,
          note: r.approvedPaymentId
            ? 'Requiere revisar devolución en Mercado Pago'
            : 'Sin pago aprobado registrado',
        },
      });
      await notifyReservation(
        tx,
        r,
        'Reserva cancelada. Si pagaste, el salón coordinará la devolución',
      );
      return { ok: true };
    });
  }
  async move(id: string, dto: MoveDto, actor: string) {
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'agenda');
      const r = await tx.reservation.findUniqueOrThrow({ where: { id } });
      if (r.status !== 'CONFIRMED')
        throw new ConflictException('Solo se reprograman reservas confirmadas');
      const duration = (r.endsAt.getTime() - r.startsAt.getTime()) / 60_000;
      const { startsAt, endsAt } = await this.interval(tx, r.serviceId, dto, duration);
      await this.assertFree(tx, dto.professionalId, startsAt, endsAt, id);
      const updated = await tx.reservation.update({
        where: { id },
        data: { startsAt, endsAt, professionalId: dto.professionalId },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor,
          action: 'MOVE',
          reservationId: id,
          note: `${r.startsAt.toISOString()} -> ${startsAt.toISOString()}`,
        },
      });
      await tx.emailJob.deleteMany({
        where: { key: { startsWith: `reminder:${id}:` }, sentAt: null },
      });
      await notifyReservation(tx, updated, `Reprogramada ${startsAt.toISOString()}`);
      return { ok: true };
    });
  }
  async review(id: string, dto: ReviewDto, actor: string) {
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'agenda');
      const r = await tx.reservation.findUniqueOrThrow({ where: { id } });
      if (r.status !== 'PAYMENT_REVIEW')
        throw new ConflictException('La reserva no está en revisión');
      if (dto.status === 'CONFIRMED') {
        if (
          !r.approvedPaymentId ||
          !(await tx.paymentAttempt.findFirst({
            where: { id: r.approvedPaymentId, status: 'approved' },
          }))
        )
          throw new ConflictException('No hay un pago aprobado vigente');
        if (r.startsAt <= new Date()) throw new ConflictException('Revisa una fecha futura');
        await this.assertFree(tx, r.professionalId, r.startsAt, r.endsAt, id);
      }
      await tx.reservation.update({ where: { id }, data: { status: dto.status } });
      await tx.auditEvent.create({
        data: { actorId: actor, action: `REVIEW_${dto.status}`, reservationId: id, note: dto.note },
      });
      await notifyReservation(tx, r, `Revisión resuelta: ${dto.status}`);
      return { ok: true };
    });
  }
}
@Controller('api/public')
export class PublicReservationsController {
  constructor(private service: ReservationsService) {}
  @Get('availability') availability(@Query() dto: DateQueryDto) {
    return this.service.availability(dto);
  }
  @Post('reservations') create(@Body() dto: CreateReservationDto) {
    return this.service.create(dto);
  }
  @Post('reservations/:id/status') status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BookingTokenDto,
  ) {
    return this.service.status(id, dto.bookingToken);
  }
  @Post('reservations/:id/move') async move(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CustomerMoveDto) {
    await this.service.owned(id, dto.bookingToken);
    return this.service.move(id, dto, 'customer');
  }
  @Post('reservations/:id/availability') async slots(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CustomerSlotsDto) {
    const r = await this.service.owned(id, dto.bookingToken);
    return this.service.availability({ serviceId: r.serviceId, professionalId: dto.professionalId, date: dto.date }, r);
  }
  @Post('reservations/:id/cancel') async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BookingTokenDto,
  ) {
    await this.service.owned(id, dto.bookingToken);
    return this.service.cancel(id, 'customer');
  }
}
@Controller('api/admin/reservations')
@UseGuards(AdminGuard)
export class AdminReservationsController {
  constructor(private service: ReservationsService) {}
  @Get() list(@Query() dto: SearchDto) {
    return this.service.list(dto.page, dto);
  }
  @Get(':id/availability') async slots(@Param('id', ParseUUIDPipe) id: string, @Query() dto: MoveSlotsDto) {
    const r = await this.service.getForMove(id);
    return this.service.availability({ serviceId: r.serviceId, ...dto }, r);
  }
  @Post(':id/cancel') cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: AdminRequest) {
    return this.service.cancel(id, req.admin.id);
  }
  @Post(':id/move') move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.move(id, dto, req.admin.id);
  }
  @Post(':id/review') @UseGuards(OwnerGuard) review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
    @Req() req: AdminRequest,
  ) {
    return this.service.review(id, dto, req.admin.id);
  }
}
@Module({
  imports: [AuthModule],
  controllers: [PublicReservationsController, AdminReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
