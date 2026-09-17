export interface UserSession {
  id: string;
  username: string;
  sector?: 'REVISAO' | 'PRODUCAO' | 'EXPEDICAO';
  roles: string[];
  permissions: string[];
}

export interface AuthenticationResult {
  accessToken: string;
  user: UserSession;
}

export interface Paginated<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface Product {
  id: string;
  code: string;
  name: string;
  defaultUnit: string;
  unitsPerPackage?: number | null;
  unitProducts?: Product[];
  shelfLifeYears?: number | null;
  active: boolean;
}

export interface Batch {
  id: string;
  productId: string;
  code: string;
  manufacturingDate: string;
  expirationDate: string;
  product?: Product;
}

export interface ResolvedBatchCode {
  code: string;
  manufacturingDate: string;
}

export interface UnitConversion {
  id: string;
  productId: string;
  fromUnit: string;
  toUnit: string;
  factor: number;
  active: boolean;
}

export type StockLocationKind = 'STOCK' | 'SUBSTOCK' | 'EXTERNAL';

export interface StockLocation {
  sector?: string | null;
  id: string;
  code: string;
  name: string;
  description: string | null;
  kind: StockLocationKind;
  parentId: string | null;
  active: boolean;
  reviewRole: 'SOURCE' | 'DESTINATION' | null;
}

export interface StockPosition {
  id: string;
  productId: string;
  batchId: string;
  stockLocationId: string;
  quantity: number;
  product: Product;
  batch: Batch;
  stockLocation: StockLocation;
  createdAt: string;
  updatedAt: string;
}

export interface MovementItem {
  outputProductId?: string | null;
  outputProduct?: Product | null;
  outputBatch?: Batch | null;
  outputQuantity?: number | null;
  unitsPerPackage?: number | null;
  outputProductSnapshot?: Pick<Product, 'code' | 'name' | 'defaultUnit'> | null;
  id: string;
  productId: string;
  batchId: string;
  quantity: number;
  product: Product;
  productSnapshot?: Pick<Product, 'code' | 'name' | 'defaultUnit'> | null;
  batch: Batch;
  destinationBatchId: string | null;
  destinationBatch: Batch | null;
  distributions: MovementItemDistribution[];
}

export interface MovementItemDistribution {
  id: string;
  destinationLocationId: string;
  quantity: number;
  destinationLocation: StockLocation;
}

export interface Movement {
  shipmentId?: string | null;
  id: string;
  requestKey: string;
  type: 'ENTRADA_EXTERNA' | 'SAIDA_EXTERNA' | 'TRANSFERENCIA_INTERNA' | 'REVISAO';
  originLocationId: string;
  destinationLocationId: string | null;
  responsibleUserId: string;
  occurredAt: string;
  status: 'EFETIVADA' | 'CANCELADA';
  observation: string | null;
  canceledByUserId: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  originLocation: StockLocation;
  destinationLocation: StockLocation | null;
  responsibleUser: { id: string; username: string };
  canceledByUser: { id: string; username: string } | null;
  items: MovementItem[];
}

export interface QuantityByUnit {
  unit: string;
  quantity: number;
}

export interface ReportResult<T, TTotals> extends Paginated<T> {
  totals: TTotals;
}

export interface MovementReportItem {
  outputProductCode?: string | null;
  outputProductName?: string | null;
  outputQuantity?: number | null;
  itemId: string;
  movementId: string;
  occurredAt: string;
  type: Movement['type'];
  status: Movement['status'];
  responsible: string;
  origin: string;
  destination: string;
  productCode: string;
  productName: string;
  batchCode: string;
  manufacturingDate: string;
  expirationDate: string;
  destinationBatchCode: string | null;
  destinationManufacturingDate: string | null;
  destinationExpirationDate: string | null;
  quantity: number;
  unit: string;
  reviewDestinations: string;
  canceledAt: string | null;
  canceledBy: string | null;
  cancellationReason: string | null;
}

