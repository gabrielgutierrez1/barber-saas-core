import { Body, CanActivate, Controller, ExecutionContext, Headers, Injectable, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InternalHttp } from '../../../packages/common/src/http-client';
import { DirectoryClient, tenantHeader } from '../../../packages/common/src/tenant-context';
import { LoginDto } from '../../../packages/common/src/dtos';
export interface AdminClaims{sub:string;tenantId:string;role:'OWNER'|'STAFF'}
@Injectable()
export class AuthService {
 constructor(private readonly http:InternalHttp,private readonly jwt:JwtService,private readonly directory:DirectoryClient){}
 async login(tenantId:string,dto:LoginDto){
  const salon=await this.directory.public(tenantId);
  const user=await this.http.call<{sub:string;role:'OWNER'|'STAFF';name:string}>(`${process.env.AUTH_URL||'http://auth:4005'}/internal/auth/login`,'POST',dto,{'x-tenant-id':tenantId});
  const claims:AdminClaims={sub:user.sub,role:user.role,tenantId};
  return {accessToken:await this.jwt.signAsync(claims),tenant:{slug:salon.slug,name:salon.name},user:{name:user.name,role:user.role}};
 }
}
@Controller('api/auth')
export class AuthController {
 constructor(private readonly auth:AuthService){}
 @Post('login')login(@Body() dto:LoginDto,@Headers('x-tenant-id') t:string){return this.auth.login(tenantHeader(t),dto);}
}
@Injectable()
export class JwtAdminGuard implements CanActivate {
 constructor(private readonly jwt:JwtService){}
 async canActivate(context:ExecutionContext){
  const req=context.switchToHttp().getRequest<{headers:Record<string,string|undefined>;admin?:AdminClaims}>();
  const header=req.headers.authorization||'';if(!header.startsWith('Bearer '))throw new UnauthorizedException();
  try {
   const payload=await this.jwt.verifyAsync<AdminClaims>(header.slice(7),{issuer:'peluqueria-saas',audience:'peluqueria-admin'});
   if(!payload.sub||!['OWNER','STAFF'].includes(payload.role)||payload.tenantId!==tenantHeader(req.headers['x-tenant-id']))throw new Error('Tenant mismatch');
   req.admin=payload;return true;
  }catch{throw new UnauthorizedException('Sesión inválida o vencida');}
 }
}
