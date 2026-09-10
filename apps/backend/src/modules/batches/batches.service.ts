import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginatedResult, paginate } from '../../shared/pagination/paginated-result.interface';
import { BatchesRepository } from './batches.repository';
import { BatchQueryDto } from './dto/batch-query.dto';
import { BatchEntity } from './entities/batch.entity';

// Read-only access to operational lot/expiration variants.
@Injectable()
export class BatchesService {
  constructor(private readonly batchesRepository: BatchesRepository) {}

  async list(query: BatchQueryDto): Promise<PaginatedResult<BatchEntity>> {
    const [items, total] = await this.batchesRepository.findAndCount(query);
    return paginate(items, total, query.page, query.limit);
  }

  async getById(id: string): Promise<BatchEntity> {
    const batch = await this.batchesRepository.findById(id);
    if (!batch) throw new NotFoundException({ code: 'BATCH_NOT_FOUND', message: 'Lote não encontrado.' });
    return batch;
  }
}
