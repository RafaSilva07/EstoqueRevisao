import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DataQualityController } from '../data-quality/data-quality.controller';
import { DataQualityService } from '../data-quality/data-quality.service';
import { ProductUnitConversionsService } from '../products/product-unit-conversions.service';
import { ProductsController } from '../products/products.controller';
import { ProductsService } from '../products/products.service';
import { SystemLogsController } from '../system-logs/system-logs.controller';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { AuthenticatedUser } from './authenticated-user.interface';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { JwtStrategy } from './jwt.strategy';

describe('Ferramentas técnicas (HTTP)', () => {
  let app: INestApplication;
  let url: string;
  const secret = 'technical-operations-test-secret';
  const jwt = new JwtService({ secret });
  const id = '00000000-0000-4000-8000-000000000001';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SystemLogsController, DataQualityController, ProductsController],
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: new ConfigService({ JWT_ACCESS_SECRET: secret }) },
        {
          provide: AuthService,
          useValue: {
            validateAccess: (role: string): AuthenticatedUser => ({
              id,
              username: role,
              sessionId: id,
              sector: 'REVISAO',
              roles: [role],
              permissions: ['products.read'],
            }),
          },
        },
        {
          provide: SystemLogsService,
          useValue: {
            queryLogs: jest.fn().mockResolvedValue({}),
            getMetrics: jest.fn().mockResolvedValue({}),
            getCountByErrorCode: jest.fn().mockResolvedValue([]),
            getLogById: jest.fn().mockResolvedValue({ id }),
          },
        },
        { provide: DataQualityService, useValue: { getReport: jest.fn().mockResolvedValue({}) } },
        { provide: ProductsService, useValue: {} },
        { provide: ProductUnitConversionsService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    const reflector = app.get(Reflector);
    app.useGlobalGuards(new JwtAuthGuard(reflector), new PermissionsGuard(reflector));
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => { await app?.close(); });

  it.each([
    ['GET', '/logs', 200],
    ['GET', '/logs/metrics', 200],
    ['GET', '/logs/stats/count-by-error', 200],
    ['GET', '/logs/' + id, 200],
    ['GET', '/data-quality/report', 200],
    ['GET', '/products/simulate/expected-not-found', 404],
    ['GET', '/products/simulate/expected-conflict', 409],
    ['GET', '/products/simulate/unexpected-database', 500],
    ['GET', '/products/simulate/unexpected-crash', 500],
    ['POST', '/products/simulate-failure', 409],
  ])('%s %s só permite acesso ao Admin geral em modo administrativo', async (method, path, expectedStatus) => {
    const request = (role?: string, mode?: string): Promise<Response> => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (role) headers.set('Authorization', 'Bearer ' + jwt.sign({ sub: role, sid: id }));
      if (mode) headers.set('x-operational-sector', mode);
      return fetch(url + path, { method, headers, body: method === 'POST' ? JSON.stringify({ type: 'conflict' }) : undefined });
    };

    expect((await request()).status).toBe(401);
    for (const role of ['REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP', 'ADMIN_REVISAO_EXPEDICAO', 'ADMIN_PRODUCAO_PCP']) {
      expect((await request(role)).status).toBe(403);
    }
    expect((await request('ADMIN', 'REVISAO')).status).toBe(403);
    expect((await request('ADMIN', 'ADMIN')).status).toBe(expectedStatus);
  });
});