export interface MovementReportTotals {
  rows: number;
  movements: number;
  effectiveMovements: number;
  canceledMovements: number;
  effectiveQuantityByUnit: QuantityByUnit[];
}

export interface ReviewReportItem {
  distributionId: string;
  movementId: string;
  occurredAt: string;
  productCode: string;
  productName: string;
  batchCode: string;
  manufacturingDate: string;
  expirationDate: string;
  destination: string;
  quantity: number;
  unit: string;
  responsible: string;
}

export interface ReviewClassificationTotal {
  destinationLocationId: string;
  destinationCode: string;
  destination: string;
  quantityByUnit: QuantityByUnit[];
}

export interface ReviewReportTotals {
  rows: number;
  reviewedQuantityByUnit: QuantityByUnit[];
  byClassification: ReviewClassificationTotal[];
}

export type ExpirationStatus = 'VENCIDO' | 'PROXIMO_VENCIMENTO' | 'VALIDO';

export interface StockReportItem {
  positionId: string;
  productCode: string;
  productName: string;
  batchCode: string;
  manufacturingDate: string;
  expirationDate: string;
  location: string;
  quantity: number;
  unit: string;
  expirationStatus: ExpirationStatus;
}

export interface StockReportTotals {
  positions: number;
  quantityByUnit: QuantityByUnit[];
}

interface ErrorEnvelope {
  error?: { message?: string; code?: string; details?: { expirationKeys?: string[] } };
}

export class ApiError extends Error {
  constructor(message: string, readonly code?: string, readonly details?: { expirationKeys?: string[] }) {
    super(message);
  }
}

const configuredUrl: unknown = import.meta.env.VITE_API_URL;
const apiUrl = typeof configuredUrl === 'string'
  ? configuredUrl
  : 'http://localhost:3000/api/v1';

export class ApiClient {
  private accessToken: string | null = null;
  private operationalSector: UserSession['sector'] | null = null;

  setOperationalSector(sector: UserSession['sector'] | null): void {
    this.operationalSector = sector;
  }

  async login(username: string, password: string): Promise<AuthenticationResult> {
    const result = await this.request<AuthenticationResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }, false);
    this.accessToken = result.accessToken;
    return result;
  }

  async refresh(): Promise<AuthenticationResult | null> {
    try {
      const result = await this.request<AuthenticationResult>('/auth/refresh', {
        method: 'POST',
      }, false);
      this.accessToken = result.accessToken;
      return result;
    } catch {
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.request<void>('/auth/logout', { method: 'POST' }, false);
    } finally {
      this.accessToken = null;
      this.operationalSector = null;
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  postMultipart<T>(path: string, payload: unknown, files: File[]): Promise<T> {
    const body = new FormData();
    body.append('payload', JSON.stringify(payload));
    files.forEach((file) => body.append('photos', file, file.name));
    return this.request<T>(path, { method: 'POST', body });
  }

  async getBlob(path: string): Promise<Blob> {
    const headers = new Headers();
    if (this.accessToken) headers.set('Authorization', `Bearer ${this.accessToken}`);
    if (this.operationalSector) headers.set('X-Operational-Sector', this.operationalSector);
    const response = await fetch(`${apiUrl}${path}`, { headers, credentials: 'include' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as ErrorEnvelope;
      throw new ApiError(payload.error?.message ?? 'Não foi possível carregar a foto.', payload.error?.code, payload.error?.details);
    }
    return response.blob();
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  private async request<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
    const headers = new Headers(options.headers);
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    if (authenticated && this.accessToken) headers.set('Authorization', `Bearer ${this.accessToken}`);
    if (authenticated && this.operationalSector) headers.set('X-Operational-Sector', this.operationalSector);
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as ErrorEnvelope;
      throw new ApiError(payload.error?.message ?? 'Nao foi possivel concluir a operacao.', payload.error?.code, payload.error?.details);
    }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  }
}

export const api = new ApiClient();
