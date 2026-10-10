import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
export class LoginDto {
 @IsEmail() @MaxLength(180) email!:string;
 @IsString() @MinLength(1) password!:string;
}
export class CreateServiceDto {
 @IsString() @MinLength(2) @MaxLength(80) name!:string;
 @IsOptional() @IsString() @MaxLength(500) description?:string;
 @IsInt() @Min(1000) @Max(1000000) price!:number;
 @IsInt() @IsIn([30,60,90,120]) durationMin!:number;
}
export class UpdateServiceDto {
 @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?:string;
 @IsOptional() @IsString() @MaxLength(500) description?:string;
 @IsOptional() @IsInt() @Min(1000) @Max(1000000) price?:number;
 @IsOptional() @IsInt() @IsIn([30,60,90,120]) durationMin?:number;
 @IsOptional() @IsBoolean() active?:boolean;
}
export class CreateReservationDto {
 @IsUUID() serviceId!:string;
 @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date!:string;
 @IsString() @Matches(/^([01]\d|2[0-3]):(00|30)$/) time!:string;
 @IsString() @MinLength(2) @MaxLength(100) customerName!:string;
 @IsEmail() @MaxLength(180) customerEmail!:string;
 @IsOptional() @IsString() @Matches(/^\+?[0-9 ()-]{7,25}$/) customerPhone?:string;
}
export class BookingTokenDto { @IsString() @MinLength(32) @MaxLength(150) bookingToken!:string; }
export class DateQueryDto {
 @IsUUID() serviceId!:string;
 @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date!:string;
}
export class PaymentDecisionDto {
 @IsUUID() reservationId!:string;
 @IsIn(['approved','refunded','rejected','pending']) decision!:'approved'|'refunded'|'rejected'|'pending';
}
