// SPEC-030 — Probation Review. Manager đánh giá nhân viên thử việc qua scorecard
// (tiêu chí cấu hình được + điểm 1..5) rồi đề xuất; HR chốt quyết định và hệ
// thống tự thực thi hệ quả (CONFIRM→Contract, EXTEND→đẩy ngày, FAIL→terminate).

// Thang điểm scorecard cho mỗi tiêu chí. Khác recruitment (1..4) — probation 1..5.
export const PROBATION_RATING_MIN = 1;
export const PROBATION_RATING_MAX = 5;

export const ProbationReviewStatus = {
  DRAFT: 'DRAFT', // manager đang soạn, chưa nộp
  PENDING_HR: 'PENDING_HR', // đã nộp, chờ HR quyết định
  DECIDED: 'DECIDED', // HR đã quyết định (terminal)
  CANCELLED: 'CANCELLED', // huỷ (terminal)
} as const;

export type ProbationReviewStatus =
  (typeof ProbationReviewStatus)[keyof typeof ProbationReviewStatus];

export const ProbationOutcome = {
  CONFIRM: 'CONFIRM', // đạt → tạo hợp đồng chính thức
  EXTEND: 'EXTEND', // gia hạn thử việc → đẩy probationEndDate
  FAIL: 'FAIL', // không đạt → chấm dứt
} as const;

export type ProbationOutcome = (typeof ProbationOutcome)[keyof typeof ProbationOutcome];

// SPEC-031 — Khung đánh giá. Tách "What" (kết quả/hiệu suất) khỏi "How" (giá trị/văn
// hóa) để tránh hiệu ứng hào quang; nhóm này quyết định cách tính sub-score scorecard.
export const ProbationCompetencyGroup = {
  PERFORMANCE: 'PERFORMANCE', // What — kết quả & năng lực công việc
  VALUES: 'VALUES', // How — hành vi, giá trị & văn hóa
} as const;

export type ProbationCompetencyGroup =
  (typeof ProbationCompetencyGroup)[keyof typeof ProbationCompetencyGroup];

// Kết quả của một deliverable trong nhật ký bằng chứng.
export const ProbationDeliverableOutcome = {
  MET: 'MET', // đạt kỳ vọng
  EXCEEDED: 'EXCEEDED', // vượt kỳ vọng
  NOT_MET: 'NOT_MET', // chưa đạt
} as const;

export type ProbationDeliverableOutcome =
  (typeof ProbationDeliverableOutcome)[keyof typeof ProbationDeliverableOutcome];

// Một mức trong thang BARS (Behaviorally-Anchored Rating Scale) của tiêu chí.
// `score` 1..5 duy nhất; `observable` mô tả hành vi quan sát được ở mức đó.
export interface ProbationRubricLevel {
  score: number;
  level: string;
  definition?: string;
  observable?: string;
}

// Một mục bằng chứng deliverable do manager ghi nhận trên review.
export interface ProbationDeliverable {
  title: string;
  link?: string | null;
  outcome?: ProbationDeliverableOutcome | null;
  note?: string | null;
}

// ===== ProbationCriteria =====

