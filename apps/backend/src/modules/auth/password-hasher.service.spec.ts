import { ConfigService } from '@nestjs/config';
import { PasswordHasherService } from './password-hasher.service';

describe('PasswordHasherService', () => {
  const configService = new ConfigService({
    ARGON2_MEMORY_COST: 19456,
    ARGON2_TIME_COST: 2,
    ARGON2_PARALLELISM: 1,
  });
  const service = new PasswordHasherService(configService);

  it('gera hash Argon2id com salt e valida somente a senha correta', async () => {
    const password = 'uma-senha-segura';
    const firstHash = await service.hash(password);
    const secondHash = await service.hash(password);

    expect(firstHash).toMatch(/^\$argon2id\$/);
    expect(secondHash).toMatch(/^\$argon2id\$/);
    expect(firstHash).not.toBe(secondHash);
    await expect(service.verify(firstHash, password)).resolves.toBe(true);
    await expect(service.verify(firstHash, 'senha-incorreta')).resolves.toBe(false);
  });
});
