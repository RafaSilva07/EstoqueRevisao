export type DataQualityDimension = 'COMPLETENESS' | 'VALIDITY' | 'CONSISTENCY' | 'TIMELINESS';
export type DataQualitySeverity = 'HIGH' | 'MEDIUM' | 'LOW';
export type DataQualityStatus = 'HEALTHY' | 'ATTENTION' | 'CRITICAL';
export type DataQualityEntityType = 'PRODUCT' | 'BATCH' | 'STOCK_POSITION' | 'SHIPMENT';

export interface DataQualityIssue {
  id: string;
  ruleCode: string;
  dimension: DataQualityDimension;
  severity: DataQualitySeverity;
  entityType: DataQualityEntityType;
  entityId: string;
  referenceCode: string;
  title: string;
  description: string;
  recommendation: string;
}

export interface DimensionScore {
  dimension: DataQualityDimension;
  label: string;
  score: number;
  checkedCount: number;
  issueCount: number;
}

export interface DataQualityReportDto {
  generatedAt: string;
  overallScore: number;
  status: DataQualityStatus;
  summary: {
    totalRecordsChecked: number;
    totalIssues: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
  };
  dimensions: DimensionScore[];
  issues: DataQualityIssue[];
}

export interface DataQualityQuery {
  dimension?: DataQualityDimension;
  severity?: DataQualitySeverity;
  search?: string;
}
