import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, MoreThan, Repository } from 'typeorm';
import { AuthSessionEntity } from './entities/auth-session.entity';

@Injectable()
export class AuthSessionsRepository {
  constructor(
    @InjectRepository(AuthSessionEntity)
    private readonly repository: Repository<AuthSessionEntity>,
  ) {}

  save(session: AuthSessionEntity, manager?: EntityManager): Promise<AuthSessionEntity> {
    return (manager?.getRepository(AuthSessionEntity) ?? this.repository).save(session);
  }

  findActiveByIdAndUser(sessionId: string, userId: string): Promise<AuthSessionEntity | null> {
    return this.repository.findOne({
      where: {
        id: sessionId,
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
  }

  findByRefreshHashForUpdate(hash: string, manager: EntityManager): Promise<AuthSessionEntity | null> {
    return manager
      .getRepository(AuthSessionEntity)
      .createQueryBuilder('session')
      .addSelect('session.refreshTokenHash')
      .leftJoinAndSelect('session.user', 'user')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('session.refreshTokenHash = :hash', { hash })
      .setLock('pessimistic_write', undefined, ['session'])
      .getOne();
  }
}
