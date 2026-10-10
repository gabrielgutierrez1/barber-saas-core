import { Module } from '@nestjs/common';
import { CatalogController, CatalogRepository } from './routes';
import { InternalHttp } from '../../../packages/common/src/http-client';
import { DirectoryClient } from '../../../packages/common/src/tenant-context';
@Module({controllers:[CatalogController],providers:[InternalHttp,DirectoryClient,CatalogRepository]})export class CatalogModule{}
