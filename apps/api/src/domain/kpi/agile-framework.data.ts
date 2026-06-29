/**
 * SPEC-044: dữ liệu seed framework "Agile Software Team" — trích nguyên từ file
 * Agile_Team_KPI_Framework.xlsx (Shinhan DS). Đây là 1 TEMPLATE, không hardcode
 * vào logic: mọi phòng ban có thể tạo framework riêng qua builder. Dùng cho seed
 * idempotent + làm ví dụ tham chiếu.
 */
import { KpiDirection, KpiScope, KpiInputType, KpiScoringMethod } from '@prisma/client';

export const AGILE_FRAMEWORK_NAME = 'Agile Software Team';

export interface SeedKpiDef {
  code: string;
  name: string;
  description: string;
  dataSource: string;
  unit: string;
  direction: KpiDirection;
  targetValue: number;
  minValue: number;
  weightInPillar: number;
  scope: KpiScope;
  inputType: KpiInputType;
  scoringMethod: KpiScoringMethod;
  surveyKpiCode?: string;
  frequency: string;
}

export interface SeedPillar {
  name: string;
  weight: number;
  order: number;
  color: string;
  definitions: SeedKpiDef[];
}

const M = KpiInputType.MANUAL;
const S = KpiInputType.SURVEY;
const TEAM = KpiScope.TEAM;
const IND = KpiScope.INDIVIDUAL;
const UP = KpiDirection.HIGHER_BETTER;
const DOWN = KpiDirection.LOWER_BETTER;
const LIN = KpiScoringMethod.THRESHOLD_LINEAR;

