import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ProductEntity } from '../products/entities/product.entity';
import { BatchCodeCodec, BatchCodeError } from './domain/batch-code.codec';
import { BatchEntity } from './entities/batch.entity';
import { OperationalLotDto, ResolveOperationalLotDto } from './dto/operational-lot.dto';

@Injectable()
export class OperationalLotsService {
  constructor(private readonly dataSource: DataSource, private readonly codec: BatchCodeCodec) {}

  async preview(dto: ResolveOperationalLotDto): Promise<{ code: string; manufacturingDate: string; suggestedExpirationDate: string | null }> {
    const product = await this.requireProduct(dto.productId, this.dataSource.manager);
    const resolved = this.resolve(dto);
    return {
      ...resolved,
      suggestedExpirationDate: product.shelfLifeYears
        ? this.suggestExpiration(resolved.manufacturingDate, product.shelfLifeYears) : null,
    };
  }

  suggestExpiration(manufacturingDate: string, years: number): string {
    const [year, month, day] = manufacturingDate.split('-').map(Number);
    const targetYear = year + years;
    if (!Number.isSafeInteger(years) || years < 1 || targetYear > 9999) {
      throw new BadRequestException({ code: 'INVALID_SHELF_LIFE', message: 'O prazo do produto excede o intervalo de datas suportado.' });
    }
    // Civil dates, including February 29: clamp to the last day of the target month.
    const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
    return `${targetYear}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  }

  async resolveInTransaction(
    productId: string,
    dto: OperationalLotDto,
    userId: string,
    confirmedExpirations: string[],
    manager: EntityManager,
  ): Promise<BatchEntity> {
    const resolved = this.resolve(dto);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.expirationDate)
      || Number.isNaN(Date.parse(dto.expirationDate))
      || new Date(dto.expirationDate).toISOString().slice(0, 10) !== dto.expirationDate
      || dto.expirationDate < resolved.manufacturingDate) {
      throw new BadRequestException({ code: 'INVALID_EXPIRATION_DATE', message: 'Informe uma validade válida, igual ou posterior à fabricação.' });
    }
    // Caller locks product rows in deterministic order before resolving any variant.
    const product = await this.requireProduct(productId, manager);
    const repository = manager.getRepository(BatchEntity);
    const variants = await repository.find({ where: { productId, code: resolved.code }, order: { expirationDate: 'ASC' } });
    const different = variants.filter((batch) => batch.expirationDate !== dto.expirationDate);
    const unconfirmed = different.filter((batch) => !confirmedExpirations.includes(`${productId}:${batch.code}:${batch.expirationDate}`));
    if (unconfirmed.length) {
      throw new ConflictException({
        code: 'LOT_EXPIRATION_CONFIRMATION_REQUIRED',
        message: `${product.code} — ${product.name}, lote ${resolved.code}: já existe validade ${different.map((batch) => batch.expirationDate.split('-').reverse().join('/')).join(', ')}. A validade informada é ${dto.expirationDate.split('-').reverse().join('/')}. Se continuar, o saldo ficará separado por validade.`,
        details: { expirationKeys: different.map((batch) => `${productId}:${batch.code}:${batch.expirationDate}`) },
      });
    }
    const existing = variants.find((batch) => batch.expirationDate === dto.expirationDate);
    if (existing) return existing;
    return repository.save(Object.assign(new BatchEntity(), {
      productId, ...resolved, expirationDate: dto.expirationDate,
      createdById: userId, updatedById: userId,
    }));
  }

  async resolveExistingInTransaction(
    productId: string, batchId: string, userId: string, confirmed: string[], manager: EntityManager,
  ): Promise<BatchEntity> {
    const batch = await manager.getRepository(BatchEntity).findOneBy({ id: batchId, productId });
    if (!batch) throw new BadRequestException({ code: 'BATCH_PRODUCT_MISMATCH', message: 'O lote selecionado não pertence ao produto.' });
    return this.resolveInTransaction(productId, batch, userId, confirmed, manager);
  }

  private resolve(dto: { code?: string; manufacturingDate?: string }): { code: string; manufacturingDate: string } {
    try {
      const resolved = this.codec.resolve(dto.code, dto.manufacturingDate);
      const today = new Intl.DateTimeFormat('en-CA').format(new Date());
      if (resolved.manufacturingDate > today) {
        throw new BadRequestException({
          code: 'FUTURE_MANUFACTURING_DATE',
          message: 'A data de fabricação deve ser igual ou anterior à data atual.',
        });
      }
      return resolved;
    }
    catch (error) {
      if (error instanceof BatchCodeError) throw new BadRequestException({ code: error.code, message: error.message });
      throw error;
    }
  }

  private async requireProduct(id: string, manager: EntityManager): Promise<ProductEntity> {
    const product = await manager.getRepository(ProductEntity).findOneBy({ id });
    if (!product?.active) throw new BadRequestException({ code: 'INVALID_PRODUCT', message: 'Selecione um produto ativo.' });
    return product;
  }
}
