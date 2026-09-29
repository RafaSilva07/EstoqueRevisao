import { Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { OPERATIONAL_SECTOR_HEADER } from './auth.constants';
import { AuthenticatedUser } from './authenticated-user.interface';
import { OnlineUser } from './presence.repository';
import { PresenceService } from './presence.service';

@Controller('presence')
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Post('heartbeat')
  @HttpCode(HttpStatus.NO_CONTENT)
  heartbeat(@Req() request: Request): Promise<void> {
    return this.presence.heartbeat(
      request.user as AuthenticatedUser,
      request.headers[OPERATIONAL_SECTOR_HEADER],
    );
  }

  @Get('pcp')
  listPcp(@Req() request: Request): Promise<OnlineUser[]> {
    return this.presence.listPcp(
      request.user as AuthenticatedUser,
      request.headers[OPERATIONAL_SECTOR_HEADER],
    );
  }

  @Get()
  listAll(@Req() request: Request): Promise<OnlineUser[]> {
    return this.presence.listAll(request.user as AuthenticatedUser);
  }
}
