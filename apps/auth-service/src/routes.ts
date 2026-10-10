import { Body, Controller, Get, Headers, Injectable, Post, UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@generated/auth';
import { LoginDto } from '../../../packages/common/src/dtos';
import { DirectoryClient, PrismaTenantPool, tenantHeader } from '../../../packages/common/src/tenant-context';
import * as bcrypt from 'bcryptjs';
@Injectable()
export class AuthRepository extends PrismaTenantPool<PrismaClient>{constructor(directory:DirectoryClient){super(directory,'auth',url=>new PrismaClient({datasources:{db:{url}}}));}}
@Injectable()
export class AuthService {
 constructor(private readonly repo:AuthRepository){}
 async login(tenantId:string,dto:LoginDto){
  const db=await this.repo.get(tenantId);const user=await db.user.findUnique({where:{email:dto.email.trim().toLowerCase()}});
  const hash=user?.passwordHash||'$2a$12$1Z49S8Yo1CeEJ85cqEz.r.6osqy6GPfsstzbYrePP.EBOCeJE/9/K';
  const matches=await bcrypt.compare(dto.password,hash);
  if(!user||!matches)throw new UnauthorizedException('Credenciales inválidas');
  return {sub:user.id,role:user.role,name:user.name};
 }
}
@Controller()
export class AuthController {
 constructor(private readonly auth:AuthService){}
 @Get('health')health(){return {ok:true,service:'auth'};}
 @Post('internal/auth/login')login(@Headers('x-tenant-id') tenantId:string,@Body() dto:LoginDto){return this.auth.login(tenantHeader(tenantId),dto);}
}
