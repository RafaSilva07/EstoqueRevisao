import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('Permissões por setor', () => {
  const check = (sector: string, required: string[], permissions: string[]): boolean => {
    const reflector = { getAllAndOverride: (): string[] => required } as unknown as Reflector;
    const context = { getHandler: () => null, getClass: () => null,
      switchToHttp: () => ({ getRequest: (): { user: { sector: string; permissions: string[] } } => ({user:{sector,permissions}}) }),
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
});
