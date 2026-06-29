// SPEC-044 — KPI / Performance Management Engine. Engine cấu hình được: framework
// (bó KPI) → pillar (trụ cột) → definition (chỉ số). Mọi phòng ban tự định nghĩa
// framework riêng; framework "Agile Software Team" được seed sẵn như template.
// Điểm quy đổi 0..100 (explainable, có evidence), weighted theo role, ra rating.

// ── Enums (string unions, đồng bộ với Prisma enum) ──────────────────────────

export const KpiDirection = {
  HIGHER_BETTER: 'HIGHER_BETTER',
  LOWER_BETTER: 'LOWER_BETTER',
} as const;
export type KpiDirection = (typeof KpiDirection)[keyof typeof KpiDirection];

export const KpiScope = {
  INDIVIDUAL: 'INDIVIDUAL',
  TEAM: 'TEAM',
} as const;
export type KpiScope = (typeof KpiScope)[keyof typeof KpiScope];

export const KpiInputType = {
  MANUAL: 'MANUAL',
  SURVEY: 'SURVEY',
} as const;
export type KpiInputType = (typeof KpiInputType)[keyof typeof KpiInputType];

export const KpiScoringMethod = {
  THRESHOLD_LINEAR: 'THRESHOLD_LINEAR',
  DIRECT: 'DIRECT',
  BOOLEAN: 'BOOLEAN',
  BANDED: 'BANDED',
} as const;
export type KpiScoringMethod = (typeof KpiScoringMethod)[keyof typeof KpiScoringMethod];

export const KpiPeriodType = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUAL: 'ANNUAL',
} as const;
export type KpiPeriodType = (typeof KpiPeriodType)[keyof typeof KpiPeriodType];

export const KpiCycleStatus = {
  DRAFT: 'DRAFT',
  DATA_ENTRY: 'DATA_ENTRY',
  SELF_ASSESSMENT: 'SELF_ASSESSMENT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  FINALIZED: 'FINALIZED',
  CLOSED: 'CLOSED',
} as const;
export type KpiCycleStatus = (typeof KpiCycleStatus)[keyof typeof KpiCycleStatus];

export const KpiScorecardStatus = {
  PENDING: 'PENDING',
  SELF_ASSESSED: 'SELF_ASSESSED',
  IN_REVIEW: 'IN_REVIEW',
  FINALIZED: 'FINALIZED',
} as const;
export type KpiScorecardStatus = (typeof KpiScorecardStatus)[keyof typeof KpiScorecardStatus];

export const KpiSurveyType = {
  MONTHLY_MORALE: 'MONTHLY_MORALE',
  QUARTERLY_PEER_360: 'QUARTERLY_PEER_360',
} as const;
export type KpiSurveyType = (typeof KpiSurveyType)[keyof typeof KpiSurveyType];

// Mặc định mốc neo điểm: actual=min → 60 ("Đạt"), actual=target → 90 ("Tốt").
export const KPI_DEFAULT_PASS_ANCHOR = 60;
export const KPI_DEFAULT_TARGET_ANCHOR = 90;
export const KPI_SCORE_MIN = 0;
export const KPI_SCORE_MAX = 100;

// ── Configuration DTOs ──────────────────────────────────────────────────────

export interface KpiDefinitionDto {
  id: string;
  pillarId: string;
  code: string;
  name: string;
  description: string | null;
  dataSource: string | null;
  unit: string | null;
  direction: KpiDirection;
  targetValue: number | null;
  minValue: number | null;
  weightInPillar: number;
  scope: KpiScope;
  inputType: KpiInputType;
  scoringMethod: KpiScoringMethod;
  surveyKpiCode: string | null;
  frequency: string | null;
  order: number;
  isActive: boolean;
}

export interface KpiPillarDto {
  id: string;
  frameworkId: string;
  name: string;
  weight: number;
  order: number;
  color: string | null;
  definitions: KpiDefinitionDto[];
}

export interface KpiProfilePillarWeightDto {
  pillarId: string;
  weight: number;
}

export interface KpiWeightProfileDto {
  id: string;
  frameworkId: string;
  name: string;
  description: string | null;
  pillarWeights: KpiProfilePillarWeightDto[];
}

export interface KpiRatingBandDto {
  id: string;
  label: string;
  minScore: number;
  maxScore: number;
  color: string | null;
  recommendedAction: string | null;
  order: number;
}

export interface KpiFrameworkDto {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  defaultPeriodType: KpiPeriodType;
  passAnchor: number;
  targetAnchor: number;
  isActive: boolean;
  pillars: KpiPillarDto[];
  weightProfiles: KpiWeightProfileDto[];
  ratingBands: KpiRatingBandDto[];
  departmentIds: string[];
  createdAt: string;
  updatedAt: string;
}

