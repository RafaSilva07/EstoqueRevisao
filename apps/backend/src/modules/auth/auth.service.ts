import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditRequestMetadata } from '../audit/audit.types';
import { AuditService } from '../audit/audit.service';
import { UserStatus } from '../users/domain/user-status.enum';
import { UserEntity } from '../users/entities/user.entity';
import { UsersRepository } from '../users/repositories/users.repository';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { AuthenticatedUser } from './authenticated-user.interface';
import { LoginDto } from './dto/login.dto';
import { AuthSessionEntity } from './entities/auth-session.entity';
import { PasswordHasherService } from './password-hasher.service';
import { AccessTokenResult, TokenService } from './token.service';

export interface AuthenticationResult extends AccessTokenResult {
  refreshToken: string;
  user: Omit<AuthenticatedUser, 'sessionId'>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly sessionsRepository: AuthSessionsRepository,
    private readonly passwordHasher: PasswordHasherService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async login(dto: LoginDto, metadata: AuditRequestMetadata): Promise<AuthenticationResult> {
    const user = await this.usersRepository.findForLogin(dto.username);

    if (!user) {
      await this.passwordHasher.hash(dto.password);
      await this.recordLoginFailure(null, dto.username, metadata);
      throw this.invalidCredentials();
    }

    const validPassword = await this.passwordHasher.verify(user.passwordHash, dto.password);
    if (!validPassword || user.status !== UserStatus.Active) {
      await this.recordLoginFailure(user.id, dto.username, metadata);
      throw this.invalidCredentials();
    }

    const refreshToken = this.tokenService.createRefreshToken();
    const session = new AuthSessionEntity();
    session.userId = user.id;
    session.refreshTokenHash = this.tokenService.hashRefreshToken(refreshToken);
    session.expiresAt = this.tokenService.refreshTokenExpiresAt();
    session.revokedAt = null;
    session.ipAddress = metadata.ipAddress;
    session.userAgent = metadata.userAgent;
    session.lastUsedAt = null;

    await this.dataSource.transaction(async (manager) => {
      await this.sessionsRepository.save(session, manager);
      await this.auditService.record({
        ...metadata,
        manager,
        userId: user.id,
        action: 'AUTH_LOGIN',
        entityType: 'AUTH_SESSION',
        entityId: session.id,
        result: 'SUCCESS',
      });
    });

    return this.authenticationResult(user, session.id, refreshToken);
  }

  async refresh(refreshToken: string, metadata: AuditRequestMetadata): Promise<AuthenticationResult> {
    const nextRefreshToken = this.tokenService.createRefreshToken();
    const hash = this.tokenService.hashRefreshToken(refreshToken);

    const session = await this.dataSource.transaction(async (manager) => {
      const current = await this.sessionsRepository.findByRefreshHashForUpdate(hash, manager);
      if (!this.isRefreshable(current)) {
        return null;
      }

      current.refreshTokenHash = this.tokenService.hashRefreshToken(nextRefreshToken);
      current.expiresAt = this.tokenService.refreshTokenExpiresAt();
      current.lastUsedAt = new Date();
      current.ipAddress = metadata.ipAddress;
      current.userAgent = metadata.userAgent;
      await this.sessionsRepository.save(current, manager);
      await this.auditService.record({
        ...metadata,
        manager,
        userId: current.userId,
        action: 'AUTH_REFRESH',
        entityType: 'AUTH_SESSION',
        entityId: current.id,
        result: 'SUCCESS',
      });
      return current;
    });

    if (!session) {
      await this.auditService.record({
        ...metadata,
        userId: null,
        action: 'AUTH_REFRESH',
        entityType: 'AUTH_SESSION',
        result: 'FAILURE',
      });
      throw this.invalidCredentials();
    }

    return this.authenticationResult(session.user, session.id, nextRefreshToken);
  }

  async logout(refreshToken: string | undefined, metadata: AuditRequestMetadata): Promise<void> {
    if (!refreshToken) {
      return;
    }

    const hash = this.tokenService.hashRefreshToken(refreshToken);
    await this.dataSource.transaction(async (manager) => {
      const session = await this.sessionsRepository.findByRefreshHashForUpdate(hash, manager);
      if (!session || session.revokedAt) {
        return;
      }

      session.revokedAt = new Date();
      await this.sessionsRepository.save(session, manager);
      await this.auditService.record({
        ...metadata,
        manager,
        userId: session.userId,
        action: 'AUTH_LOGOUT',
        entityType: 'AUTH_SESSION',
        entityId: session.id,
        result: 'SUCCESS',
      });
    });
  }

  async validateAccess(userId: string, sessionId: string): Promise<AuthenticatedUser | null> {
    const [user, session] = await Promise.all([
      this.usersRepository.findActiveById(userId),
      this.sessionsRepository.findActiveByIdAndUser(sessionId, userId),
    ]);

    if (!user || !session) {
      return null;
    }

    return this.toAuthenticatedUser(user, sessionId);
  }

  private async authenticationResult(
    user: UserEntity,
    sessionId: string,
    refreshToken: string,
  ): Promise<AuthenticationResult> {
    const access = await this.tokenService.createAccessToken(user, sessionId);
    const authenticatedUser = this.toAuthenticatedUser(user, sessionId);
    const publicUser = {
      id: authenticatedUser.id,
      username: authenticatedUser.username,
      roles: authenticatedUser.roles,
      sector: authenticatedUser.sector,
      permissions: authenticatedUser.permissions,
    };

    return { ...access, refreshToken, user: publicUser };
  }

  private toAuthenticatedUser(user: UserEntity, sessionId: string): AuthenticatedUser {
    return {
      id: user.id,
      username: user.username,
      sessionId,
      sector: user.sector,
      roles: (user.roles ?? []).map((role) => role.code),
      permissions: [
        ...new Set((user.roles ?? []).flatMap((role) =>
          (role.permissions ?? []).map((permission) => permission.code))),
      ],
    };
  }

  private isRefreshable(session: AuthSessionEntity | null): session is AuthSessionEntity {
    return Boolean(
      session
      && !session.revokedAt
      && session.expiresAt.getTime() > Date.now()
      && session.user.status === UserStatus.Active,
    );
  }

  private recordLoginFailure(
    userId: string | null,
    username: string,
    metadata: AuditRequestMetadata,
    manager?: EntityManager,
  ): Promise<void> {
    return this.auditService.record({
      ...metadata,
      manager,
      userId,
      action: 'AUTH_LOGIN',
      entityType: 'USER',
      entityId: userId,
      result: 'FAILURE',
      newValues: { attemptedUsername: username },
    });
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciais invalidas.',
    });
  }
}
