import { Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProductEntity } from '../products/entities/product.entity';
import { StockPositionEntity } from '../stocks/entities/stock-position.entity';
import { ShipmentEntity } from '../shipments/shipment.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';
import {
  DataQualityDimension,
  DataQualityIssue,
  DataQualityQuery,
  DataQualityReportDto,
  DataQualitySeverity,
  DataQualityStatus,
  DimensionScore,
} from './data-quality.types';

const SEVERITY_WEIGHT: Record<DataQualitySeverity, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

const DIMENSION_LABELS: Record<DataQualityDimension, string> = {
  COMPLETENESS: 'Completude Cadastral',
  VALIDITY: 'Validade de Lotes',
  CONSISTENCY: 'Consistência de Saldos',
  TIMELINESS: 'Tempestividade Operacional',
};

@Injectable()
export class DataQualityService {
  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly systemLogsService?: SystemLogsService,
  ) {}

  async getReport(query: DataQualityQuery = {}): Promise<DataQualityReportDto> {
    const now = new Date();
    const [products, positions, shipments] = await Promise.all([
      this.dataSource.getRepository(ProductEntity).find({ where: { active: true } }),
      this.dataSource
        .getRepository(StockPositionEntity)
        .createQueryBuilder('pos')
        .leftJoinAndSelect('pos.product', 'product')
        .leftJoinAndSelect('pos.batch', 'batch')
        .leftJoinAndSelect('pos.stockLocation', 'location')
        .getMany(),
      this.dataSource
        .getRepository(ShipmentEntity)
        .createQueryBuilder('shipment')
        .where("shipment.status IN ('EM_SEPARACAO', 'AGUARDANDO_RECEBIMENTO')")
        .getMany(),
    ]);

    const completenessIssues = this.checkCompleteness(products);
    const validityIssues = this.checkValidity(positions, now);
    const consistencyIssues = this.checkConsistency(positions);
    const timelinessIssues = this.checkTimeliness(shipments, now);

    const allIssues = [
      ...completenessIssues,
      ...validityIssues,
      ...consistencyIssues,
      ...timelinessIssues,
    ].sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);

    const dimensions: DimensionScore[] = [
      this.buildDimensionScore('COMPLETENESS', products.length, completenessIssues),
      this.buildDimensionScore('VALIDITY', positions.filter((p) => p.quantity > 0).length, validityIssues),
      this.buildDimensionScore('CONSISTENCY', positions.length, consistencyIssues),
      this.buildDimensionScore('TIMELINESS', shipments.length, timelinessIssues),
    ];

    const overallScore = this.computeOverallScore(dimensions);
    const status = this.resolveStatus(overallScore, allIssues);

    const filteredIssues = this.filterIssues(allIssues, query);

    if (this.systemLogsService) {
      this.systemLogsService
        .info({
          context: 'DataQualityService',
          description: `Auditoria de qualidade de dados executada: índice ${overallScore}% (${allIssues.length} inconsistências).`,
          details: {
            overallScore,
            status,
            totalIssues: allIssues.length,
            totalRecordsChecked: products.length + positions.length + shipments.length,
          },
        })
        .catch(() => undefined);
    }

    return {
      generatedAt: now.toISOString(),
      overallScore,
      status,
      summary: {
        totalRecordsChecked: products.length + positions.length + shipments.length,
        totalIssues: allIssues.length,
        highSeverity: allIssues.filter((i) => i.severity === 'HIGH').length,
        mediumSeverity: allIssues.filter((i) => i.severity === 'MEDIUM').length,
        lowSeverity: allIssues.filter((i) => i.severity === 'LOW').length,
      },
      dimensions,
      issues: filteredIssues,
    };
  }

  private checkCompleteness(products: ProductEntity[]): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];

    for (const product of products) {
      if (product.unitWeightGrams === null || product.unitWeightGrams <= 0) {
        issues.push({
          id: `PRODUCT_MISSING_WEIGHT:${product.id}`,
          ruleCode: 'PRODUCT_MISSING_WEIGHT',
          dimension: 'COMPLETENESS',
          severity: 'MEDIUM',
          entityType: 'PRODUCT',
          entityId: product.id,
          referenceCode: product.code,
          title: 'Produto ativo sem peso unitário',
          description: `O produto "${product.name}" (${product.code}) não possui peso unitário em gramas preenchido.`,
          recommendation: 'Acesse o cadastro de Produtos e informe o peso unitário para garantir cálculos corretos de carga.',
        });
      }

      if (product.shelfLifeYears === null || product.shelfLifeYears <= 0) {
        issues.push({
          id: `PRODUCT_MISSING_SHELF_LIFE:${product.id}`,
          ruleCode: 'PRODUCT_MISSING_SHELF_LIFE',
          dimension: 'COMPLETENESS',
          severity: 'LOW',
          entityType: 'PRODUCT',
          entityId: product.id,
          referenceCode: product.code,
          title: 'Produto ativo sem validade padrão',
          description: `O produto "${product.name}" (${product.code}) não possui prazo de validade padrão configurado.`,
          recommendation: 'Defina a validade padrão em anos no cadastro de Produtos para automatizar validações de lote.',
        });
      }
    }

    return issues;
  }

  private checkValidity(positions: StockPositionEntity[], now: Date): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];
    const todayStr = now.toISOString().slice(0, 10);
    const soonDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const soonStr = soonDate.toISOString().slice(0, 10);

    for (const pos of positions) {
      if (pos.quantity <= 0 || !pos.batch?.expirationDate) continue;

      const exp = pos.batch.expirationDate;
      const productCode = pos.product?.code ?? pos.productId;
      const batchCode = pos.batch.code;
      const locationName = pos.stockLocation?.name ?? pos.stockLocationId;

      if (exp < todayStr) {
        issues.push({
          id: `EXPIRED_BATCH_WITH_STOCK:${pos.id}`,
          ruleCode: 'EXPIRED_BATCH_WITH_STOCK',
          dimension: 'VALIDITY',
          severity: 'HIGH',
          entityType: 'STOCK_POSITION',
          entityId: pos.id,
          referenceCode: `${productCode} / Lote ${batchCode}`,
          title: 'Lote vencido com saldo ativo em estoque',
          description: `Posição no local "${locationName}" mantém saldo de ${pos.quantity} com validade expirada em ${exp}.`,
          recommendation: 'Realize revisão/baixa do lote vencido para evitar expedição de material impróprio.',
        });
      } else if (exp <= soonStr) {
        issues.push({
          id: `EXPIRING_SOON_BATCH_WITH_STOCK:${pos.id}`,
          ruleCode: 'EXPIRING_SOON_BATCH_WITH_STOCK',
          dimension: 'VALIDITY',
          severity: 'MEDIUM',
          entityType: 'STOCK_POSITION',
          entityId: pos.id,
          referenceCode: `${productCode} / Lote ${batchCode}`,
          title: 'Lote próximo do vencimento (<= 30 dias)',
          description: `Posição no local "${locationName}" possui saldo de ${pos.quantity} com vencimento próximo em ${exp}.`,
          recommendation: 'Priorize a movimentação ou revisão deste lote (FEFO).',
        });
      }
    }

    return issues;
  }

  private checkConsistency(positions: StockPositionEntity[]): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];

    for (const pos of positions) {
      if (pos.quantity < 0) {
        const productCode = pos.product?.code ?? pos.productId;
        const batchCode = pos.batch?.code ?? pos.batchId;
        issues.push({
          id: `NEGATIVE_STOCK_POSITION:${pos.id}`,
          ruleCode: 'NEGATIVE_STOCK_POSITION',
          dimension: 'CONSISTENCY',
          severity: 'HIGH',
          entityType: 'STOCK_POSITION',
          entityId: pos.id,
          referenceCode: `${productCode} / Lote ${batchCode}`,
          title: 'Saldo negativo detectado em posição de estoque',
          description: `A posição registra quantidade negativa (${pos.quantity}), violando a integridade física do estoque.`,
          recommendation: 'Audite as movimentações recentes do lote e realize ajuste de inventário.',
        });
      }
    }

    return issues;
  }

  private checkTimeliness(shipments: ShipmentEntity[], now: Date): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];
    const staleThresholdMs = 72 * 60 * 60 * 1000;

    for (const shipment of shipments) {
      if (
        shipment.status === 'EM_SEPARACAO' &&
        shipment.separationExpiresAt &&
        shipment.separationExpiresAt.getTime() < now.getTime()
      ) {
        issues.push({
          id: `STALE_SEPARATION_SHIPMENT:${shipment.id}`,
          ruleCode: 'STALE_SEPARATION_SHIPMENT',
          dimension: 'TIMELINESS',
          severity: 'HIGH',
          entityType: 'SHIPMENT',
          entityId: shipment.id,
          referenceCode: shipment.codigoMovimentacao,
          title: 'Separação expirada aguardando consolidação',
          description: `A remessa ${shipment.codigoMovimentacao} permanece em EM_SEPARACAO após o prazo limite (${shipment.separationExpiresAt.toISOString()}).`,
          recommendation: 'Abra o módulo de Separações em andamento para consolidar ou estornar automaticamente a remessa.',
        });
      }

      if (
        shipment.status === 'AGUARDANDO_RECEBIMENTO' &&
        shipment.createdAt &&
        now.getTime() - new Date(shipment.createdAt).getTime() > staleThresholdMs
      ) {
        issues.push({
          id: `UNRECEIVED_OLD_SHIPMENT:${shipment.id}`,
          ruleCode: 'UNRECEIVED_OLD_SHIPMENT',
          dimension: 'TIMELINESS',
          severity: 'LOW',
          entityType: 'SHIPMENT',
          entityId: shipment.id,
          referenceCode: shipment.codigoMovimentacao,
          title: 'Remessa aguardando recebimento há mais de 72h',
          description: `A remessa ${shipment.codigoMovimentacao} (${shipment.originSector} -> ${shipment.destinationSector}) está pendente há mais de 3 dias.`,
          recommendation: 'Verifique com o setor destinatário se houve esquecimento na confirmação ou necessidade de cancelamento.',
        });
      }
    }

    return issues;
  }

  private buildDimensionScore(
    dimension: DataQualityDimension,
    checkedCount: number,
    issues: DataQualityIssue[],
  ): DimensionScore {
    if (checkedCount === 0) {
      return {
        dimension,
        label: DIMENSION_LABELS[dimension],
        score: 100,
        checkedCount: 0,
        issueCount: 0,
      };
    }

    const penalty = issues.reduce((acc, issue) => {
      if (issue.severity === 'HIGH') return acc + 1.5;
      if (issue.severity === 'MEDIUM') return acc + 0.75;
      return acc + 0.35;
    }, 0);

    const rawScore = Math.max(0, Math.min(100, Math.round(((checkedCount - penalty) / checkedCount) * 100)));

    return {
      dimension,
      label: DIMENSION_LABELS[dimension],
      score: rawScore,
      checkedCount,
      issueCount: issues.length,
    };
  }

  private computeOverallScore(dimensions: DimensionScore[]): number {
    const active = dimensions.filter((d) => d.checkedCount > 0);
    if (active.length === 0) return 100;
    const sum = active.reduce((acc, d) => acc + d.score, 0);
    return Math.round(sum / active.length);
  }

  private resolveStatus(overallScore: number, issues: DataQualityIssue[]): DataQualityStatus {
    if (overallScore < 70 || issues.some((i) => i.severity === 'HIGH')) {
      return issues.some((i) => i.severity === 'HIGH') && overallScore < 85 ? 'CRITICAL' : 'ATTENTION';
    }
    if (overallScore < 95 || issues.length > 0) {
      return 'ATTENTION';
    }
    return 'HEALTHY';
  }

  private filterIssues(issues: DataQualityIssue[], query: DataQualityQuery): DataQualityIssue[] {
    return issues.filter((issue) => {
      if (query.dimension && issue.dimension !== query.dimension) return false;
      if (query.severity && issue.severity !== query.severity) return false;
      if (query.search) {
        const term = query.search.trim().toLowerCase();
        const matches =
          issue.referenceCode.toLowerCase().includes(term) ||
          issue.title.toLowerCase().includes(term) ||
          issue.description.toLowerCase().includes(term) ||
          issue.ruleCode.toLowerCase().includes(term);
        if (!matches) return false;
      }
      return true;
    });
  }
}
