import { Module } from '@nestjs/common';
import { DirectoryController, DirectoryRepository } from './routes';
@Module({controllers:[DirectoryController],providers:[DirectoryRepository]})export class TenantManagerModule{}
