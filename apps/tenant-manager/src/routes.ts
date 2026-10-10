import { Controller, Get, Injectable, NotFoundException, Param } from '@nestjs/common';
import { PrismaClient } from '@generated/manager';
import { tenantHeader } from '../../../packages/common/src/tenant-context';
@Injectable()
export class DirectoryRepository {
 readonly db=new PrismaClient({datasources:{db:{url:process.env.MANAGER_DATABASE_URL}}});
 async public(id:string){return this.db.tenant.findFirst({where:{id:tenantHeader(id),active:true},select:{id:true,slug:true,name:true,description:true,logoUrl:true,primaryColor:true,timeZone:true,openingHour:true,closingHour:true}});}
 async database(id:string,service:string){return this.db.tenantDatabase.findFirst({where:{tenantId:tenantHeader(id),service,tenant:{active:true}},select:{connectionUrl:true}});}
}
@Controller()
export class DirectoryController {
 constructor(private readonly repo:DirectoryRepository){}
 @Get('health') health(){return {ok:true,service:'tenant-manager'};}
 @Get('internal/tenants/:id/public') async info(@Param('id') id:string){const result=await this.repo.public(id);if(!result)throw new NotFoundException('Peluquería no registrada');return result;}
 @Get('internal/tenants/:id/database/:service') async database(@Param('id') id:string,@Param('service') service:string){
  if(!['catalog','reservations','payments','auth'].includes(service))throw new NotFoundException();
  const result=await this.repo.database(id,service);
  if(!result)throw new NotFoundException('Base de datos no provisionada');
  return {url:result.connectionUrl};
 }
}
