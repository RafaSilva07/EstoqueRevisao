import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { allowedOperationalModes } from '../auth/operational-modes';
import { permissionAllowedInMode } from '../auth/permission-scopes';
import { StorageService, StoredImage, UploadedImage } from '../storage/storage.service';

interface DraftPhoto extends StoredImage { name: string; lastModified: number }
interface DraftRow { id: string; title: string; payload: Record<string, unknown> | null; photos: DraftPhoto[]; version: number; updated_at: Date }
export interface SaveFormDraft { version: number; title: string; value: Record<string, unknown>; files: Array<{ name: string; lastModified: number; reuseOrdinal?: number }> }
interface FormDraftResponse { version: number; record: { title: string; value: Record<string, unknown>; updatedAt: string; files: Array<{ name: string; lastModified: number; mimeType: string }> } | null }
const permissions: Record<string, string> = {
  entry: 'movements.external-entry', exit: 'movements.external-exit', transfer: 'movements.transfer', review: 'movements.review',
  shipment: 'shipments.create', 'shipment-decision': 'shipments.decide', separation: 'shipments.decide',
  'shipment-cancel': 'shipments.read', 'movement-cancel': 'movements.cancel', 'pcp-execute': 'pcp.movements.execute',
  stock: 'stocks.create', preferences: '', user: 'users.read', 'permission-presets': 'users.read', settings: 'users.read', 'shipment-admin': 'shipments.read',
};

