import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedUser } from './authenticated-user.interface';
import { allowedOperationalModes, allOperationalModes } from './operational-modes';
import { OnlineUser, PresenceRepository } from './presence.repository';

@Injectable()
export class PresenceService {
  constructor(private readonly repository: PresenceRepository) {}

  async heartbeat(user: AuthenticatedUser, requestedMode: string | string[] | undefined): Promise<void> {
    const mode = this.currentMode(user, requestedMode);
    if (!await this.repository.heartbeat(user.sessionId, user.id, mode)) {
      throw new UnauthorizedException('Sessão encerrada. Entre novamente.');
    }
  }

  listPcp(user: AuthenticatedUser, requestedMode: string | string[] | undefined): Promise<OnlineUser[]> {
    if (this.currentMode(user, requestedMode) !== 'PCP') {
      throw new ForbiddenException('Disponível somente no modo PCP.');
    }
    return this.repository.listOnlineUsers(true, user.id);
  }

  listAll(user: AuthenticatedUser): Promise<OnlineUser[]> {
    if (!user.roles.some((role) => role === 'ADMIN' || role === 'ADMIN_REVISAO_EXPEDICAO' || role === 'ADMIN_PRODUCAO_PCP')) {
      throw new ForbiddenException('Disponível somente para administradores.');
    }
    return this.repository.listOnlineUsers();
  }

  private currentMode(user: AuthenticatedUser, requestedMode: string | string[] | undefined): string {
    if (requestedMode !== undefined) {
      if (typeof requestedMode !== 'string' || !allOperationalModes.includes(requestedMode as typeof allOperationalModes[number])) {
        throw new BadRequestException('Modo operacional inválido.');
      }
      if (!allowedOperationalModes(user.roles).includes(requestedMode)) {
        throw new ForbiddenException('Este perfil não pode acessar o modo operacional solicitado.');
      }
      return requestedMode;
    }
    return user.roles.includes('ADMIN') ? 'ADMIN' : user.sector ?? '';
  }
}
