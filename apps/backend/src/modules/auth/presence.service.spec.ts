import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedUser } from './authenticated-user.interface';
import { PresenceRepository } from './presence.repository';
import { PresenceService } from './presence.service';

describe('Presença online', () => {
  const repository = {
    heartbeat: jest.fn<Promise<boolean>, [string, string, string]>(),
    listOnlineUsers: jest.fn(),
  };
  const service = new PresenceService(repository as unknown as PresenceRepository);
  const user = (roles: string[], sector: string): AuthenticatedUser => ({
    id: 'user-id', username: 'operador', sessionId: 'session-id', roles, sector, permissions: [],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    repository.heartbeat.mockResolvedValue(true);
    repository.listOnlineUsers.mockResolvedValue([]);
  });

  it('registra o modo PCP real da sessão, sem aceitar modo fora do perfil', async () => {
    await service.heartbeat(user(['PCP'], 'PCP'), undefined);
    expect(repository.heartbeat).toHaveBeenCalledWith('session-id', 'user-id', 'PCP');
    await expect(service.heartbeat(user(['PCP'], 'PCP'), 'ADMIN')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.heartbeat(user(['PCP'], 'PCP'), 'INVALIDO')).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.heartbeat).toHaveBeenCalledTimes(1);
  });

  it('admite alternância administrativa e não amplia o par de setores do admin de área', async () => {
    await service.heartbeat(user(['ADMIN'], 'REVISAO'), 'PCP');
    await service.heartbeat(user(['ADMIN_PRODUCAO_PCP'], 'PRODUCAO'), 'PCP');
    expect(repository.heartbeat).toHaveBeenNthCalledWith(1, 'session-id', 'user-id', 'PCP');
    expect(repository.heartbeat).toHaveBeenNthCalledWith(2, 'session-id', 'user-id', 'PCP');
    await expect(service.heartbeat(user(['ADMIN_PRODUCAO_PCP'], 'PRODUCAO'), 'REVISAO'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('mostra apenas outros usuários PCP no modo PCP', async () => {
    await service.listPcp(user(['PCP'], 'PCP'), undefined);
    expect(repository.listOnlineUsers).toHaveBeenCalledWith(true, 'user-id');
    expect(() => service.listPcp(user(['ADMIN'], 'REVISAO'), 'ADMIN'))
      .toThrow(ForbiddenException);
  });

  it('limita a lista global aos administradores, independentemente do modo', async () => {
    for (const role of ['ADMIN', 'ADMIN_REVISAO_EXPEDICAO', 'ADMIN_PRODUCAO_PCP']) {
      await service.listAll(user([role], 'PCP'));
    }
    expect(repository.listOnlineUsers).toHaveBeenCalledTimes(3);
    expect(() => service.listAll(user(['PCP'], 'PCP'))).toThrow(ForbiddenException);
  });

  it('não reativa sessão encerrada por corrida com logout', async () => {
    repository.heartbeat.mockResolvedValue(false);
    await expect(service.heartbeat(user(['PCP'], 'PCP'), undefined))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
