import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { PermissionEntity } from './permission.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'user_permissions' })
export class UserPermissionEntity {
  @PrimaryColumn('uuid', { name: 'user_id' }) userId!: string;
  @PrimaryColumn('uuid', { name: 'permission_id' }) permissionId!: string;
  @Column({ name: 'preset_allowed', type: 'boolean', default: false }) presetAllowed = false;
  @Column({ type: 'boolean', nullable: true }) override: boolean | null = null;
  @ManyToOne(() => UserEntity, (user) => user.permissionAssignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' }) user!: UserEntity;
  @ManyToOne(() => PermissionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'permission_id' }) permission!: PermissionEntity;
}