@Injectable()
export class FormDraftsService {
  constructor(private readonly db: DataSource, private readonly storage: StorageService) {}
  private authorize(key: string, mode: string, user: AuthenticatedUser): void {
    if (!/^[\w:-]{1,180}$/.test(key) || !['ADMIN', 'REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP'].includes(mode)) throw new BadRequestException('Rascunho inválido.');
    const modes = user.roles.includes('ADMIN') ? ['ADMIN', ...allowedOperationalModes(user.roles)] : allowedOperationalModes(user.roles);
    if (!modes.includes(mode) && !(modes.length === 0 && mode === user.sector)) throw new ForbiddenException('Modo do rascunho não permitido.');
    const prefix = key.split(':')[0];
    const permission = permissions[prefix];
    if (permission === undefined) throw new BadRequestException('Formulário sem suporte a rascunho.');
    if (['user', 'permission-presets', 'settings'].includes(prefix)) {
      if (!user.roles.includes('ADMIN') || mode !== 'ADMIN') throw new ForbiddenException('Rascunho administrativo não permitido.');
    } else if (permission && !(user.permissions.includes(permission) && permissionAllowedInMode(permission, mode))) {
      // Editing an existing location uses update rather than create.
      if (!(prefix === 'stock' && user.permissions.includes('stocks.update') && permissionAllowedInMode('stocks.update', mode))) throw new ForbiddenException('Sem acesso a este formulário.');
    }
    if (prefix === 'shipment-admin' && !user.roles.some((role) => ['ADMIN', 'ADMIN_REVISAO_EXPEDICAO', 'ADMIN_PRODUCAO_PCP'].includes(role))) throw new ForbiddenException('Rascunho administrativo não permitido.');
  }
  private async row(key: string, mode: string, user: AuthenticatedUser, manager = this.db.manager): Promise<DraftRow | undefined> {
    const rows = await manager.query<DraftRow[]>('SELECT * FROM form_drafts WHERE user_id=$1 AND operational_mode=$2 AND form_key=$3', [user.id, mode, key]);
    return rows[0];
  }
  async get(key: string, mode: string, user: AuthenticatedUser): Promise<FormDraftResponse> {
    this.authorize(key, mode, user);
    const row = await this.row(key, mode, user);
    return { version: row?.version ?? 0, record: row?.payload ? { title: row.title, value: row.payload, updatedAt: row.updated_at.toISOString(),
      files: row.photos.map((photo) => ({ name: photo.name, lastModified: photo.lastModified, mimeType: photo.mimeType })) } : null };
  }
  validate(value: unknown, depth = 0): void {
    if (depth > 30) throw new BadRequestException('Rascunho muito complexo.');
    if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
      if (/^(password|token|accessToken|refreshToken|secret|__proto__|constructor|prototype)$/i.test(key)) throw new BadRequestException('Dados sensíveis não podem ser guardados.');
      this.validate(item, depth + 1);
    }
  }
  async save(key: string, mode: string, dto: SaveFormDraft, files: UploadedImage[], user: AuthenticatedUser): Promise<{ version: number }> {
    this.authorize(key, mode, user);
    if (!dto || !Number.isInteger(dto.version) || dto.version < 0 || typeof dto.title !== 'string' || dto.title.length > 120 || !dto.value || Array.isArray(dto.value) || typeof dto.value !== 'object'
      || !Array.isArray(dto.files) || dto.files.length > 100 || dto.files.filter((info) => info?.reuseOrdinal === undefined).length !== files.length || Buffer.byteLength(JSON.stringify(dto.value)) > 950000) throw new BadRequestException('Rascunho inválido ou muito grande.');
    this.validate(dto.value);
    for (const info of dto.files) if (!info || typeof info.name !== 'string' || info.name.length > 200 || !Number.isSafeInteger(info.lastModified) || info.lastModified < 0 || (info.reuseOrdinal !== undefined && (!Number.isInteger(info.reuseOrdinal) || info.reuseOrdinal < 0))) throw new BadRequestException('Foto do rascunho inválida.');
    files.forEach((file) => this.storage.validateImage(file));
    const previous = await this.row(key, mode, user);
    if ((previous?.version ?? 0) !== dto.version) throw this.conflict();
    const photos: DraftPhoto[] = []; const uploaded: DraftPhoto[] = []; let committed = false;
    try {
      let index = 0;
      for (const info of dto.files) {
        if (info.reuseOrdinal !== undefined) {
          const photo = previous?.photos[info.reuseOrdinal];
          if (!photo) throw new BadRequestException('Foto anterior do rascunho não encontrada.');
          photos.push(photo);
        } else {
          const photo = { ...await this.storage.saveImage(files[index++]), name: info.name, lastModified: info.lastModified };
          uploaded.push(photo); photos.push(photo);
        }
      }
      const result = await this.db.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`draft:${user.id}:${mode}`]);
        const old = await this.row(key, mode, user, manager);
        if ((old?.version ?? 0) !== dto.version) throw this.conflict();
        const rows = await manager.query<Array<{ version: number }>>(`INSERT INTO form_drafts (user_id, operational_mode, form_key, title, payload, photos, version)
          VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) ON CONFLICT (user_id,operational_mode,form_key)
          DO UPDATE SET title=EXCLUDED.title, payload=EXCLUDED.payload, photos=EXCLUDED.photos, version=EXCLUDED.version, updated_at=now() RETURNING version`,
        [user.id, mode, key, dto.title, JSON.stringify(dto.value), JSON.stringify(photos), dto.version + 1]);
        return { version: rows[0].version, oldPhotos: old?.photos ?? [] };
      });
      committed = true;
      await Promise.allSettled(result.oldPhotos.filter((old) => !photos.some((photo) => photo.key === old.key)).map((photo) => this.storage.deleteImage(photo.key)));
      return { version: result.version };
    } finally { if (!committed) await Promise.allSettled(uploaded.map((photo) => this.storage.deleteImage(photo.key))); }
  }
  async clear(key: string, mode: string, version: number, user: AuthenticatedUser): Promise<{ version: number }> {
    this.authorize(key, mode, user);
    if (!Number.isInteger(version) || version < 0) throw new BadRequestException('Versão inválida.');
    const result = await this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`draft:${user.id}:${mode}`]);
      const old = await this.row(key, mode, user, manager);
      if ((old?.version ?? 0) !== version) throw this.conflict();
      const children = await manager.query<DraftRow[]>('SELECT * FROM form_drafts WHERE user_id=$1 AND operational_mode=$2 AND (form_key=$3 OR left(form_key,length($3)+1)=$3||\':\') FOR UPDATE', [user.id, mode, key]);
      await manager.query(`INSERT INTO form_drafts (user_id,operational_mode,form_key,title,payload,photos,version) VALUES ($1,$2,$3,'',NULL,'[]',$4)
        ON CONFLICT (user_id,operational_mode,form_key) DO UPDATE SET payload=NULL,photos='[]',version=form_drafts.version+1,updated_at=now()`, [user.id, mode, key, version + 1]);
      await manager.query("UPDATE form_drafts SET payload=NULL,photos='[]',version=version+1,updated_at=now() WHERE user_id=$1 AND operational_mode=$2 AND left(form_key,length($3)+1)=$3||':'", [user.id, mode, key]);
      return children.flatMap((child) => child.photos);
    });
    await Promise.allSettled(result.map((photo) => this.storage.deleteImage(photo.key)));
    return { version: version + 1 };
  }
  async photo(key: string, mode: string, ordinal: number, version: number, user: AuthenticatedUser): Promise<{ data: Buffer; mimeType: string }> {
    this.authorize(key, mode, user); const row = await this.row(key, mode, user);
    if (!row || row.version !== version) throw this.conflict();
    const photo = row.photos[ordinal]; if (!photo) throw new NotFoundException('Foto não encontrada.');
    return { data: await this.storage.readImage(photo.key), mimeType: photo.mimeType };
  }
  private conflict(): ConflictException { return new ConflictException({ code: 'DRAFT_CHANGED', message: 'O rascunho foi alterado em outro dispositivo. Seu preenchimento local foi preservado; carregue a versão da conta para conferir antes de continuar.' }); }
}
