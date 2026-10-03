import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

describe('CSV do histórico (HTTP)', () => {
  let app: INestApplication<Server>;
  let url: string;
  const exportCsv = jest.fn().mockResolvedValue('\uFEFF"Registro";"Produto"\r\n');
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [HistoryController],
      providers: [{ provide: HistoryService, useValue: { exportCsv } }] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use((request: Request, _response: Response, next: NextFunction) => {
      request.user = { roles: ['REVISAO'], sector: 'REVISAO', permissions: request.headers['test-permission'] ? [request.headers['test-permission']] : [] };
      next();
    });
    app.useGlobalGuards(new PermissionsGuard(app.get(Reflector)));
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1/history/export.csv`;
  });
  afterAll(async () => app?.close());
  beforeEach(() => exportCsv.mockClear());

  it('baixa UTF-8 como anexo e valida os filtros', async () => {
    const response = await fetch(`${url}?search=005601.90&scope=DONE`, { headers: { 'test-permission': 'movements.read' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('historico-finalizadas.csv');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain('"Registro";"Produto"');
    expect(exportCsv).toHaveBeenCalledTimes(1);
    const invalid = await fetch(`${url}?scope=UNKNOWN`, { headers: { 'test-permission': 'movements.read' } });
    expect(invalid.status).toBe(400);
    expect(exportCsv).toHaveBeenCalledTimes(1);
  });

  it('exige uma das permissões de leitura do histórico', async () => {
    expect((await fetch(url)).status).toBe(403);
    expect(exportCsv).not.toHaveBeenCalled();
    expect((await fetch(url, { headers: { 'test-permission': 'shipments.read' } })).status).toBe(200);
  });
});
