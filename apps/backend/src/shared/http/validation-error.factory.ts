import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

interface ValidationDetail {
  field: string;
  messages: string[];
}

function flattenErrors(errors: ValidationError[], parent = ''): ValidationDetail[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const current = error.constraints
      ? [{ field, messages: Object.values(error.constraints) }]
      : [];
    return [...current, ...flattenErrors(error.children ?? [], field)];
  });
}

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'A requisicao contem dados invalidos.',
    details: flattenErrors(errors),
  });
}
