export interface OperationalLot {
  code: string;
  manufacturingDate: string;
  expirationDate: string;
}

export const emptyLot: OperationalLot = { code: '', manufacturingDate: '', expirationDate: '' };
