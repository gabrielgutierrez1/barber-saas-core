import { Module } from '@nestjs/common';
import { ReservationController,ReservationRepository,ReservationService } from './routes';
import { DirectoryClient } from '../../../packages/common/src/tenant-context';
import { InternalHttp } from '../../../packages/common/src/http-client';
@Module({controllers:[ReservationController],providers:[InternalHttp,DirectoryClient,ReservationRepository,ReservationService]})export class ReservationsModule{}
