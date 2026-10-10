import { Module } from '@nestjs/common';
import { PaymentController,PaymentRepository,PaymentService } from './routes';
import { DirectoryClient } from '../../../packages/common/src/tenant-context';
import { InternalHttp } from '../../../packages/common/src/http-client';
@Module({controllers:[PaymentController],providers:[InternalHttp,DirectoryClient,PaymentRepository,PaymentService]})export class PaymentsModule{}
