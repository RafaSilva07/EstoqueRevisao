import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ExecutePcpMovementDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || undefined : value)
  @IsString()
  @MaxLength(1000)
  observation?: string;
}
