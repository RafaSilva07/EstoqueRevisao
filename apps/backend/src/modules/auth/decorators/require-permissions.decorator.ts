import { SetMetadata } from '@nestjs/common';
import { ANY_PERMISSIONS_KEY, REQUIRED_PERMISSIONS_KEY } from '../auth.constants';

export const RequirePermissions = (...permissions: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const RequireAnyPermissions = (...permissions: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
