import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { Database, lock } from '../../common/database';
import { ChangePasswordDto, EmailDto, LoginDto, ResetPasswordDto } from '../../common/dtos';
import { UserActiveDto, UserDto } from '../../common/management-dtos';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
export type AdminRequest = {
  headers: Record<string, string>;
  admin: { id: string; role: 'OWNER' | 'STAFF' };
};
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private db: Database,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    try {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) throw new Error();
      const claims = await this.jwt.verifyAsync<{ sub: string; version: number }>(token);
      const user = await this.db.user.findUnique({ where: { id: claims.sub } });
      if (!user?.active || user.sessionVersion !== claims.version) throw new Error();
      req.admin = { id: user.id, role: user.role };
      return true;
    } catch {
      throw new UnauthorizedException('Sesión inválida o vencida');
    }
  }
}
@Injectable()
export class OwnerGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    if (ctx.switchToHttp().getRequest<AdminRequest>().admin.role !== 'OWNER')
      throw new ForbiddenException();
    return true;
  }
}
@Controller('api/auth')
export class AuthController {
  constructor(
    private db: Database,
    private jwt: JwtService,
  ) {}
  @Post('login')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async login(@Body() dto: LoginDto) {
    const user = await this.db.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    const valid = await bcrypt.compare(
      dto.password,
      user?.passwordHash || '$2a$12$1Z49S8Yo1CeEJ85cqEz.r.6osqy6GPfsstzbYrePP.EBOCeJE/9/K',
    );
    if (!user?.active || !valid) throw new UnauthorizedException('Credenciales inválidas');
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, version: user.sessionVersion }),
      user: { name: user.name, role: user.role },
      salon: await this.db.salon.findUniqueOrThrow({ where: { id: 1 } }),
    };
  }
  @Post('logout')
  @UseGuards(AdminGuard)
  async logout(@Req() req: AdminRequest) {
    await this.db.user.update({
      where: { id: req.admin.id },
      data: { sessionVersion: { increment: 1 } },
    });
    return { ok: true };
  }
  @Post('password')
  @UseGuards(AdminGuard)
  async password(@Req() req: AdminRequest, @Body() dto: ChangePasswordDto) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: req.admin.id } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash)))
      throw new UnauthorizedException('Contraseña actual incorrecta');
    await this.db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(dto.password, 12),
        sessionVersion: { increment: 1 },
        resetTokenHash: null,
        resetExpiresAt: null,
      },
    });
    return { ok: true };
  }
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async forgot(@Body() dto: EmailDto) {
    const user = await this.db.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (user?.active) {
      const token = randomBytes(32).toString('hex');
      await this.db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            resetTokenHash: hashToken(token),
            resetExpiresAt: new Date(Date.now() + 30 * 60_000),
          },
        });
        await tx.emailJob.create({
          data: {
            key: `reset:${hashToken(token)}`,
            to: user.email,
            subject: 'Recuperar acceso',
            text: `Abre ${process.env.PUBLIC_WEB_URL}/admin#reset=${token}\nEl enlace vence en 30 minutos.`,
          },
        });
      });
    }
    return { message: 'Si el correo está registrado, recibirás instrucciones.' };
  }
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async reset(@Body() dto: ResetPasswordDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const result = await this.db.user.updateMany({
      where: {
        resetTokenHash: hashToken(dto.token),
        resetExpiresAt: { gt: new Date() },
        active: true,
      },
      data: {
        passwordHash,
        resetTokenHash: null,
        resetExpiresAt: null,
        sessionVersion: { increment: 1 },
      },
    });
    if (!result.count) throw new UnauthorizedException('Enlace inválido o vencido');
    return { ok: true };
  }
}
@Controller('api/admin/users')
@UseGuards(AdminGuard, OwnerGuard)
export class UsersController {
  constructor(private db: Database) {}
  @Get() list() {
    return this.db.user.findMany({
      select: { id: true, email: true, name: true, role: true, active: true },
    });
  }
  @Post() async create(@Body() dto: UserDto) {
    const { password, ...data } = dto;
    return this.db.user.create({
      data: {
        ...data,
        email: data.email.trim().toLowerCase(),
        passwordHash: await bcrypt.hash(password, 12),
      },
      select: { id: true },
    });
  }
  @Patch(':id') async active(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UserActiveDto) {
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'users');
      const user = await tx.user.findUniqueOrThrow({ where: { id } });
      if (
        !dto.active &&
        user.active &&
        user.role === 'OWNER' &&
        (await tx.user.count({ where: { role: 'OWNER', active: true } })) <= 1
      )
        throw new ForbiddenException('Debe quedar un propietario activo');
      await tx.user.update({
        where: { id },
        data: { active: dto.active, sessionVersion: { increment: 1 } },
      });
      return { ok: true };
    });
  }
}
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '8h', issuer: 'salon', audience: 'salon-admin' },
      verifyOptions: { issuer: 'salon', audience: 'salon-admin' },
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [AdminGuard, OwnerGuard],
  exports: [AdminGuard, OwnerGuard, JwtModule],
})
export class AuthModule {}
