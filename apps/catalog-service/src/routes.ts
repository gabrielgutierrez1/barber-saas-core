import { Body, Controller, Get, Headers, Injectable, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { PrismaClient } from '@generated/catalog';
import { CreateServiceDto, UpdateServiceDto } from '../../../packages/common/src/dtos';
import { DirectoryClient, PrismaTenantPool, tenantHeader } from '../../../packages/common/src/tenant-context';
@Injectable()
export class CatalogRepository extends PrismaTenantPool<PrismaClient>{
 constructor(directory:DirectoryClient){super(directory,'catalog',url=>new PrismaClient({datasources:{db:{url}}}));}
 async services(id:string,all:boolean){const db=await this.get(id);return db.service.findMany({where:all?{}:{active:true},orderBy:{createdAt:'asc'}});}
 async lookup(id:string,serviceId:string){const db=await this.get(id);return db.service.findUnique({where:{id:serviceId}});}
 async create(id:string,data:CreateServiceDto){const db=await this.get(id);return db.service.create({data});}
 async update(id:string,serviceId:string,data:UpdateServiceDto){const db=await this.get(id);const found=await db.service.findUnique({where:{id:serviceId}});if(!found)throw new NotFoundException('Servicio no encontrado');return db.service.update({where:{id:serviceId},data});}
}
@Controller()
export class CatalogController {
 constructor(private readonly repo:CatalogRepository){}
 @Get('health')health(){return {ok:true,service:'catalog'};}
 @Get('internal/services')services(@Headers('x-tenant-id') tenantId:string,@Query('all') all:string){return this.repo.services(tenantHeader(tenantId),all==='true');}
 @Get('internal/services/:id')async one(@Headers('x-tenant-id') tenantId:string,@Param('id') id:string){const result=await this.repo.lookup(tenantHeader(tenantId),id);if(!result||!result.active)throw new NotFoundException('Servicio no disponible');return result;}
 @Post('internal/services')create(@Headers('x-tenant-id') tenantId:string,@Body() dto:CreateServiceDto){return this.repo.create(tenantHeader(tenantId),dto);}
 @Patch('internal/services/:id')update(@Headers('x-tenant-id') tenantId:string,@Param('id') id:string,@Body() dto:UpdateServiceDto){return this.repo.update(tenantHeader(tenantId),id,dto);}
}
