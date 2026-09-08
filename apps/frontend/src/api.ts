export interface UserSession {
  id: string;
  username: string;
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
  id: string;
  productId: string;
  batchId: string;
  quantity: number;
  product: Product;
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
  destinationBatchCode: string | null;
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

interface ErrorEnvelope {
  error?: { message?: string };
}

const configuredUrl: unknown = import.meta.env.VITE_API_URL;
const apiUrl = typeof configuredUrl === 'string'
  ? configuredUrl
  : 'http://localhost:3000/api/v1';

export class ApiClient {
  private accessToken: string | null = null;

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
    await this.request<void>('/auth/logout', { method: 'POST' }, false);
    this.accessToken = null;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }

  private async request<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
    const headers = new Headers(options.headers);
    if (options.body) headers.set('Content-Type', 'application/json');
    if (authenticated && this.accessToken) headers.set('Authorization', `Bearer ${this.accessToken}`);
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as ErrorEnvelope;
      throw new Error(payload.error?.message ?? 'Nao foi possivel concluir a operacao.');
    }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  }
}

export const api = new ApiClient();