// Lightweight row cho danh sách framework.
export interface KpiFrameworkListItemDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  pillarCount: number;
  kpiCount: number;
  departmentCount: number;
  updatedAt: string;
}

// ── Tracking DTOs ─────────────────────────────────────────────────────────

export interface KpiEntryDto {
  id: string;
  kpiDefinitionId: string;
  scorecardId: string | null;
  teamId: string | null;
  actualValue: number | null;
  computedScore: number | null;
  source: string | null;
  note: string | null;
}

export interface KpiScorecardPillarDto {
  pillarId: string;
  pillarName: string;
  score: number | null;
  weight: number;
}

// Một bước trong timeline duyệt review của scorecard (snapshot từ ApprovalStep).
export interface KpiScorecardApprovalDto {
  round: number;
  stepOrder: number;
  approverType: string;
  roleKey: string | null;
  approverId: string | null;
  decision: string | null; // null = đang chờ
  decidedById: string | null;
  decidedAt: string | null;
  note: string | null;
}

export interface KpiScorecardDto {
  id: string;
  cycleId: string;
  employeeId: string;
  employeeName: string;
  teamId: string | null;
  weightProfileId: string | null;
  weightProfileName: string | null;
  weightedTotal: number | null;
  ratingLabel: string | null;
  status: KpiScorecardStatus;
  currentStep: number;
  selfComment: string | null;
  selfSubmittedAt: string | null;
  strengths: string | null;
  areasToImprove: string | null;
  actionPlan: string | null;
  recognition: string | null;
  reviewComment: string | null;
  reviewerId: string | null;
  pillars: KpiScorecardPillarDto[];
  entries: KpiEntryDto[];
  approvals: KpiScorecardApprovalDto[];
}

export interface SelfAssessInput {
  selfComment: string;
}

export interface ReviewScorecardInput {
  decision: 'APPROVED' | 'RETURNED';
  note?: string | null;
  strengths?: string | null;
  areasToImprove?: string | null;
  actionPlan?: string | null;
  recognition?: string | null;
  reviewComment?: string | null;
}

// Team có thành viên trong scope của cycle — dùng để nhập KPI scope=TEAM.
export interface KpiCycleTeamDto {
  id: string;
  name: string;
  memberIds: string[];
}

// Cycle + toàn bộ dữ liệu cần cho lưới nhập liệu & scorecard.
export interface KpiCycleDetailDto {
  id: string;
  frameworkId: string;
  frameworkName: string;
  period: string;
  periodType: KpiPeriodType;
  status: KpiCycleStatus;
  framework: KpiFrameworkDto;
  scorecards: KpiScorecardDto[];
  teams: KpiCycleTeamDto[];
  teamEntries: KpiEntryDto[]; // entry scope=TEAM (keyed by teamId)
  createdAt: string;
  updatedAt: string;
}

export interface CreateKpiCycleInput {
  frameworkId: string;
  period: string; // "YYYY-MM" hoặc "YYYY-Qn"
  periodType: KpiPeriodType;
}

// Một điểm trong lịch sử KPI của nhân viên (1 scorecard/1 chu kỳ) — cho xu hướng.
export interface KpiScorecardHistoryPoint {
  scorecardId: string;
  scorecardStatus: KpiScorecardStatus;
  cycleId: string;
  period: string;
  periodType: KpiPeriodType;
  frameworkName: string;
  status: KpiCycleStatus; // trạng thái cycle
  selfComment: string | null;
  weightedTotal: number | null;
  ratingLabel: string | null;
  pillars: { pillarName: string; score: number | null }[];
}

export interface KpiEmployeeHistoryDto {
  employeeId: string;
  employeeName: string;
  points: KpiScorecardHistoryPoint[]; // sắp xếp theo period tăng dần
}

// Chuyển trạng thái cycle hợp lệ — single source of truth (server enforce + web hiển thị nút).
export const KPI_CYCLE_TRANSITIONS: Record<KpiCycleStatus, KpiCycleStatus[]> = {
  DRAFT: ['DATA_ENTRY'],
  DATA_ENTRY: ['SELF_ASSESSMENT', 'PENDING_REVIEW'],
  SELF_ASSESSMENT: ['PENDING_REVIEW', 'DATA_ENTRY'],
  PENDING_REVIEW: ['FINALIZED', 'DATA_ENTRY'],
  FINALIZED: ['CLOSED', 'PENDING_REVIEW'],
  CLOSED: [],
};

export interface TransitionKpiCycleInput {
  status: KpiCycleStatus;
}

