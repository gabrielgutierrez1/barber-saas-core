import { Module } from '@nestjs/common';
import { AuthController, AuthRepository, AuthService } from './routes';
import { DirectoryClient } from '../../../packages/common/src/tenant-context';
import { InternalHttp } from '../../../packages/common/src/http-client';
@Module({controllers:[AuthController],providers:[InternalHttp,DirectoryClient,AuthRepository,AuthService]})export class AuthModule{}
