import { randomUUID } from 'node:crypto';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryColumn,
} from 'typeorm';
import { PermissionEntity } from './permission.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'roles' })
export class RoleEntity {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @Column({ type: 'varchar', length: 60, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToMany(() => PermissionEntity, (permission) => permission.roles)
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions!: PermissionEntity[];

  @ManyToMany(() => UserEntity, (user) => user.roles)
  users!: UserEntity[];
}
