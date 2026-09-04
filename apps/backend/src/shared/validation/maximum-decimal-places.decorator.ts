import { ValidationOptions, ValidateBy } from 'class-validator';

export function HasAtMostDecimalPlaces(
  decimalPlaces: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  const factor = 10 ** decimalPlaces;
  return ValidateBy({
    name: 'hasAtMostDecimalPlaces',
    constraints: [decimalPlaces],
    validator: {
      validate: (value: unknown): boolean => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return false;
        const scaled = value * factor;
        return Math.abs(scaled - Math.round(scaled)) < 1e-7;
      },
      defaultMessage: () => `A quantidade deve possuir no maximo ${decimalPlaces} casas decimais.`,
    },
  }, validationOptions);
}
