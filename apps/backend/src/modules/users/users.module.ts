import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionEntity } from './entities/permission.entity';
import { RoleEntity } from './entities/role.entity';
import { UserEntity } from './entities/user.entity';
import { UsersRepository } from './repositories/users.repository';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, RoleEntity, PermissionEntity])],
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