// Bulk upsert entries (ô vàng). Mỗi item gắn scorecardId (INDIVIDUAL) hoặc teamId (TEAM).
export interface BulkUpsertEntriesInput {
  entries: UpsertKpiEntryInput[];
}

export interface KpiCycleDto {
  id: string;
  frameworkId: string;
  frameworkName: string;
  period: string;
  periodType: KpiPeriodType;
  status: KpiCycleStatus;
  scorecardCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Survey DTOs ───────────────────────────────────────────────────────────

export interface KpiSurveyQuestionDto {
  id: string;
  code: string;
  text: string;
  scaleMin: number;
  scaleMax: number;
  mapsToKpiCode: string | null;
  order: number;
}

export interface KpiSurveyDto {
  id: string;
  frameworkId: string | null;
  type: KpiSurveyType;
  title: string;
  isAnonymous: boolean;
  minResponses: number;
  active: boolean;
  responseCount: number;
  openCycleId: string | null; // chu kỳ đang mở của framework (cho respond); null nếu không có
  questions: KpiSurveyQuestionDto[];
}

export interface CreateKpiSurveyInput {
  frameworkId?: string | null;
  type: KpiSurveyType;
  title: string;
  minResponses?: number;
}

export interface UpdateKpiSurveyInput {
  title?: string;
  minResponses?: number;
  active?: boolean;
}

export interface UpsertKpiSurveyQuestionInput {
  code: string;
  text: string;
  scaleMin?: number;
  scaleMax?: number;
  mapsToKpiCode?: string | null;
  order?: number;
}

// Phản hồi survey — ẩn danh: KHÔNG gửi/không lưu danh tính người trả lời.
export interface SubmitSurveyResponseInput {
  cycleId?: string | null;
  subjectEmployeeId?: string | null; // 360°: người được đánh giá
  answers: Record<string, number>; // { [questionCode]: score }
}

// Kết quả tổng hợp survey vào 1 chu kỳ.
export interface SurveyAggregateResultDto {
  aggregated: { surveyTitle: string; kpiCode: string; value: number; responseCount: number; teamsApplied: number }[];
  skipped: { surveyTitle: string; reason: string; responseCount: number }[];
}

// ── Request bodies ──────────────────────────────────────────────────────────

export interface UpsertKpiFrameworkInput {
  name: string;
  description?: string | null;
  defaultPeriodType?: KpiPeriodType;
  passAnchor?: number;
  targetAnchor?: number;
  isActive?: boolean;
}

export interface UpsertKpiEntryInput {
  kpiDefinitionId: string;
  scorecardId?: string | null; // INDIVIDUAL
  teamId?: string | null; // TEAM
  actualValue: number | null;
  note?: string | null;
}

export interface UpsertKpiPillarInput {
  name: string;
  weight: number;
  order?: number;
  color?: string | null;
}

export interface UpsertKpiDefinitionInput {
  code: string;
  name: string;
  description?: string | null;
  dataSource?: string | null;
  unit?: string | null;
  direction: KpiDirection;
  targetValue?: number | null;
  minValue?: number | null;
  weightInPillar: number;
  scope: KpiScope;
  inputType: KpiInputType;
  scoringMethod: KpiScoringMethod;
  surveyKpiCode?: string | null;
  frequency?: string | null;
  order?: number;
}

export interface UpsertKpiWeightProfileInput {
  name: string;
  description?: string | null;
  pillarWeights: KpiProfilePillarWeightDto[];
}

export interface UpsertKpiRatingBandInput {
  label: string;
  minScore: number;
  maxScore: number;
  color?: string | null;
  recommendedAction?: string | null;
  order?: number;
}

export interface SetFrameworkDepartmentsInput {
  departmentIds: string[];
}

// Kết quả kiểm tra tính toàn vẹn trọng số của 1 framework (Σ=100%).
export interface KpiFrameworkValidationIssue {
  scope: 'PILLARS' | 'PILLAR_KPIS' | 'PROFILE';
  refId: string | null; // pillarId / profileId, hoặc null cho tổng pillar
  label: string;
  actualSum: number;
}

// Hai mốc neo điểm: passAnchor (tại minValue, mặc định 60) phải < targetAnchor
// (tại targetValue, mặc định 90) — single source of truth cho scoring (F2).

export interface KpiFrameworkValidationDto {
  valid: boolean;
  issues: KpiFrameworkValidationIssue[];
}

// ── Team / Squad ────────────────────────────────────────────────────────────

export interface TeamDto {
  id: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  leadId: string | null;
  leadName: string | null;
  memberCount: number;
  memberIds: string[];
}

export interface UpsertTeamInput {
  name: string;
  departmentId?: string | null;
  leadId?: string | null;
  memberIds?: string[];
}
