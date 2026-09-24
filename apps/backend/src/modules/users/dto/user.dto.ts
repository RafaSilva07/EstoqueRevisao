import { Transform } from 'class-transformer';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsEnum, IsIn, IsOptional, IsString, Length, MaxLength, ValidateIf } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { PaginationQueryDto } from '../../../shared/pagination/pagination-query.dto';
import { UserStatus } from '../domain/user-status.enum';

export class CreateUserDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 100)
  username!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsIn(['REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP'])
  sector!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  roleCodes!: string[];
}

export class UpdateUserDto extends PartialType(CreateUserDto, { skipNullProperties: false }) {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class UserQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['NAME','RECENT','OLDEST']) sort?: 'NAME' | 'RECENT' | 'OLDEST' = 'NAME';
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
