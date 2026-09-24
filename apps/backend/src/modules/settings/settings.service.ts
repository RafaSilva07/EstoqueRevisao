import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditRequestMetadata } from '../audit/audit.types';
import { StockLocationKind } from '../stocks/domain/stock-location-kind.enum';
import { ReviewLocationRole } from '../stocks/domain/review-location-role.enum';
import { StockLocationEntity } from '../stocks/entities/stock-location.entity';
import { ReviewDestinationEntity } from './review-destination.entity';
import { SystemSettingEntity } from './system-setting.entity';

export const IMMEDIATE_SEPARATION_MINUTES = 'immediate_separation_minutes';

@Injectable()
export class SettingsService {
  constructor(private readonly dataSource: DataSource, private readonly audit: AuditService) {}

  async getOperational(manager: EntityManager = this.dataSource.manager): Promise<{ immediateSeparationMinutes: number; reviewDestinations: StockLocationEntity[] }> {
    const [setting, destinations] = await Promise.all([
      manager.findOneBy(SystemSettingEntity, { key: IMMEDIATE_SEPARATION_MINUTES }),
      manager.getRepository(ReviewDestinationEntity).createQueryBuilder('configuration')
        .innerJoinAndSelect('configuration.stockLocation', 'location')
        .where('location.active = true').orderBy('location.name', 'ASC').getMany(),
    ]);
    if (!setting) throw new ConflictException('A configuracao do prazo de separacao nao foi inicializada.');
    return {
      immediateSeparationMinutes: Number(setting.value),
      reviewDestinations: destinations.map((item) => item.stockLocation),
    };
  }

  async separationMinutes(manager: EntityManager): Promise<number> {
    return (await this.getOperational(manager)).immediateSeparationMinutes;
  }

  async reviewDestinations(manager: EntityManager): Promise<StockLocationEntity[]> {
    return (await this.getOperational(manager)).reviewDestinations;
  }

  async updateTimeout(minutes: number, userId: string, metadata: AuditRequestMetadata): Promise<Awaited<ReturnType<SettingsService['getOperational']>>> {
    await this.dataSource.transaction(async (manager) => {
      const previous = await manager.findOneBy(SystemSettingEntity, { key: IMMEDIATE_SEPARATION_MINUTES });
      await manager.save(Object.assign(new SystemSettingEntity(), { key: IMMEDIATE_SEPARATION_MINUTES, value: String(minutes), updatedById: userId }));
      await this.audit.record({ ...metadata, manager, userId, action: 'SETTINGS_SEPARATION_TIMEOUT_UPDATE', entityType: 'SYSTEM_SETTING', entityId: IMMEDIATE_SEPARATION_MINUTES, result: 'SUCCESS', oldValues: { minutes: previous ? Number(previous.value) : null }, newValues: { minutes } });
    });
    return this.getOperational();
  }

  async updateReviewDestinations(ids: string[], userId: string, metadata: AuditRequestMetadata): Promise<Awaited<ReturnType<SettingsService['getOperational']>>> {
    const unique = [...new Set(ids)];
    if (unique.length !== ids.length) throw new BadRequestException('Um deposito nao pode ser selecionado mais de uma vez.');
    await this.dataSource.transaction(async (manager) => {
      const locations = await manager.findBy(StockLocationEntity, { id: In(unique) });
      if (locations.length !== unique.length || locations.some((item) => !item.active || item.kind === StockLocationKind.External || item.sector || item.reviewRole === ReviewLocationRole.Source)) {
        throw new BadRequestException('Selecione somente depositos internos, ativos e cadastrados.');
      }
      const before = await manager.find(ReviewDestinationEntity);
      await manager.createQueryBuilder().delete().from(ReviewDestinationEntity).execute();
      await manager.save(unique.map((stockLocationId) => Object.assign(new ReviewDestinationEntity(), { stockLocationId })));
      await this.audit.record({ ...metadata, manager, userId, action: 'SETTINGS_REVIEW_DESTINATIONS_UPDATE', entityType: 'REVIEW_PROCESS_CONFIGURATION', entityId: 'review-destinations', result: 'SUCCESS', oldValues: { stockLocationIds: before.map((item) => item.stockLocationId) }, newValues: { stockLocationIds: unique } });
    });
    return this.getOperational();
  }
}

