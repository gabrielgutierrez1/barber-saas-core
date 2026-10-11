import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  ConflictException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { Database, lock } from '../../common/database';
import { CreateServiceDto, UpdateServiceDto } from '../../common/dtos';
import { BlockDto, ProfessionalDto, SalonDto } from '../../common/management-dtos';
import { AdminGuard, AuthModule, OwnerGuard } from '../auth/auth';
import { busyWhere } from '../../common/time';
@Controller('api/public')
export class PublicCatalogController {
  constructor(private db: Database) {}
  @Get('info') info() {
    return this.db.salon.findUniqueOrThrow({ where: { id: 1 } });
  }
  @Get('services') services() {
    return this.db.service.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } });
  }
  @Get('professionals') professionals() {
    return this.db.professional.findMany({
      where: { active: true },
      select: { id: true, name: true, services: { select: { id: true } } },
    });
  }
}
@Controller('api/admin')
@UseGuards(AdminGuard)
export class CatalogController {
  constructor(private db: Database) {}
  @Get('services') services() {
    return this.db.service.findMany({ orderBy: { createdAt: 'asc' } });
  }
  @Post('services') @UseGuards(OwnerGuard) create(@Body() dto: CreateServiceDto) {
    return this.db.service.create({ data: dto });
  }
  @Patch('services/:id') @UseGuards(OwnerGuard) update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.db.service.update({ where: { id }, data: dto });
  }
  @Patch('salon') @UseGuards(OwnerGuard) async salon(@Body() dto: SalonDto) {
    if (dto.openingHour >= dto.closingHour || !DateTime.now().setZone(dto.timeZone).isValid)
      throw new BadRequestException('Horario o zona inválida');
    if (dto.logoUrl && !/^https:\/\//.test(dto.logoUrl))
      throw new BadRequestException('El logo debe usar HTTPS');
    return this.db.salon.update({ where: { id: 1 }, data: dto });
  }
  @Get('professionals') professionals() {
    return this.db.professional.findMany({ include: { services: { select: { id: true } } } });
  }
  @Post('professionals') @UseGuards(OwnerGuard) createProfessional(@Body() dto: ProfessionalDto) {
    return this.professional(dto);
  }
  @Patch('professionals/:id') @UseGuards(OwnerGuard) updateProfessional(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProfessionalDto,
  ) {
    return this.professional(dto, id);
  }
  private async professional(dto: ProfessionalDto, id?: string) {
    if (dto.openingHour >= dto.closingHour) throw new BadRequestException('Horario inválido');
    const { serviceIds, ...data } = dto;
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'agenda');
      const services = serviceIds.map((id) => ({ id }));
      return id
        ? tx.professional.update({ where: { id }, data: { ...data, services: { set: services } } })
        : tx.professional.create({ data: { ...data, services: { connect: services } } });
    });
  }
  @Get('blocks') blocks() {
    return this.db.scheduleBlock.findMany({
      where: { endsAt: { gt: new Date() } },
      orderBy: { startsAt: 'asc' },
      include: { professional: { select: { name: true } } },
    });
  }
  @Post('blocks') @UseGuards(OwnerGuard) async block(@Body() dto: BlockDto) {
    const startsAt = new Date(dto.startsAt),
      endsAt = new Date(dto.endsAt);
    if (startsAt >= endsAt) throw new BadRequestException('Intervalo inválido');
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'agenda');
      if (
        await tx.reservation.findFirst({
          where: {
            professionalId: dto.professionalId,
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
            ...busyWhere(),
          },
        })
      )
        throw new ConflictException('Reprograma las reservas existentes antes de bloquear');
      return tx.scheduleBlock.create({ data: { ...dto, startsAt, endsAt } });
    });
  }
  @Delete('blocks/:id') @UseGuards(OwnerGuard) deleteBlock(@Param('id', ParseUUIDPipe) id: string) {
    return this.db.scheduleBlock.delete({ where: { id } });
  }
}
@Module({ imports: [AuthModule], controllers: [PublicCatalogController, CatalogController] })
export class CatalogModule {}
