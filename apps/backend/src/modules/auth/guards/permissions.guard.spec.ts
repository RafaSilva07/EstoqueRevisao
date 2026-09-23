import { BadRequestException, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('Permissões por setor', () => {
  const check = (sector: string, required: string[], permissions: string[], roles: string[] = [], requestedSector?: string): boolean => {
    const reflector = { getAllAndOverride: (): string[] => required } as unknown as Reflector;
    const context = { getHandler: () => null, getClass: () => null,
      switchToHttp: () => ({ getRequest: (): { headers: Record<string, string>; user: { sector: string; permissions: string[]; roles: string[] } } => ({
        headers: requestedSector ? { 'x-operational-sector': requestedSector } : {}, user: { sector, permissions, roles },
      }) }),
    } as unknown as ExecutionContext;
    return new PermissionsGuard(reflector).canActivate(context);
  };
  it.each(['PRODUCAO','EXPEDICAO'])('bloqueia operações internas mesmo com permissão indevida: %s', (sector) => {
    for (const permission of ['movements.create','movements.cancel','stocks.update','stock-positions.read','products.update']) {
      expect(check(sector,[permission],[permission])).toBe(false);
    }
    expect(check(sector,['shipments.decide'],['shipments.decide'])).toBe(true);
    expect(check(sector,['shipments.decide'],[])).toBe(false);
    expect(check(sector,['products.read'],['products.read'])).toBe(true);
  });
  it('preserva permissões internas da Revisão', () => {
    expect(check('REVISAO',['movements.create'],['movements.create'])).toBe(true);
    expect(check('REVISAO',['movements.create'],[])).toBe(false);
  });
  it('permite que ADMIN assuma as restrições do setor operacional escolhido', () => {
    expect(check('REVISAO', ['shipments.create'], ['shipments.create'], ['ADMIN'], 'PRODUCAO')).toBe(true);
    expect(check('REVISAO', ['movements.create'], ['movements.create'], ['ADMIN'], 'PRODUCAO')).toBe(false);
    expect(check('REVISAO', ['movements.create'], ['movements.create'], ['ADMIN'], 'REVISAO')).toBe(true);
    expect(check('REVISAO', ['movements.cancel'], ['movements.cancel'], ['ADMIN'], 'REVISAO')).toBe(false);
    expect(check('REVISAO', ['products.update'], ['products.update'], ['ADMIN'], 'REVISAO')).toBe(false);
    expect(check('REVISAO', ['pcp.movements.execute'], ['pcp.movements.execute'], ['ADMIN'], 'PCP')).toBe(true);
    expect(check('REVISAO', ['movements.create'], ['movements.create'], ['ADMIN'], 'PCP')).toBe(false);
    expect(check('REVISAO', ['movements.cancel'], ['movements.cancel'], ['ADMIN'], 'ADMIN')).toBe(true);
    expect(check('REVISAO', ['products.update'], ['products.update'], ['ADMIN'], 'ADMIN')).toBe(true);
  });
  it('rejeita troca por não administrador ou para setor inválido', () => {
    expect(() => check('PRODUCAO', ['shipments.read'], ['shipments.read'], ['PRODUCAO'], 'REVISAO')).toThrow(ForbiddenException);
    expect(() => check('REVISAO', ['shipments.read'], ['shipments.read'], ['ADMIN'], 'INVALIDO')).toThrow(BadRequestException);
  });
});
