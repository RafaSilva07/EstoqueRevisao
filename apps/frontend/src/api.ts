export interface UserSession {
  id: string;
  username: string;
  sector?: 'REVISAO' | 'PRODUCAO' | 'EXPEDICAO' | 'PCP';
  roles: string[];
  permissions: string[];
  preferences?: UserPreferences;
}

export interface UserPreferences {
  theme: 'LIGHT' | 'DARK';
  backgroundColor: string | null;
}

export type OperationalMode = NonNullable<UserSession['sector']> | 'ADMIN';

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
  unitWeightGrams?: number | null;
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
export type StockDisplayMode = 'LOTS' | 'PRODUCTS';

export interface StockLocation {
  sector?: string | null;
  id: string;
  code: string;
  name: string;
  description: string | null;
  kind: StockLocationKind;
  displayMode: StockDisplayMode;
  parentId: string | null;
  active: boolean;
  reviewRole: 'SOURCE' | 'DESTINATION' | null;
}

export interface OperationalSettings {
  immediateSeparationMinutes: number;
  reviewDestinations: StockLocation[];
  shipmentPhotos: ShipmentPhotoLimits;
}

export interface ShipmentPhotoLimits { minimum: number; maximum: number }

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
  assembly?: import('./shipments').ShipmentAssembly | null;
  codigoRegistro?: string | null;
  recordOrdinal?: number;
  shipmentItemId?: string | null;
  pcpExecutionStatus?: 'PENDENTE' | 'EXECUTADA';
  pcpExecutedByUser?: { id: string; username: string } | null;
  pcpExecutedAt?: string | null;
  pcpExecutionObservation?: string | null;
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

export interface ReviewDistributionSummary {
  destinationCode: string;
  destination: string;
  quantity: number;
}

export interface Movement {
  codigoMovimentacao?: string | null;
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
  pcpExecutionStatus: 'PENDENTE' | 'EXECUTADA';
  requiresPcpExecution: boolean;
  pcpExecutedByUserId: string | null;
  pcpExecutedAt: string | null;
  pcpExecutionObservation: string | null;
  pcpExecutedByUser: { id: string; username: string } | null;
  items: MovementItem[];
}

export interface PcpMovementSummary extends Omit<Movement, 'items' | 'canceledByUser'> {
    assembly?: import('./shipments').ShipmentAssembly | null;
    reviewDistributions?: ReviewDistributionSummary[];
    reviewDistributionUnit?: string | null;
    sentBy?: string | null;
    receivedBy?: string | null;
    pcpExecutedBy?: string | null;
    executedCount?: number;
    recordId?: string;
    codigoGrupo?: string | null;
    codigoRegistro?: string | null;
    product?: Product;
    productSnapshot?: Pick<Product, 'code' | 'name' | 'defaultUnit'> | null;
    batch?: Batch;
    quantity?: number;
  itemCount: number;
}

export interface PcpAuditEvent {
  id: string; action: string; result: string; createdAt: string;
  user: { id: string; username: string } | null;
}

export interface PcpShipmentEvidence {
  shipmentId: string; itemId: string; productId: string; batchId: string;
  stockLocationId: string | null; quantity: number; photoMimeType: string | null;
  additionalPhotos?: Array<{ ordinal: number; mimeType: string; size: number }>;
}

export interface PcpMovementDetail extends Movement {
    recordId?: string;
    codigoGrupo?: string | null;
    codigoRegistro?: string | null;
    groupItemCount?: number;
  operationalStatus: 'CONCLUIDA' | 'CANCELADA';
  auditHistory: PcpAuditEvent[];
  shipmentEvidence: PcpShipmentEvidence[];
  shipment: null | {
    id: string; status: string; originSector: string; destinationSector: string; createdAt: string; decidedAt: string | null;
    createdBy: { id: string; username: string }; decidedBy: { id: string; username: string } | null;
  };
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
  outputUnit?: string | null;
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
  productId: string;
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

export interface StockProductReportItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  positions: StockReportItem[];
}

export interface StockReportTotals {
  positions: number;
  quantityByUnit: QuantityByUnit[];
}

