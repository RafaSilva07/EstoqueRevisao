import { QueryFailedError } from 'typeorm';

interface PostgresDriverError {
  code?: string;
  constraint?: string;
}

export function getPostgresError(error: unknown): PostgresDriverError | null {
  if (!(error instanceof QueryFailedError)) {
    return null;
  }
  return error.driverError as PostgresDriverError;
}
