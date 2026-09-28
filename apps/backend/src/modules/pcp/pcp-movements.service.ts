import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { paginate, PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { AuditService } from '../audit/audit.service';
import { AuditRequestMetadata } from '../audit/audit.types';
import { MovementStatus } from '../movements/domain/movement-status.enum';
import { MovementEntity } from '../movements/entities/movement.entity';
import { MovementItemEntity } from '../movements/entities/movement-item.entity';
import { MovementListEntry, MovementsRepository } from '../movements/movements.repository';
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

  async list(query: PcpMovementQueryDto): Promise<PaginatedResult<MovementListEntry>> {
    const [items, total] = query.view === 'GROUP'
      ? await this.repository.findAndCount(query)
      : await this.repository.findRecordsAndCount(query);
    return paginate<MovementListEntry>(items, total, query.page, query.limit);
  }

  async getRecord(id: string): Promise<Record<string, unknown>> {
    const record = await this.dataSource.getRepository(MovementItemEntity).findOne({ where: { id }, relations: { pcpExecutedByUser: true } });
    if (!record) throw new NotFoundException({ code: 'MOVEMENT_RECORD_NOT_FOUND', message: 'Registro nao encontrado.' });
    const detail = await this.get(record.movementId);
    const items = (detail.items as MovementItemEntity[]).filter((item) => item.id === id);
    const evidence = (detail.shipmentEvidence as Array<{ itemId: string }>).filter((photo) => photo.itemId === record.shipmentItemId);
    return { ...detail, items, shipmentEvidence: evidence, recordId: id,
      auditHistory: (detail.auditHistory as Array<{ entityType: string; entityId: string }>).filter((event) => event.entityType === 'MOVEMENT' || event.entityId === id),
      codigoGrupo: (detail as unknown as MovementEntity).codigoMovimentacao,
      codigoRegistro: record.codigoRegistro, groupItemCount: (detail.items as MovementItemEntity[]).length,
      pcpExecutionStatus: record.pcpExecutionStatus,
      pcpExecutedByUserId: record.pcpExecutedByUserId,
      pcpExecutedByUser: record.pcpExecutedByUser,
      pcpExecutedAt: record.pcpExecutedAt,
      pcpExecutionObservation: record.pcpExecutionObservation };
  }

  async executeRecord(id: string, dto: ExecutePcpMovementDto, userId: string, metadata: AuditRequestMetadata): Promise<Record<string, unknown>> {
    const candidate = await this.dataSource.getRepository(MovementItemEntity).findOneBy({ id });
    if (!candidate) throw new NotFoundException({ code: 'MOVEMENT_RECORD_NOT_FOUND', message: 'Registro nao encontrado.' });
    await this.dataSource.transaction(async (manager) => {
      const movement = await this.movements.findByIdForUpdate(candidate.movementId, manager);
      if (!movement) throw new NotFoundException({ code: 'MOVEMENT_NOT_FOUND', message: 'Movimentacao nao encontrada.' });
      if (movement.status !== MovementStatus.Effective) throw new ConflictException({ code: 'PCP_MOVEMENT_NOT_CONCLUDED', message: 'Somente movimentacoes concluidas podem ser executadas pelo PCP.' });
      if (!movement.requiresPcpExecution) throw new ConflictException({ code: 'PCP_EXECUTION_NOT_REQUIRED', message: 'Esta movimentacao nao exige execucao do PCP.' });
      const record = await manager.getRepository(MovementItemEntity).findOneByOrFail({ id, movementId: movement.id });
      if (record.pcpExecutionStatus === PcpExecutionStatus.Executed) throw new ConflictException({ code: 'PCP_MOVEMENT_ALREADY_EXECUTED', message: 'Este registro ja foi executado pelo PCP.' });
      const executedAt = new Date();
      await manager.getRepository(MovementItemEntity).update(id, { pcpExecutionStatus: PcpExecutionStatus.Executed,
        pcpExecutedByUserId: userId, pcpExecutedAt: executedAt, pcpExecutionObservation: dto.observation ?? null });
      const remaining = await manager.getRepository(MovementItemEntity).countBy({ movementId: movement.id, pcpExecutionStatus: PcpExecutionStatus.Pending });
      if (remaining === 0) {
        movement.pcpExecutionStatus = PcpExecutionStatus.Executed;
        movement.pcpExecutedByUserId = userId;
        movement.pcpExecutedAt = executedAt;
        movement.pcpExecutionObservation = dto.observation ?? null;
        await this.movements.save(movement, manager);
      }
      await this.audit.record({ ...metadata, manager, userId, action: 'PCP_MOVEMENT_RECORD_EXECUTE',
        entityType: 'MOVEMENT_RECORD', entityId: id, result: 'SUCCESS',
        oldValues: { pcpExecutionStatus: PcpExecutionStatus.Pending },
        newValues: { codigoGrupo: movement.codigoMovimentacao, codigoRegistro: record.codigoRegistro,
          pcpExecutionStatus: PcpExecutionStatus.Executed, pcpExecutedByUserId: userId, pcpExecutedAt: executedAt,
          observation: dto.observation ?? null } });
    });
    return this.getRecord(id);
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
        additionalPhotos: item.additionalPhotos?.map((photo) => ({ ordinal: photo.ordinal, mimeType: photo.mimeType, size: photo.size })) ?? [],
      })),
    };
  }

  async execute(id: string, dto: ExecutePcpMovementDto, userId: string, metadata: AuditRequestMetadata): Promise<Record<string, unknown>> {
    await this.dataSource.transaction(async (manager) => {
      const movement = await this.movements.findByIdForUpdate(id, manager);
      if (!movement) throw new NotFoundException({ code: 'MOVEMENT_NOT_FOUND', message: 'Movimentacao nao encontrada.' });
      if (movement.status !== MovementStatus.Effective) throw new ConflictException({ code: 'PCP_MOVEMENT_NOT_CONCLUDED', message: 'Somente movimentacoes concluidas podem ser executadas pelo PCP.' });
      if (movement.requiresPcpExecution === false) throw new ConflictException({ code: 'PCP_EXECUTION_NOT_REQUIRED', message: 'Esta movimentacao nao exige execucao do PCP.' });
      if (movement.pcpExecutionStatus === PcpExecutionStatus.Executed) throw new ConflictException({ code: 'PCP_MOVEMENT_ALREADY_EXECUTED', message: 'Esta movimentacao ja foi executada pelo PCP.' });
      const executedAt = new Date();
      movement.pcpExecutionStatus = PcpExecutionStatus.Executed;
      movement.pcpExecutedByUserId = userId;
      movement.pcpExecutedAt = executedAt;
      movement.pcpExecutionObservation = dto.observation ?? null;
      await this.movements.save(movement, manager);
      await manager.getRepository(MovementItemEntity).update({ movementId: id, pcpExecutionStatus: PcpExecutionStatus.Pending }, {
        pcpExecutionStatus: PcpExecutionStatus.Executed, pcpExecutedByUserId: userId,
        pcpExecutedAt: executedAt, pcpExecutionObservation: dto.observation ?? null,
      });
      await this.audit.record({
        ...metadata, manager, userId, action: 'PCP_MOVEMENT_EXECUTE', entityType: 'MOVEMENT', entityId: id, result: 'SUCCESS',
        oldValues: { pcpExecutionStatus: PcpExecutionStatus.Pending },
        newValues: { codigoMovimentacao: movement.codigoMovimentacao, pcpExecutionStatus: PcpExecutionStatus.Executed, pcpExecutedByUserId: userId, pcpExecutedAt: executedAt, observation: dto.observation ?? null },
      });
    });
    return this.get(id);
  }
}
