import { describe, expect, it } from 'vitest';
import { UserSession } from './api';
import { userForOperationalMode } from './operational-mode';
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
});
