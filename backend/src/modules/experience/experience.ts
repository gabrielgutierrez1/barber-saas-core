import { BadRequestException, Body, ConflictException, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { Database } from '../../common/database';
import { busyWhere, effectiveStatus } from '../../common/time';
import { AdminGuard, AdminRequest, AuthModule, hashToken, OwnerGuard } from '../auth/auth';
import { AgendaDto, ContentDto, CustomerQueryDto, NotificationSearchDto, PaymentSearchDto, ProfileDto, RecoverBookingDto } from './dtos';
const reservationSelect = { id: true, customerName: true, customerEmail: true, customerPhone: true, serviceName: true, serviceId: true, professionalId: true, professional: { select: { name: true } }, startsAt: true, endsAt: true, status: true, expiresAt: true, priceSnapshot: true } satisfies Prisma.ReservationSelect;
const emptyContent = { address: '', about: '', cancellationPolicy: '', privacyPolicy: '', faqs: [], gallery: [] };
export function dateRange(date: string, zone: string, days = 1) {
  const start = DateTime.fromISO(date, { zone }).startOf('day');
  if (!start.isValid) throw new BadRequestException('Fecha inválida');
  return { start, end: start.plus({ days }) };
}
@Controller('api/public')
export class PublicExperienceController {
  constructor(private db: Database) {}
  @Get('content') async content() { return (await this.db.siteContent.findUnique({ where: { id: 1 } })) || emptyContent; }
  @Post('reservations/recover')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async recover(@Body() dto: RecoverBookingDto) {
    const r = await this.db.reservation.findFirst({ where: { id: dto.reservationId, customerEmail: dto.email.trim().toLowerCase() } });
    if (r) {
      const token = randomBytes(32).toString('hex');
      await this.db.$transaction(async tx => {
        await tx.bookingAccess.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        await tx.bookingAccess.create({ data: { tokenHash: hashToken(token), reservationId: r.id, expiresAt: new Date(Date.now() + 30 * 60000) } });
        await tx.emailJob.create({ data: { key: `booking-access:${hashToken(token)}`, to: r.customerEmail, subject: 'Consultar tu reserva', text: `Abre ${process.env.PUBLIC_WEB_URL}/mi-reserva#id=${r.id}&token=${token}\nEste enlace privado vence en 30 minutos. No lo compartas.` } });
      });
    }
    return { message: 'Si los datos coinciden, recibirás un enlace privado por correo.' };
  }
}
@Controller('api/admin')
@UseGuards(AdminGuard)
export class ExperienceController {
  constructor(private db: Database) {}
  @Patch('content') @UseGuards(OwnerGuard)
  content(@Body() dto: ContentDto) {
    const data = { ...dto, faqs: dto.faqs.map(f => ({ ...f })), gallery: dto.gallery.map(g => ({ ...g })) };
    return this.db.siteContent.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  }
  @Get('profile') profile(@Req() req: AdminRequest) {
    return this.db.user.findUniqueOrThrow({ where: { id: req.admin.id }, select: { name: true, email: true, role: true } });
  }
  @Patch('profile') async updateProfile(@Req() req: AdminRequest, @Body() dto: ProfileDto) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: req.admin.id } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) throw new UnauthorizedException('Contraseña actual incorrecta');
    const email = dto.email.trim().toLowerCase();
    return this.db.user.update({ where: { id: user.id }, data: { name: dto.name.trim(), email, ...(email !== user.email ? { resetTokenHash: null, resetExpiresAt: null, sessionVersion: { increment: 1 } } : {}) }, select: { name: true, email: true } });
  }
  @Get('agenda') async agenda(@Query() dto: AgendaDto) {
    const salon = await this.db.salon.findUniqueOrThrow({ where: { id: 1 } });
    const { start, end } = dateRange(dto.date, salon.timeZone, dto.view === 'week' ? 7 : 1);
    const overlap = { startsAt: { lt: end.toJSDate() }, endsAt: { gt: start.toJSDate() }, ...(dto.professionalId ? { professionalId: dto.professionalId } : {}) };
    const [reservations, blocks, professionals] = await Promise.all([
      this.db.reservation.findMany({ where: { ...overlap, ...busyWhere() }, select: reservationSelect, orderBy: { startsAt: 'asc' } }),
      this.db.scheduleBlock.findMany({ where: overlap, include: { professional: { select: { name: true } } }, orderBy: { startsAt: 'asc' } }),
      this.db.professional.findMany({ where: { ...(dto.professionalId ? { id: dto.professionalId } : {}) }, select: { id: true, name: true, active: true } }),
    ]);
    return { reservations, blocks, professionals, timeZone: salon.timeZone };
  }
  @Get('dashboard') @UseGuards(OwnerGuard) async dashboard() {
    const salon = await this.db.salon.findUniqueOrThrow({ where: { id: 1 } });
    const start = DateTime.now().setZone(salon.timeZone).startOf('day'), end = start.plus({ days: 1 });
    const [today, upcoming, review, payments, professionals, blocks] = await Promise.all([
      this.db.reservation.findMany({ where: { startsAt: { gte: start.toJSDate(), lt: end.toJSDate() }, ...busyWhere() }, select: reservationSelect }),
      this.db.reservation.findMany({ where: { startsAt: { gte: new Date() }, ...busyWhere() }, select: reservationSelect, take: 8, orderBy: { startsAt: 'asc' } }),
      this.db.reservation.count({ where: { status: 'PAYMENT_REVIEW' } }),
      this.db.paymentAttempt.aggregate({ where: { status: 'approved', currency: 'CLP', providerUpdatedAt: { gte: start.startOf('month').toJSDate() } }, _sum: { amount: true } }),
      this.db.professional.findMany({ where: { active: true } }),
      this.db.scheduleBlock.findMany({ where: { startsAt: { lt: end.toJSDate() }, endsAt: { gt: start.toJSDate() } } }),
    ]);
    // Count half-hour capacity after blocks, in the salon's local timezone.
    let capacityMinutes = 0, occupiedMinutes = 0;
    for (const p of professionals) {
      if (!salon.workDays.includes(start.weekday) || !p.workDays.includes(start.weekday)) continue;
      for (let minute = Math.max(salon.openingHour, p.openingHour) * 60; minute < Math.min(salon.closingHour, p.closingHour) * 60; minute += 30) {
        const a = start.plus({ minutes: minute }).toJSDate(), b = start.plus({ minutes: minute + 30 }).toJSDate();
        if (blocks.some(x => x.professionalId === p.id && x.startsAt < b && x.endsAt > a)) continue;
        capacityMinutes += 30;
        if (today.some(x => x.professionalId === p.id && x.startsAt < b && x.endsAt > a)) occupiedMinutes += 30;
      }
    }
    return { todayCount: today.length, review, approvedGrossMonth: payments._sum.amount || 0, capacityMinutes, occupiedMinutes, upcoming, timeZone: salon.timeZone };
  }
  @Get('customers') async customers(@Query() dto: CustomerQueryDto) {
    const where: Prisma.ReservationWhereInput = dto.q ? { OR: [{ customerName: { contains: dto.q, mode: 'insensitive' } }, { customerEmail: { contains: dto.q, mode: 'insensitive' } }, { customerPhone: { contains: dto.q } }] } : {};
    const groups = await this.db.reservation.groupBy({ by: ['customerEmail'], where, _count: { _all: true }, _max: { startsAt: true }, orderBy: { customerEmail: 'asc' }, skip: (dto.page - 1) * 25, take: 26 });
    const items = await Promise.all(groups.slice(0, 25).map(async g => ({ email: g.customerEmail, visits: g._count._all, lastBooking: g._max.startsAt, ...(await this.db.reservation.findFirst({ where: { customerEmail: g.customerEmail }, orderBy: { createdAt: 'desc' }, select: { customerName: true, customerPhone: true } })) })));
    return { items, page: dto.page, hasMore: groups.length > 25 };
  }
  @Get('customers/history') async history(@Query() dto: CustomerQueryDto) {
    if (!dto.email) throw new BadRequestException('Correo requerido');
    const where = { customerEmail: dto.email.trim().toLowerCase() };
    const [items, total] = await Promise.all([this.db.reservation.findMany({ where, select: reservationSelect, orderBy: { startsAt: 'desc' }, skip: (dto.page - 1) * 25, take: 25 }), this.db.reservation.count({ where })]);
    return { items: items.map(r => ({ ...r, status: effectiveStatus(r) })), total, page: dto.page, pageSize: 25 };
  }
  @Get('payments') @UseGuards(OwnerGuard) async payments(@Query() dto: PaymentSearchDto) {
    const where: Prisma.PaymentAttemptWhereInput = { ...(dto.status ? { status: dto.status } : {}), ...(dto.q ? { OR: [{ id: { contains: dto.q } }, { reservation: { customerName: { contains: dto.q, mode: 'insensitive' } } }, { reservation: { customerEmail: { contains: dto.q, mode: 'insensitive' } } }] } : {}) };
    const [items, total] = await Promise.all([this.db.paymentAttempt.findMany({ where, include: { reservation: { select: reservationSelect } }, orderBy: [{ providerUpdatedAt: 'desc' }, { id: 'asc' }], skip: (dto.page - 1) * 25, take: 25 }), this.db.paymentAttempt.count({ where })]);
    return { items, total, page: dto.page, pageSize: 25 };
  }
  @Get('notifications') @UseGuards(OwnerGuard) async notifications(@Query() dto: NotificationSearchDto) {
    const where: Prisma.EmailJobWhereInput = dto.status === 'sent' ? { sentAt: { not: null } } : dto.status === 'failed' ? { sentAt: null, attempts: { gte: 8 } } : dto.status === 'pending' ? { sentAt: null, attempts: { lt: 8 } } : {};
    const [items, total] = await Promise.all([this.db.emailJob.findMany({ where, select: { id: true, to: true, subject: true, attempts: true, availableAt: true, sentAt: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (dto.page - 1) * 25, take: 25 }), this.db.emailJob.count({ where })]);
    return { items, total, page: dto.page, pageSize: 25, smtpConfigured: Boolean(process.env.SMTP_HOST) };
  }
  @Post('notifications/:id/retry') @UseGuards(OwnerGuard) async retry(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.db.emailJob.updateMany({ where: { id, sentAt: null, attempts: { gte: 8 }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }], NOT: { OR: [{ key: { startsWith: 'reset:' } }, { key: { startsWith: 'booking-access:' } }] } }, data: { attempts: 0, availableAt: new Date(), leaseUntil: null } });
    if (!result.count) throw new ConflictException('Solo se reintentan correos fallidos de reservas. Para enlaces de acceso solicita uno nuevo.');
    return { ok: true };
  }
}
@Module({ imports: [AuthModule], controllers: [PublicExperienceController, ExperienceController] })
export class ExperienceModule {}
