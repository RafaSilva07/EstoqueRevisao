import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserPreferencesDto } from './user-preferences.dto';

describe('Preferências visuais', () => {
  it('aceita tema e cor hexadecimal ou fundo padrão', async () => {
    expect(await validate(plainToInstance(UpdateUserPreferencesDto, { theme: 'DARK', backgroundColor: '#f4a8c8' }))).toHaveLength(0);
    expect(await validate(plainToInstance(UpdateUserPreferencesDto, { theme: 'LIGHT', backgroundColor: null }))).toHaveLength(0);
  });

  it('rejeita temas e cores fora do contrato', async () => {
    for (const input of [{ theme: 'AUTO', backgroundColor: '#ffffff' }, { theme: 'DARK', backgroundColor: 'pink' },
      { theme: 'LIGHT', backgroundColor: 'var(--primary)' }, { backgroundColor: '#ffffff' }]) {
      expect((await validate(plainToInstance(UpdateUserPreferencesDto, input))).length).toBeGreaterThan(0);
    }
  });
});
