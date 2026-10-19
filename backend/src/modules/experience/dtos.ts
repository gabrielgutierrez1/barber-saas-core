import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
export class FaqDto {
  @IsString() @MinLength(2) @MaxLength(200) question!: string;
  @IsString() @MinLength(2) @MaxLength(2000) answer!: string;
}
export class GalleryDto {
  @Matches(/^(?:https:\/\/[^\s]+|\/api\/public\/images\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp)$/) @MaxLength(500) url!: string;
  @IsString() @MinLength(2) @MaxLength(200) caption!: string;
}
export class ContentDto {
  @IsString() @MaxLength(300) address!: string;
  @IsString() @MaxLength(10000) about!: string;
  @IsString() @MaxLength(10000) cancellationPolicy!: string;
  @IsString() @MaxLength(10000) privacyPolicy!: string;
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => FaqDto) faqs!: FaqDto[];
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => GalleryDto) gallery!: GalleryDto[];
}
export class SearchDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @IsString() @MaxLength(180) q?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsUUID() professionalId?: string;
  @IsOptional() @IsIn(['PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED', 'PAYMENT_REVIEW']) status?: 'PENDING_PAYMENT' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED' | 'PAYMENT_REVIEW';
}
export class AgendaDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsOptional() @IsIn(['day', 'week']) view: 'day' | 'week' = 'week';
  @IsOptional() @IsUUID() professionalId?: string;
}
export class PaymentSearchDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @IsString() @MaxLength(180) q?: string;
  @IsOptional() @IsIn(['approved', 'pending', 'in_process', 'rejected', 'refunded', 'charged_back', 'cancelled', 'in_mediation', 'authorized']) status?: string;
}
export class NotificationSearchDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @IsIn(['sent', 'pending', 'failed']) status?: string;
}
export class RecoverBookingDto {
  @IsUUID() reservationId!: string;
  @IsEmail() @MaxLength(180) email!: string;
}
export class ProfileDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsEmail() @MaxLength(180) email!: string;
  @IsString() @MaxLength(72) currentPassword!: string;
}
export class CustomerQueryDto extends SearchDto {
  @IsOptional() @IsEmail() @MaxLength(180) email?: string;
}
