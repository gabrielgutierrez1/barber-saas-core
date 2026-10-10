import { BadGatewayException, BadRequestException, Body, ConflictException, Controller, Get, Headers, HttpCode, Injectable, NotFoundException, Param, Post, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@generated/payments';
import { MercadoPagoConfig, Payment as MPayment, Preference, WebhookSignatureValidator } from 'mercadopago';
import { BookingTokenDto } from '../../../packages/common/src/dtos';
import { DirectoryClient, PrismaTenantPool, tenantHeader } from '../../../packages/common/src/tenant-context';
import { InternalHttp } from '../../../packages/common/src/http-client';
function mpClient(){const accessToken=process.env.ACCESS_TOKEN;if(!accessToken)throw new ServiceUnavailableException('Mercado Pago no configurado');return new MercadoPagoConfig({accessToken,options:{timeout:10000}});}
const RES=()=>process.env.RESERVATIONS_URL||'http://reservations:4002';
@Injectable()
export class PaymentRepository extends PrismaTenantPool<PrismaClient>{constructor(directory:DirectoryClient){super(directory,'payments',url=>new PrismaClient({datasources:{db:{url}}}));}}
@Injectable()
export class PaymentService {
 constructor(private readonly repo:PaymentRepository,private readonly http:InternalHttp){}
 async checkout(tenantId:string,id:string,bookingToken:string){
  const reservation=await this.http.call<{id:string;serviceId:string;serviceName:string;priceSnapshot:number;customerEmail:string}>(`${RES()}/internal/reservations/${id}/checkout-context`,'POST',{bookingToken},{'x-tenant-id':tenantId});
  const db=await this.repo.get(tenantId);
  const prior=await db.payment.findUnique({where:{reservationId:id}});
  if(prior?.checkoutUrl)return {checkoutUrl:prior.checkoutUrl,reservationId:id};
  await db.payment.upsert({where:{reservationId:id},update:{},create:{reservationId:id,amount:reservation.priceSnapshot,currency:'CLP'}});
  const webUrl=(process.env.PUBLIC_WEB_URL||'http://localhost:3000').replace(/\/$/,'');const resultBase=`${new URL(webUrl).origin}/resultado`;
  const callback=process.env.MP_WEBHOOK_URL?.trim();if(callback&&new URL(callback).protocol!=='https:')throw new BadRequestException('Webhook requiere HTTPS');
  let preference;
  try {preference=await new Preference(mpClient()).create({body:{
   items:[{id:reservation.serviceId,title:reservation.serviceName,quantity:1,unit_price:reservation.priceSnapshot,currency_id:'CLP'}],
   external_reference:`${tenantId}:${id}`,payer:{email:reservation.customerEmail},
   back_urls:{success:`${resultBase}?estado=success`,failure:`${resultBase}?estado=failure`,pending:`${resultBase}?estado=pending`},
   ...(new URL(webUrl).protocol==='https:'?{auto_return:'approved' as const}:{}),
   ...(callback?{notification_url:callback}:{}),metadata:{reservation_id:id,tenant_id:tenantId}
  }});}catch(e){console.error('Mercado Pago preference error',e instanceof Error?e.message:'unknown');throw new BadGatewayException('No se pudo iniciar el pago');}
  const url=preference.init_point||preference.sandbox_init_point;if(!preference.id||!url)throw new BadGatewayException('Preferencia inválida');
  await db.payment.update({where:{reservationId:id},data:{preferenceId:preference.id,checkoutUrl:url}});
  return {checkoutUrl:url,reservationId:id};
 }
 async webhook(input:unknown,signature:string,requestId:string){
  const secret=process.env.MP_WEBHOOK_SECRET;if(!secret)throw new ServiceUnavailableException('MP_WEBHOOK_SECRET no configurado');
  if(!input||typeof input!=='object')throw new BadRequestException();
  const data=input as {queryId?:unknown;type?:unknown;body?:{type?:unknown;data?:{id?:unknown}}};
  const id=String(data.queryId||'');if(!/^\d{1,30}$/.test(id)||!signature||!requestId)throw new UnauthorizedException('Webhook no autenticado');
  if(data.body?.data?.id&&String(data.body.data.id)!==id)throw new UnauthorizedException('ID inconsistente');
  const ts=signature.split(',').find(s=>s.trim().startsWith('ts='))?.trim().slice(3)||'';
  const v1=signature.split(',').find(s=>s.trim().startsWith('v1='))?.trim().slice(3)||'';
  if(!/^\d{10,16}$/.test(ts)||!/^[a-fA-F0-9]{64}$/.test(v1))throw new UnauthorizedException('Firma inválida');
  const epoch=Number(ts.length<=10?Number(ts)*1000:ts);if(!Number.isFinite(epoch)||Math.abs(Date.now()-epoch)>20*60_000)throw new UnauthorizedException('Firma vencida');
  try{WebhookSignatureValidator.validate({xSignature:signature,xRequestId:requestId,dataId:id,secret});}catch{throw new UnauthorizedException('Firma inválida');}
  if((data.type||data.body?.type)!=='payment')return {received:true,ignored:true};
  let payment;try{payment=await new MPayment(mpClient()).get({id});}catch{throw new BadGatewayException('No se pudo comprobar el pago');}
  if(!payment.external_reference||typeof payment.external_reference!=='string')return {received:true,ignored:true};
  const parts=payment.external_reference.split(':');if(parts.length!==2)return {received:true,ignored:true};
  const [rawTenant,reservationId]=parts;const tenantId=tenantHeader(rawTenant);
  if(!/^[0-9a-f-]{36}$/i.test(reservationId))return {received:true,ignored:true};
  const db=await this.repo.get(tenantId);const record=await db.payment.findUnique({where:{reservationId}});
  if(!record)return {received:true,ignored:true};
  if(payment.currency_id!=='CLP'||Number(payment.transaction_amount)!==record.amount)throw new ConflictException('Importe o moneda inconsistentes');
  if(record.mpPaymentId&&record.mpPaymentId!==id)throw new ConflictException('Pago distinto ya registrado');
  if(payment.status==='approved'){
   await this.http.call(`${RES()}/internal/reservations/${reservationId}/payment-decision`,'POST',{reservationId,decision:'approved'},{'x-tenant-id':tenantId});
   await db.payment.update({where:{id:record.id},data:{status:'APPROVED',mpPaymentId:id}});
  }else if(payment.status==='refunded'||payment.status==='charged_back'){
   await this.http.call(`${RES()}/internal/reservations/${reservationId}/payment-decision`,'POST',{reservationId,decision:'refunded'},{'x-tenant-id':tenantId});
   await db.payment.update({where:{id:record.id},data:{status:'REFUNDED',mpPaymentId:id}});
  }else if(payment.status==='rejected'||payment.status==='cancelled'){
   if(record.status!=='APPROVED')await db.payment.update({where:{id:record.id},data:{status:'REJECTED',mpPaymentId:id}});
  }else if(record.status!=='APPROVED')await db.payment.update({where:{id:record.id},data:{status:'PENDING',mpPaymentId:id}});
  return {received:true};
 }
}
@Controller()
export class PaymentController {
 constructor(private readonly service:PaymentService){}
 @Get('health')health(){return {ok:true,service:'payments'};}
 @Post('internal/reservations/:id/checkout')checkout(@Headers('x-tenant-id') t:string,@Param('id') id:string,@Body() dto:BookingTokenDto){return this.service.checkout(tenantHeader(t),id,dto.bookingToken);}
 @Post('internal/webhooks/mercadopago')@HttpCode(200)
 webhook(@Body() input:unknown,@Headers('x-signature') signature:string,@Headers('x-request-id') requestId:string){return this.service.webhook(input,signature,requestId);}
}
