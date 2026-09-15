import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UserStatus } from '../domain/user-status.enum';
import { UserEntity } from '../entities/user.entity';
import { UserQueryDto } from '../dto/user.dto';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
  ) {}

  findById(id: string, manager?: EntityManager): Promise<UserEntity | null> {
    return (manager?.getRepository(UserEntity) ?? this.repository).findOne({ where: { id }, relations: { roles: true } });
  }

  findAndCount(query: UserQueryDto): Promise<[UserEntity[], number]> {
    const builder = this.repository.createQueryBuilder('user').leftJoinAndSelect('user.roles', 'role');
    if (query.search?.trim()) builder.where('user.username ILIKE :search', { search: `%${query.search.trim().replace(/[\\%_]/g, '\\$&')}%` });
    return builder.orderBy('user.username', 'ASC').addOrderBy('user.id', 'ASC')
      .skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
  }

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