export const AGILE_PILLARS: SeedPillar[] = [
  {
    name: 'Delivery',
    weight: 35,
    order: 0,
    color: '#4A9EBF',
    definitions: [
      { code: 'D1', name: 'Sprint Velocity', description: 'Story Points completed & accepted / velocity target.', dataSource: 'Jira / Azure DevOps — Sprint Report', unit: '%', direction: UP, targetValue: 90, minValue: 75, weightInPillar: 25, scope: TEAM, inputType: M, scoringMethod: LIN, frequency: 'sprint' },
      { code: 'D2', name: 'Sprint Commitment Rate', description: '% stories cam kết đầu sprint hoàn thành cuối sprint.', dataSource: 'Sprint Planning → Sprint Review', unit: '%', direction: UP, targetValue: 85, minValue: 70, weightInPillar: 25, scope: TEAM, inputType: M, scoringMethod: LIN, frequency: 'sprint' },
      { code: 'D3', name: 'On-time Delivery Rate', description: '% features/releases delivered đúng ngày cam kết.', dataSource: 'Release log + Calendar', unit: '%', direction: UP, targetValue: 90, minValue: 75, weightInPillar: 25, scope: TEAM, inputType: M, scoringMethod: LIN, frequency: 'monthly' },
      { code: 'D4', name: 'Throughput', description: 'Số User Stories completed / sprint (không tính size).', dataSource: 'Jira Sprint Board', unit: 'stories/sprint', direction: UP, targetValue: 8, minValue: 5, weightInPillar: 25, scope: TEAM, inputType: M, scoringMethod: LIN, frequency: 'sprint' },
    ],
  },
  {
    name: 'Quality',
    weight: 25,
    order: 1,
    color: '#22C55E',
    definitions: [
      { code: 'Q1', name: 'Defect Density', description: 'Số bugs / Story Point delivered.', dataSource: 'Jira Bug tracker / Test management', unit: 'bugs/SP', direction: DOWN, targetValue: 0.3, minValue: 0.5, weightInPillar: 25, scope: TEAM, inputType: M, scoringMethod: LIN, frequency: 'monthly' },
      { code: 'Q2', name: 'Escaped Defect Rate', description: '% bugs phát hiện ở UAT/Production sau khi báo Done.', dataSource: 'Production incident log + Customer feedback', unit: '%', direction: DOWN, targetValue: 5, minValue: 10, weightInPillar: 25, scope: TEAM, inputType: M, scoringMethod: LIN, frequency: 'monthly' },
      { code: 'Q3', name: 'Test Coverage', description: '% code cover bởi automated tests (unit + integration).', dataSource: 'SonarQube / JaCoCo', unit: '%', direction: UP, targetValue: 70, minValue: 50, weightInPillar: 25, scope: TEAM, inputType: M, scoringMethod: LIN, frequency: 'sprint' },
      { code: 'Q4', name: 'Rework Rate', description: '% stories phải làm lại sau khi đã báo Done (re-opened).', dataSource: 'Jira — re-opened stories', unit: '%', direction: DOWN, targetValue: 5, minValue: 10, weightInPillar: 25, scope: TEAM, inputType: M, scoringMethod: LIN, frequency: 'monthly' },
    ],
  },
  {
    name: 'Process',
    weight: 25,
    order: 2,
    color: '#F59E0B',
    definitions: [
      { code: 'P1', name: 'Ceremony Adherence', description: '% Scrum ceremonies đúng giờ, đủ thành phần, đúng time-box.', dataSource: 'Meeting calendar + Attendance log', unit: '%', direction: UP, targetValue: 95, minValue: 80, weightInPillar: 25, scope: TEAM, inputType: M, scoringMethod: LIN, frequency: 'monthly' },
      { code: 'P2', name: 'Retrospective Action Rate', description: '% action items từ Retro thực hiện trong sprint kế.', dataSource: 'Retro board + Sprint Backlog', unit: '%', direction: UP, targetValue: 80, minValue: 60, weightInPillar: 25, scope: TEAM, inputType: M, scoringMethod: LIN, frequency: 'sprint' },
      { code: 'P3', name: 'WIP Compliance', description: '% thời gian WIP limit được tuân thủ trên board.', dataSource: 'Jira / Kanban board metrics', unit: '%', direction: UP, targetValue: 85, minValue: 70, weightInPillar: 25, scope: TEAM, inputType: M, scoringMethod: LIN, frequency: 'monthly' },
      { code: 'P4', name: 'CI/CD Build Success', description: '% builds thành công / pipeline health.', dataSource: 'Jenkins / GitLab CI / GitHub Actions', unit: '%', direction: UP, targetValue: 90, minValue: 80, weightInPillar: 25, scope: TEAM, inputType: M, scoringMethod: LIN, frequency: 'weekly' },
    ],
  },
  {
    name: 'Team Health',
    weight: 15,
    order: 3,
    color: '#EF4444',
    definitions: [
      // T1/T2: actual là điểm trung bình survey trên thang gốc (1-10, 1-5) — KHÔNG
      // phải thang 0-100, nên dùng THRESHOLD_LINEAR (neo target/min) để quy đổi đúng
      // (vd morale 7.5 → 90), không dùng DIRECT (sẽ hiểu nhầm 7.5 = 7.5/100).
      { code: 'T1', name: 'Team Morale Score', description: 'Điểm happiness/engagement (anonymous survey, 1-10).', dataSource: 'Monthly anonymous survey', unit: '1-10', direction: UP, targetValue: 7.5, minValue: 6.0, weightInPillar: 25, scope: TEAM, inputType: S, scoringMethod: LIN, surveyKpiCode: 'T1', frequency: 'monthly' },
      { code: 'T2', name: 'Collaboration Score', description: 'Cross-functional collaboration (360° peer, 1-5).', dataSource: 'Quarterly 360° peer survey', unit: '1-5', direction: UP, targetValue: 4.0, minValue: 3.0, weightInPillar: 25, scope: TEAM, inputType: S, scoringMethod: LIN, surveyKpiCode: 'T2', frequency: 'quarterly' },
      { code: 'T3', name: 'Learning & Development Hours', description: 'Số giờ học tập & phát triển kỹ năng / tháng / người.', dataSource: 'HR system + Self-report', unit: 'hours', direction: UP, targetValue: 8, minValue: 4, weightInPillar: 25, scope: IND, inputType: M, scoringMethod: LIN, frequency: 'monthly' },
      { code: 'T4', name: 'Availability', description: '% thời gian available cho dự án (trừ leave/illness).', dataSource: 'HR attendance + Sprint capacity', unit: '%', direction: UP, targetValue: 90, minValue: 80, weightInPillar: 25, scope: IND, inputType: M, scoringMethod: LIN, frequency: 'monthly' },
    ],
  },
];

export interface SeedProfile {
  name: string;
  description: string;
  // [Delivery, Quality, Process, Team Health] theo thứ tự pillar.
  weights: [number, number, number, number];
}

