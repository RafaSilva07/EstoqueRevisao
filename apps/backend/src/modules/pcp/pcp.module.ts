import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity } from '../audit/entities/audit-log.entity';
import { MovementsModule } from '../movements/movements.module';
import { MovementEntity } from '../movements/entities/movement.entity';
import { ShipmentEntity, ShipmentItemEntity } from '../shipments/shipment.entity';
import { PcpMovementsController } from './pcp-movements.controller';
import { PcpMovementsRepository } from './pcp-movements.repository';
import { PcpMovementsService } from './pcp-movements.service';

@Module({
  imports: [TypeOrmModule.forFeature([MovementEntity, AuditLogEntity, ShipmentEntity, ShipmentItemEntity]), MovementsModule],
  controllers: [PcpMovementsController],
  providers: [PcpMovementsRepository, PcpMovementsService],
})
export class PcpModule {}
