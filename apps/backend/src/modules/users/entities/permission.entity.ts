import { randomUUID } from 'node:crypto';
import { Column, Entity, ManyToMany, PrimaryColumn } from 'typeorm';
import { RoleEntity } from './role.entity';

@Entity({ name: 'permissions' })
export class PermissionEntity {
  @PrimaryColumn('uuid')
  id: string = randomUUID();

  @Column({ type: 'varchar', length: 120, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  description!: string;

  @ManyToMany(() => RoleEntity, (role) => role.permissions)
  roles!: RoleEntity[];
}
