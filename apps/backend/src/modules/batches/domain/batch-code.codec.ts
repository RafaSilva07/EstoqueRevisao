import { Injectable } from '@nestjs/common';

const DIGIT_LETTERS = 'CONSERVADI';
const CODE_PATTERN = /^[CONSERVADI]{6}$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const SUPPORTED_YEAR_START = 2000;
const SUPPORTED_YEAR_END = 2099;

export type BatchCodeErrorCode =
  | 'BATCH_CODE_REQUIRED'
  | 'INVALID_BATCH_CODE'
  | 'INVALID_MANUFACTURING_DATE'
  | 'UNSUPPORTED_MANUFACTURING_YEAR'
  | 'BATCH_MANUFACTURING_MISMATCH';

export class BatchCodeError extends Error {
  constructor(
    readonly code: BatchCodeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = BatchCodeError.name;
  }
}

export interface ResolvedBatchCode {
  code: string;
  manufacturingDate: string;
}

@Injectable()
export class BatchCodeCodec {
  encodeDigit(digit: number): string {
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) {
      throw new BatchCodeError('INVALID_BATCH_CODE', 'O digito do lote deve estar entre 0 e 9.');
    }
    return DIGIT_LETTERS[digit];
  }

  decodeCharacter(character: string): number {
    const normalized = character.toUpperCase();
    const digit = DIGIT_LETTERS.indexOf(normalized);
    if (character.length !== 1 || digit < 0) {
      throw this.invalidCode();
    }
    return digit;
  }

  encode(manufacturingDate: string): string {
    const { year, month, day } = this.parseManufacturingDate(manufacturingDate);
    if (year < SUPPORTED_YEAR_START || year > SUPPORTED_YEAR_END) {
      throw new BatchCodeError(
        'UNSUPPORTED_MANUFACTURING_YEAR',
        'A data de fabricacao deve estar entre 2000-01-01 e 2099-12-31.',
      );
    }
    const digits = `${this.twoDigits(day)}${this.twoDigits(month)}${this.twoDigits(year % 100)}`;
    return [...digits].map((digit) => this.encodeDigit(Number(digit))).join('');
  }

  decode(code: string): string {
    const normalized = code.trim().toUpperCase();
    if (!CODE_PATTERN.test(normalized)) {
      throw this.invalidCode();
    }
    const digits = [...normalized].map((character) => this.decodeCharacter(character)).join('');
    const day = Number(digits.slice(0, 2));
    const month = Number(digits.slice(2, 4));
    const year = SUPPORTED_YEAR_START + Number(digits.slice(4, 6));
    const date = `${year}-${this.twoDigits(month)}-${this.twoDigits(day)}`;
    this.parseManufacturingDate(date);
    return date;
  }

  resolve(code?: string, manufacturingDate?: string): ResolvedBatchCode {
    if (!code && !manufacturingDate) {
      throw new BatchCodeError(
        'BATCH_CODE_REQUIRED',
        'Informe o lote ou a data de fabricacao.',
      );
    }

    const normalizedCode = code?.trim().toUpperCase();
    const dateFromCode = normalizedCode ? this.decode(normalizedCode) : undefined;
    const codeFromDate = manufacturingDate ? this.encode(manufacturingDate) : undefined;

    if (normalizedCode && codeFromDate && normalizedCode !== codeFromDate) {
      throw new BatchCodeError(
        'BATCH_MANUFACTURING_MISMATCH',
        'O lote informado nao corresponde a data de fabricacao.',
      );
    }

    return {
      code: normalizedCode ?? codeFromDate as string,
      manufacturingDate: manufacturingDate ?? dateFromCode as string,
    };
  }

  private parseManufacturingDate(value: string): { year: number; month: number; day: number } {
    const match = ISO_DATE_PATTERN.exec(value);
    if (!match) {
      throw this.invalidDate();
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day
    ) {
      throw this.invalidDate();
    }
    return { year, month, day };
  }

  private twoDigits(value: number): string {
    return value.toString().padStart(2, '0');
  }

  private invalidCode(): BatchCodeError {
    return new BatchCodeError(
      'INVALID_BATCH_CODE',
      'O lote deve possuir exatamente 6 letras da codificacao CONSERVADI.',
    );
  }

  private invalidDate(): BatchCodeError {
    return new BatchCodeError(
      'INVALID_MANUFACTURING_DATE',
      'A data de fabricacao informada nao e valida.',
    );
  }
}
