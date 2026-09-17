import { ExecutionContext } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminGuard } from './admin.guard';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

describe('Administração de usuários', () => {
  it.each([undefined, [], ['PRODUCAO'], ['EXPEDICAO']])('nega acesso sem ADMIN: %s', (roles) => {
    const context = { switchToHttp: (): unknown => ({ getRequest: (): unknown => ({ user: roles ? { roles } : undefined }) }) } as unknown as ExecutionContext;
    expect(new AdminGuard().canActivate(context)).toBe(false);
  });
  it('permite ADMIN independentemente do modo operacional', () => {
    for (const sector of ['REVISAO', 'PRODUCAO', 'EXPEDICAO', 'PCP']) {
      const context = { switchToHttp: (): unknown => ({ getRequest: (): unknown => ({ user: { roles: ['ADMIN'], sector } }) }) } as unknown as ExecutionContext;
      expect(new AdminGuard().canActivate(context)).toBe(true);
    }
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
    for (const key of ['username', 'password', 'sector', 'roleCodes', 'status']) {
      expect((await validate(plainToInstance(UpdateUserDto, { [key]: null }))).length).toBeGreaterThan(0);
    }
    expect(await validate(plainToInstance(UpdateUserDto, { username: 'Novo' }))).toHaveLength(0);
  });
});
