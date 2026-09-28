import { describe, expect, it } from 'vitest';
import { UserSession } from './api';
import { allowedOperationalModes, userForOperationalMode } from './operational-mode';
import { menuActions } from './navigation-model';

const administrator: UserSession = {
  id: 'admin', username: 'Administrador', sector: 'REVISAO', roles: ['ADMIN'],
  permissions: ['movements.read', 'movements.create', 'movements.cancel', 'products.read', 'products.update', 'shipments.read', 'pcp.movements.execute'],
};

describe('escopo do modo operacional administrativo', () => {
  it('mantém o acesso completo no modo Admin', () => {
    expect(userForOperationalMode(administrator, 'ADMIN')).toEqual(administrator);
  });

  it('projeta exatamente o perfil operacional ao alternar de modo', () => {
    const review = userForOperationalMode(administrator, 'REVISAO');
    expect(review).toMatchObject({
      sector: 'REVISAO', roles: ['REVISAO'], permissions: ['movements.read', 'movements.create', 'products.read', 'products.update', 'shipments.read'],
    });
    expect(userForOperationalMode(administrator, 'PCP')).toMatchObject({
      sector: 'PCP', roles: ['PCP'], permissions: ['products.read', 'products.update', 'shipments.read', 'pcp.movements.execute'],
    });
    expect(menuActions('operations', review).map((action) => action.page)).toEqual(['new-transfer', 'new-review']);
    expect(menuActions('more', review).some((action) => action.page === 'users')).toBe(false);
    expect(menuActions('operations', userForOperationalMode(administrator, 'ADMIN')).map((action) => action.page)).toEqual(['new-entry', 'new-exit', 'new-transfer', 'new-review']);
  });

  it('limita o administrador Produção e PCP aos dois modos operacionais', () => {
    const area = { ...administrator, sector: 'PRODUCAO' as const, roles: ['ADMIN_PRODUCAO_PCP'], permissions: ['shipments.create', 'shipments.decide', 'pcp.movements.read', 'pcp.movements.execute', 'products.read'] };
    expect(allowedOperationalModes(area)).toEqual(['PRODUCAO', 'PCP']);
    expect(userForOperationalMode(area, 'PRODUCAO')).toMatchObject({ sector: 'PRODUCAO', roles: ['PRODUCAO'], permissions: ['shipments.create', 'shipments.decide', 'products.read'] });
    expect(userForOperationalMode(area, 'PCP')).toMatchObject({ sector: 'PCP', roles: ['PCP'], permissions: ['pcp.movements.read', 'pcp.movements.execute', 'products.read'] });
    expect(() => userForOperationalMode(area, 'ADMIN')).toThrow('Modo operacional não permitido.');
    expect(() => userForOperationalMode(area, 'REVISAO')).toThrow('Modo operacional não permitido.');
  });

  it('limita o administrador Revisão e Expedição aos dois modos operacionais', () => {
    const area = { ...administrator, roles: ['ADMIN_REVISAO_EXPEDICAO'] };
    expect(allowedOperationalModes(area)).toEqual(['REVISAO', 'EXPEDICAO']);
    expect(userForOperationalMode(area, 'EXPEDICAO')).toMatchObject({ sector: 'EXPEDICAO', roles: ['EXPEDICAO'] });
    expect(() => userForOperationalMode(area, 'PCP')).toThrow('Modo operacional não permitido.');
  });
});
