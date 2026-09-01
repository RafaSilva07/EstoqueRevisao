import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

function toBoolean({ value }: { value: unknown }): boolean {
  return value === true || value === 'true';
}

function toNumber({ value }: { value: unknown }): number {
  return Number(value);
}

export class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  PORT = 3000;

  @IsUrl({ require_tld: false })
  FRONTEND_URL = 'http://localhost:5173';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @Transform(toBoolean)
  @IsBoolean()
  DATABASE_SSL = false;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_TTL = '15m';

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  REFRESH_TOKEN_TTL_DAYS = 7;

  @Transform(toBoolean)
  @IsBoolean()
  AUTH_COOKIE_SECURE = false;

  @Transform(toNumber)
  @IsInt()
  @Min(19456)
  ARGON2_MEMORY_COST = 65536;

  @Transform(toNumber)
  @IsInt()
  @Min(2)
  ARGON2_TIME_COST = 3;

  @Transform(toNumber)
  @IsInt()
  @Min(1)
  ARGON2_PARALLELISM = 1;

  @IsString()
  @IsNotEmpty()
  LOG_LEVEL = 'info';

  @IsString()
  @IsNotEmpty()
  FILE_STORAGE_PATH = './storage';
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: true,
  });

  if (errors.length > 0) {
    throw new Error(`Configuracao de ambiente invalida: ${errors.toString()}`);
  }

  return validated;
}
