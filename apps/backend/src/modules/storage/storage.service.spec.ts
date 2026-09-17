import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService, UploadedImage } from './storage.service';

describe('StorageService - imagens de envios', () => {
  const service = new StorageService({ get: (_key: string, fallback: unknown) => fallback } as ConfigService);
  const image = (overrides: Partial<UploadedImage> = {}): UploadedImage => ({ buffer: Buffer.from('image'), size: 5, mimetype: 'image/jpeg', ...overrides });

  it('aceita JPEG, PNG e WebP não vazios até 5 MB', () => {
    for (const mimetype of ['image/jpeg', 'image/png', 'image/webp']) expect(() => service.validateImage(image({ mimetype }))).not.toThrow();
  });
  it('rejeita ausência, arquivo vazio, MIME inválido e tamanho acima do limite', () => {
    expect(() => service.validateImage()).toThrow(BadRequestException);
    expect(() => service.validateImage(image({ buffer: Buffer.alloc(0), size: 0 }))).toThrow(BadRequestException);
    expect(() => service.validateImage(image({ mimetype: 'image/svg+xml' }))).toThrow(BadRequestException);
    expect(() => service.validateImage(image({ size: 5 * 1024 * 1024 + 1 }))).toThrow(BadRequestException);
  });
});
