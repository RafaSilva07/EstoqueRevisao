import { redactSensitive } from './redact-sensitive';

describe('redactSensitive', () => {
  it('remove segredos em objetos aninhados sem alterar dados operacionais', () => {
    expect(
      redactSensitive({
        username: 'operador',
        password: 'nao-deve-aparecer',
        nested: {
          authorization: 'Bearer token',
          entityId: '123',
        },
      }),
    ).toEqual({
      username: 'operador',
      password: '[REDACTED]',
      nested: {
        authorization: '[REDACTED]',
        entityId: '123',
      },
    });
  });
});
