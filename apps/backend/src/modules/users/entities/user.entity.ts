import { randomUUID } from 'node:crypto';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserStatus } from '../domain/user-status.enum';
import { RoleEntity } from './role.entity';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @Column({ type: 'varchar', length: 100 })
  username!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 20, default: UserStatus.Active })
  status: UserStatus = UserStatus.Active;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToMany(() => RoleEntity, (role) => role.users)
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles!: RoleEntity[];
}
