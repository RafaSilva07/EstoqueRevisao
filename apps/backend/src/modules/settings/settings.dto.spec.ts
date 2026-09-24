import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateReviewDestinationsDto, UpdateSeparationTimeoutDto } from './settings.dto';

describe('DTOs de configuracoes operacionais', () => {
  it.each([5, 180, 1440])('aceita prazo valido de %s minutos', async (minutes) => {
    expect(await validate(plainToInstance(UpdateSeparationTimeoutDto, { minutes }))).toHaveLength(0);
  });
  it.each([0, 1.5, 1441])('rejeita prazo invalido de %s minutos', async (minutes) => {
    expect((await validate(plainToInstance(UpdateSeparationTimeoutDto, { minutes }))).length).toBeGreaterThan(0);
  });
  it('exige pelo menos um deposito cadastrado por UUID', async () => {
    expect(await validate(plainToInstance(UpdateReviewDestinationsDto, { stockLocationIds: [randomUUID()] }))).toHaveLength(0);
    expect((await validate(plainToInstance(UpdateReviewDestinationsDto, { stockLocationIds: [] }))).length).toBeGreaterThan(0);
    expect((await validate(plainToInstance(UpdateReviewDestinationsDto, { stockLocationIds: ['livre'] }))).length).toBeGreaterThan(0);
  });
});

