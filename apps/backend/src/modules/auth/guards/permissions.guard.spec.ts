import { BadRequestException, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { REQUIRED_PERMISSIONS_KEY } from '../auth.constants';

describe('Permissões por setor', () => {
  const check = (sector: string, required: string[], permissions: string[], roles: string[] = [], requestedSector?: string, any: string[] = []): boolean => {
    const reflector = { getAllAndOverride: (key: string): string[] => key === REQUIRED_PERMISSIONS_KEY ? required : any } as unknown as Reflector;
    const context = { getHandler: () => null, getClass: () => null,
      switchToHttp: () => ({ getRequest: (): { headers: Record<string, string>; user: { sector: string; permissions: string[]; roles: string[] } } => ({
        headers: requestedSector ? { 'x-operational-sector': requestedSector } : {}, user: { sector, permissions, roles },
      }) }),
    } as unknown as ExecutionContext;
    return new PermissionsGuard(reflector).canActivate(context);
  };
  it.each(['PRODUCAO','EXPEDICAO'])('bloqueia operações internas mesmo com permissão indevida: %s', (sector) => {
    for (const permission of ['movements.create','movements.cancel','stocks.update','stock-positions.read']) {
      expect(check(sector,[permission],[permission])).toBe(false);
    }
    expect(check(sector,['shipments.decide'],['shipments.decide'])).toBe(true);
    expect(check(sector,['shipments.decide'],[])).toBe(false);
    expect(check(sector,['products.read'],['products.read'])).toBe(true);
    expect(check(sector,['products.create'],['products.create'])).toBe(true);
    expect(check(sector,['products.update'],['products.update'])).toBe(true);
  });
  it('preserva permissões internas da Revisão', () => {
    expect(check('REVISAO',['movements.create'],['movements.create'])).toBe(true);
    expect(check('REVISAO',['movements.create'],[])).toBe(false);
  });
  it('permite que ADMIN assuma as restrições do setor operacional escolhido', () => {
    expect(check('REVISAO', ['shipments.create'], ['shipments.create'], ['ADMIN'], 'PRODUCAO')).toBe(true);
    expect(check('REVISAO', ['movements.create'], ['movements.create'], ['ADMIN'], 'PRODUCAO')).toBe(false);
    expect(check('REVISAO', ['movements.create'], ['movements.create'], ['ADMIN'], 'REVISAO')).toBe(true);
    expect(check('REVISAO', ['movements.cancel'], ['movements.cancel'], ['ADMIN'], 'REVISAO')).toBe(true);
    expect(check('REVISAO', ['products.update'], ['products.update'], ['ADMIN'], 'REVISAO')).toBe(true);
    expect(check('REVISAO', ['pcp.movements.execute'], ['pcp.movements.execute'], ['ADMIN'], 'PCP')).toBe(true);
    expect(check('REVISAO', ['movements.create'], ['movements.create'], ['ADMIN'], 'PCP')).toBe(false);
    expect(check('REVISAO', ['movements.cancel'], ['movements.cancel'], ['ADMIN'], 'ADMIN')).toBe(true);
    expect(check('REVISAO', ['products.update'], ['products.update'], ['ADMIN'], 'ADMIN')).toBe(true);
    expect(check('REVISAO', ['products.create'], ['products.create'], ['ADMIN'], 'PCP')).toBe(true);
    expect(check('REVISAO', ['product-conversions.create'], ['product-conversions.create'], ['ADMIN'], 'PCP')).toBe(false);
  });
  it('autoriza somente a funcionalidade concedida, com alternativa para validar lote', () => {
    expect(check('REVISAO', ['movements.external-entry'], ['movements.external-entry'])).toBe(true);
    expect(check('REVISAO', ['movements.external-exit'], ['movements.external-entry'])).toBe(false);
    expect(check('REVISAO', ['movements.review'], ['movements.create'])).toBe(false);
    expect(check('REVISAO', [], ['movements.external-entry'], [], undefined, ['movements.review', 'movements.external-entry'])).toBe(true);
    expect(check('REVISAO', [], [], [], undefined, ['movements.review', 'movements.external-entry'])).toBe(false);
    expect(check('PRODUCAO', ['movements.external-entry'], ['movements.external-entry'])).toBe(false);
    expect(check('PCP', ['movements.external-entry'], ['movements.external-entry'])).toBe(false);
  });
  it('rejeita troca por não administrador ou para setor inválido', () => {
    expect(() => check('PRODUCAO', ['shipments.read'], ['shipments.read'], ['PRODUCAO'], 'REVISAO')).toThrow(ForbiddenException);
    expect(() => check('REVISAO', ['shipments.read'], ['shipments.read'], ['ADMIN'], 'INVALIDO')).toThrow(BadRequestException);
  });

  it('restringe administradores de área aos setores atribuídos, sem modo Admin', () => {
    const permissions = ['shipments.create', 'movements.create', 'pcp.movements.execute'];
    expect(check('REVISAO', ['movements.create'], permissions, ['ADMIN_REVISAO_EXPEDICAO'], 'REVISAO')).toBe(true);
    expect(check('REVISAO', ['shipments.create'], permissions, ['ADMIN_REVISAO_EXPEDICAO'], 'EXPEDICAO')).toBe(true);
    expect(() => check('REVISAO', ['shipments.create'], permissions, ['ADMIN_REVISAO_EXPEDICAO'], 'PRODUCAO')).toThrow(ForbiddenException);
    expect(() => check('REVISAO', ['shipments.create'], permissions, ['ADMIN_REVISAO_EXPEDICAO'], 'ADMIN')).toThrow(ForbiddenException);
    expect(check('PRODUCAO', ['shipments.create'], permissions, ['ADMIN_PRODUCAO_PCP'], 'PRODUCAO')).toBe(true);
    expect(check('PRODUCAO', ['pcp.movements.execute'], permissions, ['ADMIN_PRODUCAO_PCP'], 'PCP')).toBe(true);
    expect(() => check('PRODUCAO', ['movements.create'], permissions, ['ADMIN_PRODUCAO_PCP'], 'REVISAO')).toThrow(ForbiddenException);
    expect(() => check('PRODUCAO', ['shipments.create'], permissions, ['ADMIN_PRODUCAO_PCP'], 'ADMIN')).toThrow(ForbiddenException);
  });
});
