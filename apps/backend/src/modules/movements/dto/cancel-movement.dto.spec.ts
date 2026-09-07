import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CancelMovementDto } from './cancel-movement.dto';

describe('CancelMovementDto', () => {
  it('remove espacos externos e aceita motivo preenchido', async () => {
    const dto = plainToInstance(CancelMovementDto, { reason: '  Lancamento incorreto  ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.reason).toBe('Lancamento incorreto');
  });

  it.each(['', '   ', undefined])('rejeita motivo ausente: %s', async (reason) => {
    const dto = plainToInstance(CancelMovementDto, { reason });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
