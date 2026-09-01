import { SetMetadata } from '@nestjs/common';
import { REQUIRED_PERMISSIONS_KEY } from '../auth.constants';

export const RequirePermissions = (...permissions: string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
