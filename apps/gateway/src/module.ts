import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard,ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { InternalHttp } from '../../../packages/common/src/http-client';
import { DirectoryClient } from '../../../packages/common/src/tenant-context';
import { AuthController,AuthService,JwtAdminGuard } from './auth';
import { PublicController,AdminController,WebhookController,HealthController } from './routes';
@Module({imports:[JwtModule.register({secret:process.env.JWT_SECRET,signOptions:{expiresIn:'8h',issuer:'peluqueria-saas',audience:'peluqueria-admin'}}),ThrottlerModule.forRoot([{ttl:60_000,limit:80}])],controllers:[AuthController,PublicController,AdminController,WebhookController,HealthController],providers:[InternalHttp,DirectoryClient,AuthService,JwtAdminGuard,{provide:APP_GUARD,useClass:ThrottlerGuard}]})
export class GatewayModule{}
