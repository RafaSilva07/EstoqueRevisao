import { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Request, Response, NextFunction } from 'express';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { MovementsController } from '../movements/movements.controller';
import { MovementsService } from '../movements/movements.service';
import { OperationalLotsService } from '../batches/operational-lots.service';
import { ProductsController } from '../products/products.controller';
import { ProductsService } from '../products/products.service';
import { ProductUnitConversionsService } from '../products/product-unit-conversions.service';
import { StockLocationsController } from '../stocks/stock-locations.controller';
import { StockLocationsService } from '../stocks/stock-locations.service';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { PermissionsGuard } from './guards/permissions.guard';

// Real HTTP routing and guards; fake sessions/services prevent any operational writes.
describe('Operações administrativas (HTTP)', () => {
  let app: INestApplication<Server>;
  let url: string;
  const write = jest.fn(() => ({ ok: true }));
  const id = '00000000-0000-4000-8000-000000000001';
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MovementsController, ProductsController, StockLocationsController, UsersController],
      providers: [
        { provide: MovementsService, useValue: { createExternalEntry: write, createExternalExit: write, cancel: write, createInternalTransfer: write, createReview: write } },
        { provide: OperationalLotsService, useValue: { preview: write } },
        { provide: ProductsService, useValue: { setStatus: write } },
        { provide: ProductUnitConversionsService, useValue: { setStatus: write } },
        { provide: StockLocationsService, useValue: { setStatus: write } },
        { provide: UsersService, useValue: { list: write, create: write, update: write, remove: write, roles: write } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = { id, roles: [req.headers['test-role'] ?? 'REVISAO'], sector: req.headers['test-sector'] ?? 'REVISAO', permissions: ['movements.create', 'movements.cancel', 'products.update', 'product-conversions.update', 'stocks.update'] };
      next();
    });
    app.useGlobalGuards(new PermissionsGuard(app.get(Reflector)));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => write.mockClear());

  it.each([
    ['POST', '/movements/external-entries'], ['POST', '/movements/external-exits'],
    ['POST', `/movements/${id}/cancellation`], ['PATCH', `/products/${id}/status`],
    ['PATCH', `/product-conversions/${id}/status`], ['PATCH', `/stocks/${id}/status`],
    ['GET', '/users'], ['GET', '/users/roles'], ['POST', '/users'], ['PATCH', `/users/${id}`], ['DELETE', `/users/${id}`],
  ])('%s %s exige ADMIN além das permissões', async (method, route) => {
    const body = method === 'GET' ? undefined : JSON.stringify({ active: false });
    for (const role of ['REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP']) {
      const denied = await fetch(url + route, { method, body, headers: { 'test-role': role, 'Content-Type': 'application/json' } });
      expect(denied.status).toBe(403);
    }
    expect(write).not.toHaveBeenCalled();
    const allowed = await fetch(url + route, { method, body, headers: { 'test-role': 'ADMIN', 'Content-Type': 'application/json' } });
    expect(allowed.ok).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it.each(['/movements/internal-transfers', '/movements/reviews', '/movements/resolve-lot'])('mantém %s para Revisão operacional', async (route) => {
    const response = await fetch(url + route, { method: 'POST', headers: { 'test-role': 'REVISAO' } });
    expect(response.ok).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it('preserva a restrição do modo operacional mesmo para ADMIN', async () => {
    for (const mode of ['REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP']) {
      const response = await fetch(url + '/movements/external-entries', { method: 'POST', headers: { 'test-role': 'ADMIN', 'x-operational-sector': mode } });
      expect(response.status).toBe(403);
    }
    expect(write).not.toHaveBeenCalled();
    const allowed = await fetch(url + '/movements/external-entries', { method: 'POST', headers: { 'test-role': 'ADMIN', 'x-operational-sector': 'ADMIN' } });
    expect(allowed.ok).toBe(true);
  });
});
