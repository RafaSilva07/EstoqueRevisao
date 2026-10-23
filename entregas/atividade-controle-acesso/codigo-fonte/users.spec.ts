import { ExecutionContext } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminGuard } from './admin.guard';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UpdatePermissionPresetDto } from './dto/permission-preset.dto';

describe('Administração de usuários', () => {
  it.each([undefined, [], ['PRODUCAO'], ['EXPEDICAO'], ['ADMIN_REVISAO_EXPEDICAO'], ['ADMIN_PRODUCAO_PCP']])('nega acesso sem ADMIN: %s', (roles) => {
    const context = { switchToHttp: (): unknown => ({ getRequest: (): unknown => ({ user: roles ? { roles } : undefined }) }) } as unknown as ExecutionContext;
    expect(new AdminGuard().canActivate(context)).toBe(false);
  });
  it('permite ADMIN sem alternância operacional explícita', () => {
    for (const sector of ['REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP']) {
      const context = { switchToHttp: (): unknown => ({ getRequest: (): unknown => ({ user: { roles: ['ADMIN'], sector } }) }) } as unknown as ExecutionContext;
      expect(new AdminGuard().canActivate(context)).toBe(true);
    }
  });
  it('libera ações administrativas somente no modo ADMIN ou sem alternância explícita', () => {
    const check = (mode?: string): boolean => {
      const context = { switchToHttp: (): unknown => ({ getRequest: (): unknown => ({
        headers: mode ? { 'x-operational-sector': mode } : {}, user: { roles: ['ADMIN'], sector: 'REVISAO' },
      }) }) } as unknown as ExecutionContext;
      return new AdminGuard().canActivate(context);
    };
    expect(check()).toBe(true);
    expect(check('ADMIN')).toBe(true);
    for (const mode of ['REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP']) expect(check(mode)).toBe(false);
  });
  it('valida login, senha, setor e perfis e rejeita null em edições', async () => {
    const valid = { username: ' operador ', password: 'senha-teste-segura', sector: 'PRODUCAO', roleCodes: ['PRODUCAO'] };
    const dto = plainToInstance(CreateUserDto, valid);
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.username).toBe('operador');
    expect(await validate(plainToInstance(CreateUserDto, { ...valid, sector: 'PCP', roleCodes: ['PCP'] }))).toHaveLength(0);
    for (const patch of [{ username: ' ' }, { password: 'curta' }, { sector: 'INVALIDO' }, { roleCodes: [] }, { roleCodes: ['ADMIN', 'ADMIN'] }]) {
      expect((await validate(plainToInstance(CreateUserDto, { ...valid, ...patch }))).length).toBeGreaterThan(0);
    }
    for (const key of ['username', 'password', 'sector', 'roleCodes', 'status', 'permissionCodes', 'applyPreset']) {
      expect((await validate(plainToInstance(UpdateUserDto, { [key]: null }))).length).toBeGreaterThan(0);
    }
    expect(await validate(plainToInstance(UpdateUserDto, { username: 'Novo' }))).toHaveLength(0);
  });
  it('exige confirmação explícita de propagação e versão válida ao salvar preset', async () => {
    const valid = { permissionCodes: [], applyToUsers: false, version: 1 };
    expect(await validate(plainToInstance(UpdatePermissionPresetDto, valid))).toHaveLength(0);
    for (const patch of [{ applyToUsers: undefined }, { applyToUsers: 'false' }, { version: 0 }, { permissionCodes: null }, { permissionCodes: ['products.read', 'products.read'] }]) {
      expect((await validate(plainToInstance(UpdatePermissionPresetDto, { ...valid, ...patch }))).length).toBeGreaterThan(0);
    }
    expect(await validate(plainToInstance(UpdateUserDto, { permissionCodes: [], applyPreset: false }))).toHaveLength(0);
  });
});
