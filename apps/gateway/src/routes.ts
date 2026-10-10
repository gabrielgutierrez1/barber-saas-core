import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Req, UseGuards, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InternalHttp } from '../../../packages/common/src/http-client';
import { DirectoryClient, tenantHeader } from '../../../packages/common/src/tenant-context';
import { BookingTokenDto, CreateReservationDto, CreateServiceDto, DateQueryDto, UpdateServiceDto } from '../../../packages/common/src/dtos';
import { JwtAdminGuard, AdminClaims } from './auth';
const CAT=()=>process.env.CATALOG_URL||'http://catalog:4001';
const RES=()=>process.env.RESERVATIONS_URL||'http://reservations:4002';
const PAY=()=>process.env.PAYMENTS_URL||'http://payments:4003';
function validId(id:string){if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))throw new BadRequestException('Id inválido');return id;}
const headers=(tenantId:string)=>({'x-tenant-id':tenantHeader(tenantId)});
@Controller('health')export class HealthController{@Get()get(){return {ok:true,service:'gateway'};}}
@Controller('api/public')
export class PublicController {
 constructor(private readonly http:InternalHttp,private readonly directory:DirectoryClient){}
 @Get('info')async info(@Headers('x-tenant-id') t:string){const {id,...data}=await this.directory.public(tenantHeader(t));return data;}
 @Get('services')services(@Headers('x-tenant-id') t:string){return this.http.call(`${CAT()}/internal/services`,'GET',undefined,headers(t));}
 @Get('availability')availability(@Headers('x-tenant-id') t:string,@Query() dto:DateQueryDto){return this.http.call(`${RES()}/internal/availability?serviceId=${encodeURIComponent(dto.serviceId)}&date=${encodeURIComponent(dto.date)}`,'GET',undefined,headers(t));}
 @Post('reservations')reserve(@Headers('x-tenant-id') t:string,@Body() dto:CreateReservationDto){return this.http.call(`${RES()}/internal/reservations`,'POST',dto,headers(t));}
 @Post('reservations/:id/checkout')checkout(@Headers('x-tenant-id') t:string,@Param('id') id:string,@Body() dto:BookingTokenDto){return this.http.call(`${PAY()}/internal/reservations/${validId(id)}/checkout`,'POST',dto,headers(t));}
 @Post('reservations/:id/status')status(@Headers('x-tenant-id') t:string,@Param('id') id:string,@Body() dto:BookingTokenDto){return this.http.call(`${RES()}/internal/reservations/${validId(id)}/status`,'POST',dto,headers(t));}
}
@Controller('api/admin')@UseGuards(JwtAdminGuard)
export class AdminController {
 constructor(private readonly http:InternalHttp){}
 @Get('services')services(@Req() req:{admin:AdminClaims}){return this.http.call(`${CAT()}/internal/services?all=true`,'GET',undefined,headers(req.admin.tenantId));}
 @Post('services')create(@Req() req:{admin:AdminClaims},@Body() dto:CreateServiceDto){if(req.admin.role!=='OWNER')throw new ForbiddenException();return this.http.call(`${CAT()}/internal/services`,'POST',dto,headers(req.admin.tenantId));}
 @Patch('services/:id')update(@Req() req:{admin:AdminClaims},@Param('id') id:string,@Body() dto:UpdateServiceDto){if(req.admin.role!=='OWNER')throw new ForbiddenException();return this.http.call(`${CAT()}/internal/services/${validId(id)}`,'PATCH',dto,headers(req.admin.tenantId));}
 @Get('reservations')reservations(@Req() req:{admin:AdminClaims}){return this.http.call(`${RES()}/internal/reservations`,'GET',undefined,headers(req.admin.tenantId));}
}
@Controller('api/webhooks')
export class WebhookController {
 constructor(private readonly http:InternalHttp){}
 @Post('mercadopago')@HttpCode(200)
 receive(@Headers('x-signature') signature:string,@Headers('x-request-id') requestId:string,@Query('data.id') queryId:string,@Query('id') altId:string,@Query('type') type:string,@Body() body:Record<string,unknown>){
  return this.http.call(`${PAY()}/internal/webhooks/mercadopago`,'POST',{queryId:queryId||altId||null,type:type||null,body:body||{}},{'x-signature':signature||'','x-request-id':requestId||''});
 }
}
