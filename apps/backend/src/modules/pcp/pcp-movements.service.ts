import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { paginate, PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { AuditService } from '../audit/audit.service';
import { AuditRequestMetadata } from '../audit/audit.types';
import { MovementStatus } from '../movements/domain/movement-status.enum';
import { MovementEntity } from '../movements/entities/movement.entity';
import { MovementsRepository } from '../movements/movements.repository';
import { PcpExecutionStatus } from './domain/pcp-execution-status.enum';
import { ExecutePcpMovementDto } from './dto/execute-pcp-movement.dto';
import { PcpMovementQueryDto } from './dto/pcp-movement-query.dto';
import { PcpMovementsRepository } from './pcp-movements.repository';

@Injectable()
export class PcpMovementsService {
  constructor(
    private readonly repository: PcpMovementsRepository,
    private readonly movements: MovementsRepository,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(query: PcpMovementQueryDto): Promise<PaginatedResult<MovementEntity>> {
    const [items, total] = await this.repository.findAndCount(query);
    return paginate(items, total, query.page, query.limit);
  }

  async get(id: string): Promise<Record<string, unknown>> {
    const movement = await this.movements.findById(id);
    if (!movement) throw new NotFoundException({ code: 'MOVEMENT_NOT_FOUND', message: 'Movimentacao nao encontrada.' });
    const [auditHistory, evidence, shipment] = await Promise.all([
      this.repository.findAuditHistory(id),
      movement.shipmentId ? this.repository.findShipmentEvidence(movement.shipmentId) : Promise.resolve([]),
      movement.shipmentId ? this.repository.findShipment(movement.shipmentId) : Promise.resolve(null),
    ]);
    const relevantEvidence = evidence.some((item) => item.stockLocationId !== null)
      ? evidence.filter((item) => item.stockLocationId === movement.originLocationId)
      : evidence;
    return {
      ...movement,
      operationalStatus: movement.status === MovementStatus.Effective ? 'CONCLUIDA' : 'CANCELADA',
      auditHistory,
      shipment: shipment ? {
        id: shipment.id, status: shipment.status, originSector: shipment.originSector, destinationSector: shipment.destinationSector,
        createdBy: shipment.createdBy, createdAt: shipment.createdAt, decidedBy: shipment.decidedBy, decidedAt: shipment.decidedAt,
      } : null,
      shipmentEvidence: relevantEvidence.map((item) => ({
        shipmentId: item.shipmentId, itemId: item.id, productId: item.productId, batchId: item.batchId,
        stockLocationId: item.stockLocationId, quantity: item.quantity, photoMimeType: item.photoMimeType,
      })),
    };
  }

  async execute(id: string, dto: ExecutePcpMovementDto, userId: string, metadata: AuditRequestMetadata): Promise<Record<string, unknown>> {
    await this.dataSource.transaction(async (manager) => {
      const movement = await this.movements.findByIdForUpdate(id, manager);
      if (!movement) throw new NotFoundException({ code: 'MOVEMENT_NOT_FOUND', message: 'Movimentacao nao encontrada.' });
      if (movement.status !== MovementStatus.Effective) throw new ConflictException({ code: 'PCP_MOVEMENT_NOT_CONCLUDED', message: 'Somente movimentacoes concluidas podem ser executadas pelo PCP.' });
      if (movement.pcpExecutionStatus === PcpExecutionStatus.Executed) throw new ConflictException({ code: 'PCP_MOVEMENT_ALREADY_EXECUTED', message: 'Esta movimentacao ja foi executada pelo PCP.' });
      const executedAt = new Date();
      movement.pcpExecutionStatus = PcpExecutionStatus.Executed;
      movement.pcpExecutedByUserId = userId;
      movement.pcpExecutedAt = executedAt;
      movement.pcpExecutionObservation = dto.observation ?? null;
      await this.movements.save(movement, manager);
      await this.audit.record({
        ...metadata, manager, userId, action: 'PCP_MOVEMENT_EXECUTE', entityType: 'MOVEMENT', entityId: id, result: 'SUCCESS',
        oldValues: { pcpExecutionStatus: PcpExecutionStatus.Pending },
        newValues: { pcpExecutionStatus: PcpExecutionStatus.Executed, pcpExecutedByUserId: userId, pcpExecutedAt: executedAt, observation: dto.observation ?? null },
      });
    });
    return this.get(id);
  }
}
