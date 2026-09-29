import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { UsersRepository } from '../users/repositories/users.repository';
import { UserStatus } from '../users/domain/user-status.enum';
import { UserEntity } from '../users/entities/user.entity';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { AuthService } from './auth.service';
import { AuthSessionEntity } from './entities/auth-session.entity';
import { PasswordHasherService } from './password-hasher.service';
import { TokenService } from './token.service';

describe('duração da sessão', () => {
  afterEach(() => jest.useRealTimers());

  it('configura a expiração do refresh para 14 horas', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-29T09:00:00Z'));
    const getOrThrow = jest.fn().mockReturnValue(14);
    const config = { getOrThrow } as unknown as ConfigService;
    const tokens = new TokenService({} as JwtService, config);

    expect(tokens.refreshTokenExpiresAt()).toEqual(new Date('2026-09-29T23:00:00Z'));
    expect(getOrThrow).toHaveBeenCalledWith('REFRESH_TOKEN_TTL_HOURS');
  });

  it('gira o refresh sem prolongar a sessão e rejeita acesso após 14 horas', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-29T10:00:00Z'));
    const user = {
      id: 'user-1', username: 'operador', status: UserStatus.Active, roles: [],
      sector: 'REVISAO', uiTheme: 'LIGHT', uiBackgroundColor: null,
    } as unknown as UserEntity;
    const session = Object.assign(new AuthSessionEntity(), {
      userId: user.id, user, createdAt: new Date('2026-09-29T09:00:00Z'),
      expiresAt: new Date('2026-09-29T23:00:00Z'), revokedAt: null,
    });
    const repository = {
      findByRefreshHashForUpdate: jest.fn().mockResolvedValue(session),
      findActiveByIdAndUser: jest.fn().mockResolvedValue(session),
      save: jest.fn().mockResolvedValue(session),
    };
    const users = { findActiveById: jest.fn().mockResolvedValue(user) };
    const tokens = {
      createRefreshToken: jest.fn().mockReturnValue('next-token'),
      hashRefreshToken: jest.fn((value: string) => `hash:${value}`),
      createAccessToken: jest.fn().mockResolvedValue({ accessToken: 'access', tokenType: 'Bearer', expiresIn: '15m' }),
      sessionLifetimeMs: jest.fn().mockReturnValue(14 * 60 * 60 * 1000),
      refreshTokenExpiresAt: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((work: (manager: EntityManager) => Promise<unknown>) => work({} as EntityManager)),
    };
    const service = new AuthService(
      users as unknown as UsersRepository,
      repository as unknown as AuthSessionsRepository,
      {} as PasswordHasherService,
      tokens as unknown as TokenService,
      { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService,
      dataSource as unknown as DataSource,
    );
    const metadata = { requestId: 'request-1', ipAddress: null, userAgent: null };

    const renewed = await service.refresh('old-token', metadata);
    expect(renewed.sessionExpiresAt).toEqual(new Date('2026-09-29T23:00:00Z'));
    expect(session.expiresAt).toEqual(new Date('2026-09-29T23:00:00Z'));
    expect(tokens.refreshTokenExpiresAt).not.toHaveBeenCalled();

    jest.setSystemTime(new Date('2026-09-29T23:00:01Z'));
    expect(await service.validateAccess(user.id, session.id)).toBeNull();
    await expect(service.refresh('next-token', metadata)).rejects.toMatchObject({ status: 401 });
  });
});
