import { DataSource } from 'typeorm';
import { DataQualityService } from './data-quality.service';
import { ProductEntity } from '../products/entities/product.entity';
import { StockPositionEntity } from '../stocks/entities/stock-position.entity';
import { ShipmentEntity } from '../shipments/shipment.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';

describe('DataQualityService', () => {
  const buildMockDataSource = (
    products: Partial<ProductEntity>[],
    positions: Partial<StockPositionEntity>[],
    shipments: Partial<ShipmentEntity>[],
  ): DataSource => {
    const productRepo = { find: jest.fn().mockResolvedValue(products) };
    const posRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(positions),
      }),
    };
    const shipmentRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(shipments),
      }),
    };

    return {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === ProductEntity) return productRepo;
        if (entity === StockPositionEntity) return posRepo;
        if (entity === ShipmentEntity) return shipmentRepo;
        return null;
      }),
    } as unknown as DataSource;
  };

  it('retorna 100% HEALTHY quando todos os dados estao conformes', async () => {
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const ds = buildMockDataSource(
      [{ id: 'p1', code: 'PRD-001', name: 'Produto A', unitWeightGrams: 500, shelfLifeYears: 2, active: true }],
      [{ id: 'sp1', quantity: 10, product: { code: 'PRD-001' } as any, batch: { code: 'L01', expirationDate: futureDate } as any, stockLocation: { name: 'Geral' } as any }],
      [{ id: 'sh1', codigoMovimentacao: 'REM-01', status: 'AGUARDANDO_RECEBIMENTO', createdAt: new Date() }],
    );

    const logsMock = { info: jest.fn().mockResolvedValue({}) } as unknown as SystemLogsService;
    const service = new DataQualityService(ds, logsMock);

    const report = await service.getReport();

    expect(report.overallScore).toBe(100);
    expect(report.status).toBe('HEALTHY');
    expect(report.summary.totalIssues).toBe(0);
    expect(report.issues).toHaveLength(0);
    expect(logsMock.info).toHaveBeenCalledTimes(1);
  });

  it('detecta produtos incompletos, lotes vencidos, saldo negativo e separacao expirada', async () => {
    const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const expiredSeparation = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const ds = buildMockDataSource(
      [
        { id: 'p1', code: 'PRD-001', name: 'Sem Peso', unitWeightGrams: null, shelfLifeYears: null, active: true },
      ],
      [
        { id: 'sp1', quantity: 5, product: { code: 'PRD-001' } as any, batch: { code: 'L99', expirationDate: pastDate } as any, stockLocation: { name: 'Revisão' } as any },
        { id: 'sp2', quantity: -2, product: { code: 'PRD-001' } as any, batch: { code: 'L00', expirationDate: '2099-01-01' } as any, stockLocation: { name: 'Geral' } as any },
      ],
      [
        { id: 'sh1', codigoMovimentacao: 'REM-99', status: 'EM_SEPARACAO', separationExpiresAt: expiredSeparation, createdAt: new Date() },
      ],
    );

    const service = new DataQualityService(ds);
    const report = await service.getReport();

    expect(report.status).toBe('CRITICAL');
    expect(report.overallScore).toBeLessThan(70);
    expect(report.summary.highSeverity).toBe(3); // expired batch + negative stock + stale separation
    expect(report.summary.mediumSeverity).toBe(1); // missing weight
    expect(report.summary.lowSeverity).toBe(1); // missing shelf life
    expect(report.issues[0].severity).toBe('HIGH');
  });

  it('aplica filtros de dimensao, severidade e busca corretamente', async () => {
    const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const ds = buildMockDataSource(
      [{ id: 'p1', code: 'PRD-ABC', name: 'Produto Teste', unitWeightGrams: null, shelfLifeYears: 1, active: true }],
      [{ id: 'sp1', quantity: 5, product: { code: 'PRD-ABC' } as any, batch: { code: 'L10', expirationDate: pastDate } as any, stockLocation: { name: 'Geral' } as any }],
      [],
    );

    const service = new DataQualityService(ds);

    const onlyHigh = await service.getReport({ severity: 'HIGH' });
    expect(onlyHigh.issues).toHaveLength(1);
    expect(onlyHigh.issues[0].ruleCode).toBe('EXPIRED_BATCH_WITH_STOCK');

    const onlyCompleteness = await service.getReport({ dimension: 'COMPLETENESS', search: 'PRD-ABC' });
    expect(onlyCompleteness.issues).toHaveLength(1);
    expect(onlyCompleteness.issues[0].ruleCode).toBe('PRODUCT_MISSING_WEIGHT');
  });
});