export const AGILE_WEIGHT_PROFILES: SeedProfile[] = [
  { name: 'Dev Profile', description: 'Developer — focus Delivery + Quality', weights: [40, 30, 20, 10] },
  { name: 'QA Profile', description: 'QA Engineer — Quality là primary KPI', weights: [25, 45, 20, 10] },
  { name: 'SM Profile', description: 'Scrum Master / PM — Process facilitation là core', weights: [30, 15, 40, 15] },
  { name: 'PO Profile', description: 'Product Owner — Delivery & value focus', weights: [40, 20, 25, 15] },
  { name: 'BA Profile', description: 'Business Analyst — Process & delivery balance', weights: [30, 25, 30, 15] },
  { name: 'DevOps Profile', description: 'DevOps Engineer — Process/CI-CD heavy', weights: [30, 25, 35, 10] },
];

export interface SeedBand {
  label: string;
  minScore: number;
  maxScore: number;
  color: string;
  recommendedAction: string;
  order: number;
}

export const AGILE_RATING_BANDS: SeedBand[] = [
  { label: '⭐ Xuất sắc', minScore: 90, maxScore: 100, color: '#22C55E', recommendedAction: 'Ghi nhận, chia sẻ best practice, cân nhắc mentor role', order: 0 },
  { label: '✅ Tốt', minScore: 75, maxScore: 89, color: '#3B82F6', recommendedAction: 'Tiếp tục duy trì, định hướng phát triển skill mới', order: 1 },
  { label: '🔶 Đạt yêu cầu', minScore: 60, maxScore: 74, color: '#F59E0B', recommendedAction: 'Coaching plan 30 ngày, xác định điểm cải thiện cụ thể', order: 2 },
  { label: '⚠️ Cần cải thiện', minScore: 40, maxScore: 59, color: '#F97316', recommendedAction: 'PIP (Performance Improvement Plan) 60 ngày với mentor', order: 3 },
  { label: '🔴 Chưa đạt', minScore: 0, maxScore: 39, color: '#EF4444', recommendedAction: 'Meeting 1-on-1 ngay, xác định root cause & action plan', order: 4 },
];

export interface SeedSurveyQuestion {
  code: string;
  text: string;
  scaleMin: number;
  scaleMax: number;
  mapsToKpiCode: string;
  order: number;
}

export interface SeedSurvey {
  type: 'MONTHLY_MORALE' | 'QUARTERLY_PEER_360';
  title: string;
  questions: SeedSurveyQuestion[];
}

export const AGILE_SURVEYS: SeedSurvey[] = [
  {
    type: 'MONTHLY_MORALE',
    title: 'Khảo sát tinh thần hàng tháng (ẩn danh)',
    questions: [
      { code: 'M1', text: 'Nhìn chung, bạn hài lòng với công việc trong tháng này ở mức nào?', scaleMin: 1, scaleMax: 10, mapsToKpiCode: 'T1', order: 0 },
      { code: 'M2', text: 'Bạn cảm thấy team collaboration & hỗ trợ lẫn nhau ở mức nào?', scaleMin: 1, scaleMax: 10, mapsToKpiCode: 'T1', order: 1 },
      { code: 'M3', text: 'Bạn cảm thấy mình đang tiến bộ và phát triển trong tháng này ở mức nào?', scaleMin: 1, scaleMax: 10, mapsToKpiCode: 'T1', order: 2 },
    ],
  },
  {
    type: 'QUARTERLY_PEER_360',
    title: '360° Peer Review hàng quý (ẩn danh)',
    questions: [
      { code: 'P1', text: 'Người này tích cực hỗ trợ đồng nghiệp khi cần thiết', scaleMin: 1, scaleMax: 5, mapsToKpiCode: 'T2', order: 0 },
      { code: 'P2', text: 'Người này chủ động chia sẻ kiến thức & kinh nghiệm với team', scaleMin: 1, scaleMax: 5, mapsToKpiCode: 'T2', order: 1 },
      { code: 'P3', text: 'Người này đưa ra phản hồi mang tính xây dựng (constructive)', scaleMin: 1, scaleMax: 5, mapsToKpiCode: 'T2', order: 2 },
      { code: 'P4', text: 'Người này tôn trọng và lắng nghe ý kiến của mọi người', scaleMin: 1, scaleMax: 5, mapsToKpiCode: 'T2', order: 3 },
      { code: 'P5', text: 'Nhìn chung, người này đóng góp tích cực cho team performance', scaleMin: 1, scaleMax: 5, mapsToKpiCode: 'T2', order: 4 },
    ],
  },
];
