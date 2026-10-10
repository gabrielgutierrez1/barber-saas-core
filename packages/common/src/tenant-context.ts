import { BadRequestException, Injectable, NestMiddleware, ServiceUnavailableException, OnModuleDestroy } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InternalHttp } from './http-client';
export type TenantRequest=Request & {tenantId:string};
export function tenantHeader(value:unknown):string {
 if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new BadRequestException('x-tenant-id inválido');
 return value.toLowerCase();
}
@Injectable()
export class TenantMiddleware implements NestMiddleware {
 use(req:TenantRequest,res:Response,next:NextFunction){
  // The webhook has no tenant header: the provider signature and external_reference determine the tenant.
  if(req.method==='OPTIONS'||req.path==='/health'||req.path==='/internal/webhooks/mercadopago'||req.path==='/api/webhooks/mercadopago')return next();
  try { req.tenantId=tenantHeader(req.headers['x-tenant-id']); next(); }
  catch(e){next(e);}
 }
}
@Injectable()
export class DirectoryClient {
 constructor(private readonly http:InternalHttp){}
 async database(tenantId:string,service:string):Promise<string>{
  const data=await this.http.call<{url:string}>(`${process.env.MANAGER_URL||'http://tenant-manager:4004'}/internal/tenants/${encodeURIComponent(tenantHeader(tenantId))}/database/${service}`);
  // Directory is a protected service and stores only pre-provisioned URLs.
  if(!data.url?.startsWith('postgresql://')&&!data.url?.startsWith('postgres://'))throw new ServiceUnavailableException('Conexión de tenant no disponible');
  return data.url;
 }
 async public(tenantId:string):Promise<{id:string;slug:string;name:string;description:string|null;logoUrl:string|null;primaryColor:string;timeZone:string;openingHour:number;closingHour:number}>{
  return this.http.call(`${process.env.MANAGER_URL||'http://tenant-manager:4004'}/internal/tenants/${encodeURIComponent(tenantHeader(tenantId))}/public`);
 }
}
// One PrismaClient per pre-provisioned tenant/database, managed centrally and never chosen from user-provided URLs.
export class PrismaTenantPool<T extends {$disconnect():Promise<void>}> implements OnModuleDestroy {
 private readonly clients=new Map<string,{client:T;used:number}>();
 private readonly loading=new Map<string,Promise<T>>();
 constructor(private readonly directory:DirectoryClient,private readonly kind:string,private readonly create:(url:string)=>T){}
 async get(id:string):Promise<T>{
  const tenantId=tenantHeader(id); const found=this.clients.get(tenantId);
  if(found){found.used=Date.now();return found.client;}
  const pending=this.loading.get(tenantId);if(pending)return pending;
  const task=(async()=>{
   const url=await this.directory.database(tenantId,this.kind);
   if(this.clients.size>=Number(process.env.TENANT_POOL_MAX||50)){
    const [oldId,old]=[...this.clients.entries()].sort((a,b)=>a[1].used-b[1].used)[0];
    this.clients.delete(oldId);await old.client.$disconnect();
   }
   const client=this.create(url);this.clients.set(tenantId,{client,used:Date.now()});return client;
  })().finally(()=>this.loading.delete(tenantId));
  this.loading.set(tenantId,task);return task;
 }
 async onModuleDestroy(){await Promise.all([...this.clients.values()].map(({client})=>client.$disconnect()));}
}
