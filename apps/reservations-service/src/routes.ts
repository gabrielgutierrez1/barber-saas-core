import { BadRequestException, Body, ConflictException, Controller, Get, Headers, Injectable, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { PrismaClient } from '@generated/reservations';
import { CreateReservationDto, BookingTokenDto, PaymentDecisionDto } from '../../../packages/common/src/dtos';
import { DirectoryClient, PrismaTenantPool, tenantHeader } from '../../../packages/common/src/tenant-context';
import { InternalHttp } from '../../../packages/common/src/http-client';
import { DateTime } from 'luxon';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
const pendingMinutes=15;
function digest(t:string){return createHash('sha256').update(t).digest('hex');}
function checkToken(token:string,expected:string){const a=Buffer.from(digest(token));const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
function localStart(date:string,time:string,zone:string){const dt=DateTime.fromISO(`${date}T${time}`,{zone});if(!dt.isValid||dt.toFormat('yyyy-MM-dd')!==date||dt.toFormat('HH:mm')!==time)throw new BadRequestException('Fecha/hora inválida');return dt;}
interface Salon{timeZone:string;openingHour:number;closingHour:number}
interface SalonService{id:string;name:string;price:number;durationMin:number;active:boolean}
@Injectable()
export class ReservationRepository extends PrismaTenantPool<PrismaClient>{constructor(directory:DirectoryClient){super(directory,'reservations',url=>new PrismaClient({datasources:{db:{url}}}));}}
@Injectable()
export class ReservationService {
 constructor(private readonly repo:ReservationRepository,private readonly directory:DirectoryClient,private readonly http:InternalHttp){}
 private async context(tenantId:string,serviceId:string):Promise<{salon:Salon;service:SalonService}>{
  const [salon,service]=await Promise.all([this.directory.public(tenantId),this.http.call<SalonService>(`${process.env.CATALOG_URL||'http://catalog:4001'}/internal/services/${encodeURIComponent(serviceId)}`,'GET',undefined,{'x-tenant-id':tenantId})]);
  return {salon,service};
 }
 private checkTime(dt:DateTime,duration:number,opening:number,closing:number){
  if(dt.weekday===7)throw new BadRequestException('No atendemos los domingos');
  if(dt.hour*60+dt.minute<opening*60||dt.hour*60+dt.minute+duration>closing*60||(dt.minute!==0&&dt.minute!==30))throw new BadRequestException('Horario fuera del horario de atención');
  const t=dt.toMillis();if(t<Date.now()+30*60_000||t>Date.now()+90*86400_000)throw new BadRequestException('Reserva entre 30 min y 90 días de anticipación');
 }
 async availability(id:string,serviceId:string,date:string){
  const {salon,service}=await this.context(id,serviceId);const base=localStart(date,'00:00',salon.timeZone);
  if(base.weekday===7)return {date,timeZone:salon.timeZone,slots:[]};
  const db=await this.repo.get(id);const taken=await db.reservation.findMany({where:{serviceId,startsAt:{lt:base.plus({days:1}).toJSDate()},endsAt:{gt:base.toJSDate()},OR:[{status:'CONFIRMED'},{status:'PENDING_PAYMENT',expiresAt:{gt:new Date()}}]}});
  const slots:string[]=[];
  for(let mins=salon.openingHour*60;mins+service.durationMin<=salon.closingHour*60;mins+=30){
   const dt=base.plus({minutes:mins});try{this.checkTime(dt,service.durationMin,salon.openingHour,salon.closingHour);}catch{continue;}
   const start=dt.toMillis(),end=start+service.durationMin*60_000;
   if(!taken.some(r=>r.startsAt.getTime()<end&&r.endsAt.getTime()>start))slots.push(dt.toFormat('HH:mm'));
  }
  return {date,timeZone:salon.timeZone,slots};
 }
 async create(id:string,dto:CreateReservationDto){
  const {salon,service}=await this.context(id,dto.serviceId);const dt=localStart(dto.date,dto.time,salon.timeZone);
  this.checkTime(dt,service.durationMin,salon.openingHour,salon.closingHour);
  const token=randomBytes(32).toString('hex'),db=await this.repo.get(id),startsAt=dt.toUTC().toJSDate(),endsAt=dt.plus({minutes:service.durationMin}).toUTC().toJSDate();
  const reservation=await db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.serviceId}))`;
   const taken=await tx.reservation.findFirst({where:{serviceId:dto.serviceId,startsAt:{lt:endsAt},endsAt:{gt:startsAt},OR:[{status:'CONFIRMED'},{status:'PENDING_PAYMENT',expiresAt:{gt:new Date()}}]}});
   if(taken)throw new ConflictException('El horario acaba de ocuparse');
   return tx.reservation.create({data:{serviceId:dto.serviceId,serviceName:service.name,startsAt,endsAt,customerName:dto.customerName.trim(),customerEmail:dto.customerEmail.trim().toLowerCase(),customerPhone:dto.customerPhone,bookingTokenHash:digest(token),priceSnapshot:service.price,expiresAt:new Date(Date.now()+pendingMinutes*60_000)}});
  },{timeout:10000});
  return {id:reservation.id,bookingToken:token,status:reservation.status,expiresAt:reservation.expiresAt};
 }
 async status(id:string,reservationId:string,token:string){const db=await this.repo.get(id);const r=await db.reservation.findUnique({where:{id:reservationId}});if(!r||!checkToken(token,r.bookingTokenHash))throw new NotFoundException('Reserva no encontrada');return {id:r.id,status:r.status==='PENDING_PAYMENT'&&r.expiresAt.getTime()<Date.now()?'EXPIRED':r.status,startsAt:r.startsAt,endsAt:r.endsAt};}
 async checkoutContext(id:string,reservationId:string,token:string){
  const db=await this.repo.get(id);const r=await db.reservation.findUnique({where:{id:reservationId}});
  if(!r||!checkToken(token,r.bookingTokenHash))throw new NotFoundException('Reserva no encontrada');
  if(r.status!=='PENDING_PAYMENT'||r.expiresAt.getTime()<=Date.now())throw new ConflictException('Reserva no pagable');
  return {id:r.id,serviceId:r.serviceId,serviceName:r.serviceName,priceSnapshot:r.priceSnapshot,customerEmail:r.customerEmail};
 }
 async list(id:string){const db=await this.repo.get(id);return (await db.reservation.findMany({orderBy:{startsAt:'desc'},take:200,select:{id:true,customerName:true,customerEmail:true,customerPhone:true,startsAt:true,endsAt:true,status:true,priceSnapshot:true,serviceName:true}})).map(r=>({...r,service:{name:r.serviceName}}));}
 async decision(id:string,reservationId:string,decision:PaymentDecisionDto['decision']){
  const db=await this.repo.get(id);return db.$transaction(async tx=>{
   const first=await tx.reservation.findUnique({where:{id:reservationId}});if(!first)throw new NotFoundException('Reserva inexistente');
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${first.serviceId}))`;
   const r=await tx.reservation.findUnique({where:{id:reservationId}});if(!r)throw new NotFoundException();
   if(decision==='approved'){
    if(r.status==='CONFIRMED'||r.status==='PAYMENT_REVIEW')return {status:r.status};
    const clash=await tx.reservation.findFirst({where:{id:{not:r.id},serviceId:r.serviceId,startsAt:{lt:r.endsAt},endsAt:{gt:r.startsAt},OR:[{status:'CONFIRMED'},{status:'PENDING_PAYMENT',expiresAt:{gt:new Date()}}]}});
    const confirmed=r.status==='PENDING_PAYMENT'&&r.expiresAt.getTime()>Date.now()&&!clash;
    return tx.reservation.update({where:{id:r.id},data:{status:confirmed?'CONFIRMED':'PAYMENT_REVIEW'}});
   }
   if(decision==='refunded')return tx.reservation.update({where:{id:r.id},data:{status:'PAYMENT_REVIEW'}});
   return {status:r.status};
  },{timeout:10000});
 }
}
@Controller()
export class ReservationController {
 constructor(private readonly service:ReservationService){}
 @Get('health')health(){return {ok:true,service:'reservations'};}
 @Get('internal/availability')availability(@Headers('x-tenant-id') t:string,@Query('serviceId') serviceId:string,@Query('date') date:string){if(!/^[0-9a-f-]{36}$/i.test(serviceId||'')||!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw new BadRequestException();return this.service.availability(tenantHeader(t),serviceId,date);}
 @Post('internal/reservations')create(@Headers('x-tenant-id') t:string,@Body() dto:CreateReservationDto){return this.service.create(tenantHeader(t),dto);}
 @Post('internal/reservations/:id/status')status(@Headers('x-tenant-id') t:string,@Param('id') id:string,@Body() dto:BookingTokenDto){return this.service.status(tenantHeader(t),id,dto.bookingToken);}
 @Post('internal/reservations/:id/checkout-context')context(@Headers('x-tenant-id') t:string,@Param('id') id:string,@Body() dto:BookingTokenDto){return this.service.checkoutContext(tenantHeader(t),id,dto.bookingToken);}
 @Post('internal/reservations/:id/payment-decision')decision(@Headers('x-tenant-id') t:string,@Param('id') id:string,@Body() dto:PaymentDecisionDto){if(dto.reservationId!==id)throw new BadRequestException();return this.service.decision(tenantHeader(t),id,dto.decision);}
 @Get('internal/reservations')list(@Headers('x-tenant-id') t:string){return this.service.list(tenantHeader(t));}
}
