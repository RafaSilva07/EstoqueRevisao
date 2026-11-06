import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { SystemLogLevel } from '../entities/system-log.entity';

export class CreateSystemLogDto {
  @IsIn(['INFO', 'WARN', 'ERROR', 'FATAL'])
  level!: SystemLogLevel;

  @IsString()
  @IsOptional()
  errorCode?: string | null;

  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsString()
  @IsNotEmpty()
  context!: string;

  @IsObject()
  @IsOptional()
  details?: Record<string, unknown> | null;

  @IsString()
  @IsOptional()
  environment?: string;

  @IsOptional()
  timestamp?: Date | string;
}

