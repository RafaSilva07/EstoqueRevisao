import { BadRequestException } from '@nestjs/common';
import { MovementReportQueryDto } from './dto/movement-report-query.dto';
import { ReviewReportQueryDto } from './dto/review-report-query.dto';
import { StockReportQueryDto } from './dto/stock-report-query.dto';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const repository = {
    movements: jest.fn(),
    reviews: jest.fn(),
    stock: jest.fn(),
  };
  const service = new ReportsService(repository as unknown as ReportsRepository);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.movements.mockResolvedValue({ items: [], meta: {}, totals: {} });
    repository.reviews.mockResolvedValue({ items: [], meta: {}, totals: {} });
    repository.stock.mockResolvedValue({ items: [], meta: {}, totals: {} });
  });

  it('rejeita periodo historico invertido', () => {
    const query = Object.assign(new MovementReportQueryDto(), {
      dateFrom: '2026-09-08T00:00:00.000Z',
      dateTo: '2026-09-07T00:00:00.000Z',
    });
    expect(() => service.movements(query)).toThrow(BadRequestException);
    expect(repository.movements).not.toHaveBeenCalled();
  });

  it('rejeita intervalo de validade invertido', () => {
    const query = Object.assign(new StockReportQueryDto(), {
      expirationFrom: '2026-10-01',
      expirationTo: '2026-09-01',
    });
    expect(() => service.stock(query)).toThrow(BadRequestException);
    expect(repository.stock).not.toHaveBeenCalled();
  });

  it('exporta CSV com BOM, separador e escape de aspas usando consulta sem paginacao', async () => {
    repository.reviews.mockResolvedValue({
      items: [{
        movementId: 'mov-1', occurredAt: '2026-09-07T12:00:00.000Z',
        productCode: 'P1', productName: 'Produto "Especial"', batchCode: 'COCINV',
        destination: 'Lata Boa', quantity: 5, unit: 'UN', responsible: 'admin',
      }],
      meta: {}, totals: {},
    });
    const query = new ReviewReportQueryDto();
    const csv = await service.reviewsCsv(query);
    expect(repository.reviews).toHaveBeenCalledWith(query, false);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"P1 - Produto ""Especial""";"COCINV";"Lata Boa";"5"');
  });
});
