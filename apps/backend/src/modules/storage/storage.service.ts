import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export interface UploadedImage { buffer: Buffer; mimetype: string; size: number; originalname?: string }
export interface StoredImage { key: string; mimeType: string; size: number }

@Injectable()
export class StorageService {
  constructor(private readonly config: ConfigService) {}

  validateImage(file?: UploadedImage): asserts file is UploadedImage {
    if (!file?.buffer?.length || file.size < 1) throw new BadRequestException('Cada produto deve possuir uma foto válida.');
    if (!IMAGE_MIME_TYPES.includes(file.mimetype as typeof IMAGE_MIME_TYPES[number])) throw new BadRequestException('A foto deve ser JPEG, PNG ou WebP.');
    if (file.size > MAX_IMAGE_SIZE) throw new BadRequestException('A foto deve possuir no máximo 5 MB.');
  }

  async saveImage(file: UploadedImage): Promise<StoredImage> {
    this.validateImage(file);
    const extension = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg';
    const now = new Date();
    const key = `shipments/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}${extension}`;
    if (this.driver() === 'supabase') await this.supabaseSave(key, file);
    else {
      const target = this.localPath(key);
      await mkdir(resolve(target, '..'), { recursive: true });
      await writeFile(target, file.buffer, { flag: 'wx' });
    }
    return { key, mimeType: file.mimetype, size: file.size };
  }

  async readImage(key: string): Promise<Buffer> {
    this.assertKey(key);
    if (this.driver() === 'supabase') {
      const response = await fetch(this.supabaseObjectUrl(key), { headers: this.supabaseHeaders() });
      if (!response.ok) throw new InternalServerErrorException('Não foi possível carregar a foto do envio.');
      return Buffer.from(await response.arrayBuffer());
    }
    try { return await readFile(this.localPath(key)); }
    catch { throw new InternalServerErrorException('Não foi possível carregar a foto do envio.'); }
  }

  async deleteImage(key: string): Promise<void> {
    this.assertKey(key);
    if (this.driver() === 'supabase') {
      await fetch(this.supabaseObjectUrl(key), { method: 'DELETE', headers: this.supabaseHeaders() });
    } else await rm(this.localPath(key), { force: true });
  }

  private driver(): 'local' | 'supabase' { return this.config.get<'local' | 'supabase'>('STORAGE_DRIVER', 'local'); }
  private assertKey(key: string): void {
    if (!/^shipments\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) throw new InternalServerErrorException('Referência de foto inválida.');
  }
  private localPath(key: string): string {
    this.assertKey(key);
    const root = resolve(this.config.get<string>('FILE_STORAGE_PATH', './storage'));
    const target = resolve(root, key);
    if (!target.startsWith(`${root}${sep}`)) throw new InternalServerErrorException('Referência de foto inválida.');
    return target;
  }
  private supabaseObjectUrl(key: string): string {
    const base = this.config.getOrThrow<string>('SUPABASE_URL').replace(/\/$/, '');
    const bucket = encodeURIComponent(this.config.get<string>('STORAGE_BUCKET', 'shipment-evidence'));
    return `${base}/storage/v1/object/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  private supabaseHeaders(): Record<string, string> {
    const key = this.config.get<string>('SUPABASE_SECRET_KEY') ?? this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
    return key.startsWith('sb_secret_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
  }
  private async supabaseSave(key: string, file: UploadedImage): Promise<void> {
    const response = await fetch(this.supabaseObjectUrl(key), { method: 'POST', headers: { ...this.supabaseHeaders(), 'Content-Type': file.mimetype, 'x-upsert': 'false' }, body: new Uint8Array(file.buffer) });
    if (!response.ok) throw new InternalServerErrorException('Não foi possível armazenar a foto do envio.');
  }
}
