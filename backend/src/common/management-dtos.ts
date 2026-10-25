import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class SalonDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsString() @MaxLength(500) description!: string;
  @Matches(/^#[0-9a-fA-F]{6}$/) primaryColor!: string;
  @IsString() @MaxLength(100) timeZone!: string;
  @IsInt() @Min(0) @Max(23) openingHour!: number;
  @IsInt() @Min(1) @Max(24) closingHour!: number;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workDays!: number[];
  @IsEmail() contactEmail!: string;
  @IsString() @MaxLength(30) contactPhone!: string;
  @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
}
export class ProfessionalDto {
  @IsOptional() @IsString() @MaxLength(1000) bio?: string;
  @IsOptional() @Matches(/^(https:\/\/[^\s]+)?$/) @MaxLength(500) photoUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) specialties?: string;
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsBoolean() active!: boolean;
  @IsInt() @Min(0) @Max(23) openingHour!: number;
  @IsInt() @Min(1) @Max(24) closingHour!: number;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workDays!: number[];
  @IsArray() @ArrayUnique() @IsUUID(undefined, { each: true }) serviceIds!: string[];
}
export class BlockDto {
  @IsUUID() professionalId!: string;
  @IsISO8601({ strict: true }) startsAt!: string;
  @IsISO8601({ strict: true }) endsAt!: string;
  @IsString() @MinLength(2) @MaxLength(200) reason!: string;
}
export class MoveDto {
  @IsUUID() professionalId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @Matches(/^([01]\d|2[0-3]):(00|30)$/) time!: string;
}
export class ReviewDto {
  @IsIn(['CONFIRMED', 'CANCELLED']) status!: 'CONFIRMED' | 'CANCELLED';
  @IsString() @MinLength(5) @MaxLength(500) note!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) paymentAttemptId?: string;
}
export class UserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsIn(['OWNER', 'STAFF']) role!: 'OWNER' | 'STAFF';
  @IsString() @MinLength(12) @MaxLength(72) password!: string;
}
export class UserActiveDto {
  @IsBoolean() active!: boolean;
}

export class MoveSlotsDto {
  @IsUUID() professionalId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
}
export class CustomerMoveDto extends MoveDto {
  @IsString() @MinLength(32) @MaxLength(150) bookingToken!: string;
}
export class CustomerSlotsDto extends MoveSlotsDto {
  @IsString() @MinLength(32) @MaxLength(150) bookingToken!: string;
}