export interface ProbationCriteriaDto {
  id: string;
  tenantId: string;
  name: string;
  order: number;
  isActive: boolean;
  group: ProbationCompetencyGroup;
  rubric: ProbationRubricLevel[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProbationCriteriaInput {
  name: string;
  order?: number;
  isActive?: boolean;
  group?: ProbationCompetencyGroup;
  rubric?: ProbationRubricLevel[] | null;
}

export interface UpdateProbationCriteriaInput {
  name?: string;
  order?: number;
  isActive?: boolean;
  group?: ProbationCompetencyGroup;
  rubric?: ProbationRubricLevel[] | null;
}

// ===== ProbationReview =====

// `ratings` keyed theo ProbationCriteria.id, mỗi giá trị 1..5.
export type ProbationRatings = Record<string, number>;

export interface ProbationReviewEmployeeRef {
  id: string;
  fullName: string;
  employeeCode: string;
  avatar: string | null;
  departmentName: string | null;
  positionName: string | null;
  probationEndDate: string | null;
}

export interface ProbationReviewActorRef {
  id: string;
  fullName: string;
  avatar: string | null;
}

export interface ProbationReviewDto {
  id: string;
  tenantId: string;
  employee: ProbationReviewEmployeeRef;
  status: ProbationReviewStatus;
  reviewer: ProbationReviewActorRef | null;
  // SPEC-033: dữ liệu tự đánh giá — CHỈ khác null khi NV đã NỘP (nháp là riêng tư).
  selfRatings: ProbationRatings | null;
  selfComment: string | null;
  selfSubmittedAt: string | null;
  ratings: ProbationRatings | null;
  deliverables: ProbationDeliverable[] | null;
  strengths: string | null;
  weaknesses: string | null;
  comment: string | null;
  recommendation: ProbationOutcome | null;
  submittedAt: string | null;
  decidedBy: ProbationReviewActorRef | null;
  decision: ProbationOutcome | null;
  decisionNote: string | null;
  decidedAt: string | null;
  newProbationEndDate: string | null;
  probationEndDateAtCreate: string | null;
  createdAt: string;
  updatedAt: string;
}

// Manager tạo draft cho một nhân viên thử việc dưới quyền.
export interface CreateProbationReviewInput {
  employeeId: string;
}

// Manager lưu nháp scorecard (mọi field optional — patch từng phần).
export interface PatchProbationReviewInput {
  ratings?: ProbationRatings;
  deliverables?: ProbationDeliverable[];
  strengths?: string | null;
  weaknesses?: string | null;
  comment?: string | null;
  recommendation?: ProbationOutcome | null;
  // Khi recommendation=EXTEND, manager đề xuất ngày kết thúc thử việc mới.
  newProbationEndDate?: string | null;
}

// Manager nộp scorecard → chuyển PENDING_HR. Bất biến sau khi nộp.
export interface SubmitProbationReviewInput {
  ratings: ProbationRatings;
  recommendation: ProbationOutcome;
  deliverables?: ProbationDeliverable[];
  strengths?: string | null;
  weaknesses?: string | null;
  comment?: string | null;
  // Bắt buộc > hôm nay khi recommendation=EXTEND.
  newProbationEndDate?: string | null;
}

// HR quyết định cuối. EXTEND bắt buộc newProbationEndDate.
export interface DecideProbationReviewInput {
  decision: ProbationOutcome;
  decisionNote?: string | null;
  newProbationEndDate?: string | null;
}

export interface ProbationReviewListParams {
  status?: ProbationReviewStatus;
  employeeId?: string;
  page?: number;
  limit?: number;
}

// ===== Self Evaluation (SPEC-033) =====
// DTO dành riêng cho nhân viên chủ thể — build riêng (không cắt từ ProbationReviewDto)
// để không bao giờ vô tình lộ dữ liệu manager/HR khi DTO kia thêm trường mới.

export interface ProbationSelfReviewDto {
  id: string;
  status: ProbationReviewStatus;
  probationEndDate: string | null;
  // Tiêu chí active kèm group + rubric để NV thấy popover hướng dẫn như manager.
  criteria: ProbationCriteriaDto[];
  selfRatings: ProbationRatings | null;
  selfComment: string | null;
  selfSubmittedAt: string | null;
  createdAt: string;
}

export interface PatchProbationSelfInput {
  selfRatings?: ProbationRatings;
  selfComment?: string | null;
}

export interface SubmitProbationSelfInput {
  selfRatings: ProbationRatings;
  selfComment?: string | null;
}

// ===== ProbationGuideline (SPEC-032) =====
// Bài hướng dẫn đánh giá cho manager, HR soạn theo năm áp dụng (nhiều bài / năm).
// Mỗi bài gắn một ngôn ngữ — tab Hướng dẫn lọc theo ngôn ngữ UI đang chọn (§2c).

export const ProbationGuidelineLanguage = {
  VI: 'vi',
  EN: 'en',
} as const;

export type ProbationGuidelineLanguage =
  (typeof ProbationGuidelineLanguage)[keyof typeof ProbationGuidelineLanguage];

export interface ProbationGuidelineDto {
  id: string;
  tenantId: string;
  year: number;
  language: ProbationGuidelineLanguage;
  title: string;
  content: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProbationGuidelineInput {
  year: number;
  language?: ProbationGuidelineLanguage;
  title: string;
  content: string;
  order?: number;
}

export interface UpdateProbationGuidelineInput {
  year?: number;
  language?: ProbationGuidelineLanguage;
  title?: string;
  content?: string;
  order?: number;
}

export interface ProbationGuidelineListParams {
  year?: number;
  language?: ProbationGuidelineLanguage;
}