export interface ConfirmationDetails {
  expirationKeys?: string[];
  duplicateKeys?: string[];
  windowMinutes?: number;
  duplicates?: Array<{ id: string; kind: 'MOVEMENT' | 'SHIPMENT'; code: string | null; createdAt: string; responsible: string; status: string }>;
}

interface ErrorEnvelope {
  error?: { message?: string; code?: string; details?: ConfirmationDetails };
}

export class ApiError extends Error {
  constructor(message: string, readonly code?: string, readonly details?: ConfirmationDetails, readonly status?: number) {
    super(message);
  }
}

const configuredUrl: unknown = import.meta.env.VITE_API_URL;
const apiUrl = typeof configuredUrl === 'string'
  ? configuredUrl
  : 'http://localhost:3000/api/v1';

export class ApiClient {
  private accessToken: string | null = null;
  private userId: string | null = null;
  private refreshPromise: Promise<AuthenticationResult | null> | null = null;
  private refreshDenied = false;
  private onSessionInvalid: (() => void) | null = null;
  private operationalSector: OperationalMode | null = null;

  setSessionInvalidHandler(handler: (() => void) | null): void {
    this.onSessionInvalid = handler;
  }

  setOperationalSector(sector: OperationalMode | null): void {
    this.operationalSector = sector;
  }

  async login(username: string, password: string): Promise<AuthenticationResult> {
    return this.withSessionLock(async () => {
      const result = await this.request<AuthenticationResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }, false);
      this.accessToken = result.accessToken;
      this.userId = result.user.id;
      this.refreshDenied = false;
      return result;
    });
  }

  refresh(): Promise<AuthenticationResult | null> {
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        try {
          this.refreshDenied = false;
          const result = await this.withSessionLock(() =>
            this.request<AuthenticationResult>('/auth/refresh', { method: 'POST' }, false));
          if (this.userId && this.userId !== result.user.id) {
            this.invalidateSession();
            return null;
          }
          this.accessToken = result.accessToken;
          this.userId = result.user.id;
          return result;
        } catch (error) {
          this.refreshDenied = error instanceof ApiError && error.status === 401;
          return null;
        } finally {
          this.refreshPromise = null;
        }
      })();
    }
    return this.refreshPromise;
  }

  async logout(): Promise<void> {
    try {
      if (this.refreshPromise) await this.refreshPromise;
      await this.withSessionLock(() => this.request<void>('/auth/logout', { method: 'POST' }, false));
    } finally {
      this.accessToken = null;
      this.userId = null;
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
    const response = await this.fetchWithAuth(path, {});
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as ErrorEnvelope;
      throw new ApiError(payload.error?.message ?? 'Não foi possível carregar a foto.', payload.error?.code, payload.error?.details, response.status);
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
    const response = await this.fetchWithAuth(path, options, authenticated);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as ErrorEnvelope;
      throw new ApiError(payload.error?.message ?? 'Nao foi possivel concluir a operacao.', payload.error?.code, payload.error?.details, response.status);
    }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  }

  private async fetchWithAuth(path: string, options: RequestInit, authenticated = true, retried = false): Promise<Response> {
    const headers = new Headers(options.headers);
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const token = this.accessToken;
    if (authenticated && token) headers.set('Authorization', `Bearer ${token}`);
    if (authenticated && this.operationalSector) headers.set('X-Operational-Sector', this.operationalSector);
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
    if (authenticated && response.status === 401 && token && !retried) {
      const renewed = this.accessToken !== token || Boolean(await this.refresh());
      if (renewed && this.accessToken) return this.fetchWithAuth(path, options, true, true);
      if (this.refreshDenied) this.invalidateSession();
    }
    return response;
  }

  private invalidateSession(): void {
    if (!this.accessToken && !this.userId) return;
    this.accessToken = null;
    this.userId = null;
    this.operationalSector = null;
    this.onSessionInvalid?.();
  }

  private async withSessionLock<T>(work: () => Promise<T>): Promise<T> {
    // The HttpOnly cookie is shared by tabs; rotating it must be serialized too.
    if (typeof navigator === 'undefined' || !navigator.locks) return work();
    return await navigator.locks.request(`estoque-revisao:auth:${apiUrl}`, work);
  }
}

export const api = new ApiClient();
