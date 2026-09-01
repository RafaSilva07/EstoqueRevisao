import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UserStatus } from '../domain/user-status.enum';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
  ) {}

  findForLogin(username: string): Promise<UserEntity | null> {
    return this.repository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('LOWER(user.username) = LOWER(:username)', { username })
      .getOne();
  }

  findActiveById(id: string): Promise<UserEntity | null> {
    return this.repository.findOne({
      where: { id, status: UserStatus.Active },
      relations: { roles: { permissions: true } },
    });
  }

  save(user: UserEntity, manager?: EntityManager): Promise<UserEntity> {
    return (manager?.getRepository(UserEntity) ?? this.repository).save(user);
  }
}
