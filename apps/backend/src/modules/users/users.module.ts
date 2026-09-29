import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionEntity } from './entities/permission.entity';
import { RoleEntity } from './entities/role.entity';
import { UserEntity } from './entities/user.entity';
import { UsersRepository } from './repositories/users.repository';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AdminGuard } from './admin.guard';
import { PasswordHasherService } from '../auth/password-hasher.service';
import { UserPreferencesService } from './user-preferences.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, RoleEntity, PermissionEntity])],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService, UserPreferencesService, AdminGuard, PasswordHasherService],
  exports: [UsersRepository, UserPreferencesService],
})
export class UsersModule {}
