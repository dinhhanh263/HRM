/**
 * Full-module demo seed (manual, demo/personal environments).
 *
 * Fills every module the sidebar exposes with realistic Vietnamese demo data so
 * mọi màn hình đều có gì đó để xem: Contracts, Probation, Leave, Assets,
 * Recruitment, KPI, Sales/CRM và Finance (SPEC-048).
 *
 * Prereq: base seed (db:seed) đã chạy — cần tenant codecrush + 27 employees +
 * config mặc định (leave types, pipeline templates, finance categories, KPI
 * framework, sales pipeline, approval flows).
 *
 * Idempotent: xoá dữ liệu giao dịch thuộc scope của script (theo tenant) rồi
 * tạo lại, nên chạy lại thoải mái. KHÔNG đụng attendance/payroll (seed riêng).
 */
import {
  PrismaClient,
  ContractType,
  ContractStatus,
  ProbationReviewStatus,
  ProbationOutcome,
  LeaveStatus,
  AssetStatus,
  AssetCondition,
  AssetAssignmentStatus,
  AssetAckStatus,
  AssetAckMethod,
  JobStatus,
  StageType,
  CandidateSource,
  ApplicationStatus,
  InterviewMode,
  InterviewStatus,
  ScorecardOverall,
  HiringTeamRole,
  CustomerType,
  CustomerLifecycle,
  LeadSource,
  SalesStageType,
  DealStatus,
  QuoteStatus,
  SalesActivityType,
  SalesTaskType,
  SalesTaskStatus,
  TransactionDirection,
  TransactionStatus,
  FundAccountType,
  PaymentRequestType,
  PaymentRequestStatus,
  PurchaseRequestStatus,
  SpendingPlanStatus,
  TopUpStatus,
  ApprovalFlowType,
  ApproverType,
  ApprovalDecision,
} from '@prisma/client';
import { kpiCycleService } from '../src/domain/services/kpi-cycle.service.js';

const prisma = new PrismaClient();

const TENANT_SLUG = 'codecrush';
const KPI_PERIOD = '2026-06';

const day = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));
const at = (y: number, m: number, d: number, hh: number, mm = 0): Date =>
  new Date(Date.UTC(y, m - 1, d, hh, mm, 0));

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`Tenant "${TENANT_SLUG}" not found — run the base seed first.`);
  const tenantId = tenant.id;

  // ── Refs ────────────────────────────────────────────────────────────────────
  const employees = await prisma.employee.findMany({
    where: { tenantId },
    select: { id: true, employeeCode: true, fullName: true, managerId: true, departmentId: true, joinDate: true, contractType: true },
  });
  const byCode = (code: string) => {
    const e = employees.find((x) => x.employeeCode === code);
    if (!e) throw new Error(`Employee ${code} not found — run the base seed first.`);
    return e;
  };
  const admin = byCode('EMP-000');
  const founder = byCode('EMP-900');
  const hr = byCode('EMP-001');
  const tuan = byCode('EMP-002'); // MANAGER Engineering
  const linh = byCode('EMP-003');
  const duc = byCode('EMP-004');
  const hoa = byCode('EMP-005');
  const khoa = byCode('EMP-006'); // MANAGER
  const huong = byCode('EMP-016'); // MANAGER
  const binh = byCode('EMP-017');
  const thao = byCode('EMP-018');
  const son = byCode('EMP-013');
  const ngoc = byCode('EMP-014');
  const anh = byCode('EMP-015');
  const kim = byCode('EMP-020');
  const dieu = byCode('EMP-024'); // → PROBATION
  const phuoc = byCode('EMP-025'); // → PROBATION

  const departments = await prisma.department.findMany({ where: { tenantId } });
  const engineering = departments.find((d) => /engineer/i.test(d.name)) ?? departments[0];
  const otherDept = departments.find((d) => d.id !== engineering.id) ?? engineering;

  const leaveTypes = await prisma.leaveType.findMany({ where: { tenantId, active: true } });
  const annual =
    leaveTypes.find((t) => /annual|năm/i.test(`${t.code} ${t.name}`)) ??
    leaveTypes.reduce((a, b) => (a.defaultDays >= b.defaultDays ? a : b));
  const sick = leaveTypes.find((t) => /sick|ốm/i.test(`${t.code} ${t.name}`)) ?? leaveTypes[1] ?? annual;

  const expenseCats = await prisma.financeCategory.findMany({ where: { tenantId, kind: 'EXPENSE', active: true } });
  const incomeCats = await prisma.financeCategory.findMany({ where: { tenantId, kind: 'INCOME', active: true } });
  if (expenseCats.length === 0 || incomeCats.length === 0)
    throw new Error('Finance categories missing — run the base seed first.');
  const catByName = (kind: 'IN' | 'OUT', re: RegExp) =>
    (kind === 'IN' ? incomeCats : expenseCats).find((c) => re.test(c.name)) ??
    (kind === 'IN' ? incomeCats : expenseCats)[0];

  const paymentFlow = await prisma.approvalFlow.findFirst({
    where: { tenantId, flowType: ApprovalFlowType.PAYMENT, active: true },
  });
  const purchaseFlow = await prisma.approvalFlow.findFirst({
    where: { tenantId, flowType: ApprovalFlowType.PURCHASE, active: true },
  });

  // ── Idempotency: wipe owned transactional data (tenant-scoped) ──────────────
  await prisma.kpiCycle.deleteMany({ where: { tenantId } });
  await prisma.kpiFrameworkAssignment.deleteMany({ where: { framework: { tenantId } } });
  await prisma.employee.updateMany({ where: { tenantId }, data: { teamId: null } });
  await prisma.team.deleteMany({ where: { tenantId } });

  await prisma.job.deleteMany({ where: { tenantId } });
  await prisma.candidate.deleteMany({ where: { tenantId } });

  await prisma.assetMaintenance.deleteMany({ where: { tenantId } });
  await prisma.assetAssignment.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.assetCategory.deleteMany({ where: { tenantId } });

  await prisma.leaveRequest.deleteMany({ where: { tenantId } });
  await prisma.leaveBalance.deleteMany({ where: { tenantId } });
  await prisma.probationReview.deleteMany({ where: { tenantId } });
  await prisma.contract.deleteMany({ where: { tenantId } });

  await prisma.salesTask.deleteMany({ where: { tenantId } });
  await prisma.salesActivity.deleteMany({ where: { tenantId } });
  await prisma.salesEmailMessage.deleteMany({ where: { tenantId } });
  await prisma.deal.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.salesCompany.deleteMany({ where: { tenantId } });
  await prisma.product.deleteMany({ where: { tenantId } });

  await prisma.cashTransaction.deleteMany({ where: { tenantId } });
  await prisma.topUpRequest.deleteMany({ where: { tenantId } });
  await prisma.spendingPlan.deleteMany({ where: { tenantId } });
  await prisma.paymentRequest.deleteMany({ where: { tenantId } });
  await prisma.purchaseRequest.deleteMany({ where: { tenantId } });
  await prisma.fundAccount.deleteMany({ where: { tenantId } });
  await prisma.issuingEntity.deleteMany({ where: { tenantId } });

  // ── 1) Contracts (mọi nhân viên) + 2 nhân viên thử việc ─────────────────────
  await prisma.employee.update({
    where: { id: dieu.id },
    data: { contractType: ContractType.PROBATION, probationEndDate: day(2026, 7, 31), joinDate: day(2026, 6, 1) },
  });
  await prisma.employee.update({
    where: { id: phuoc.id },
    data: { contractType: ContractType.PROBATION, probationEndDate: day(2026, 7, 15), joinDate: day(2026, 5, 15) },
  });

  for (const e of employees) {
    const isProbation = e.id === dieu.id || e.id === phuoc.id;
    await prisma.contract.create({
      data: {
        tenantId,
        employeeId: e.id,
        type: isProbation ? ContractType.PROBATION : e.contractType,
        startDate: isProbation ? (e.id === dieu.id ? day(2026, 6, 1) : day(2026, 5, 15)) : e.joinDate,
        endDate: e.id === dieu.id ? day(2026, 7, 31) : e.id === phuoc.id ? day(2026, 7, 15) : null,
        status: ContractStatus.ACTIVE,
        signedAt: e.joinDate,
        note: isProbation ? 'Hợp đồng thử việc 2 tháng' : 'Hợp đồng không xác định thời hạn',
      },
    });
  }
  console.log(`Contracts: ${employees.length} bản (2 thử việc)`);

  // ── 2) Probation reviews ─────────────────────────────────────────────────────
  const criteria = await prisma.probationCriteria.findMany({ where: { tenantId, isActive: true }, orderBy: { order: 'asc' } });
  const rate = (base: number) =>
    Object.fromEntries(criteria.map((c, i) => [c.id, Math.min(5, Math.max(1, base + (i % 2)))]));

  await prisma.probationReview.create({
    data: {
      tenantId,
      employeeId: dieu.id,
      status: ProbationReviewStatus.DRAFT,
      reviewerId: dieu.managerId,
      selfRatings: rate(3),
      selfComment: 'Em đã làm quen quy trình team, hoàn thành các task onboarding đúng hạn.',
      selfSubmittedAt: at(2026, 7, 4, 3),
      probationEndDateAtCreate: day(2026, 7, 31),
    },
  });
  await prisma.probationReview.create({
    data: {
      tenantId,
      employeeId: phuoc.id,
      status: ProbationReviewStatus.PENDING_HR,
      reviewerId: phuoc.managerId,
      selfRatings: rate(4),
      selfComment: 'Em đã chủ động nhận thêm task tối ưu pipeline CI và hoàn thành trước hạn.',
      selfSubmittedAt: at(2026, 7, 1, 2),
      ratings: rate(4),
      deliverables: [
        { title: 'Tối ưu pipeline CI', outcome: 'Giảm thời gian build từ 12p còn 6p', note: 'Chủ động đề xuất' },
        { title: 'Module báo cáo tuần', link: 'https://github.com/example/pr/142', outcome: 'Đã merge' },
      ],
      strengths: 'Chủ động, học nhanh, code sạch.',
      weaknesses: 'Cần cải thiện kỹ năng viết tài liệu.',
      comment: 'Đề xuất ký hợp đồng chính thức.',
      recommendation: ProbationOutcome.CONFIRM,
      submittedAt: at(2026, 7, 5, 8),
      probationEndDateAtCreate: day(2026, 7, 15),
    },
  });
  console.log('Probation: 2 reviews (1 DRAFT + self-eval, 1 PENDING_HR chờ HR quyết định)');

  // ── 3) Leave balances + requests ─────────────────────────────────────────────
  const activeEmployees = employees.filter((e) => e.employeeCode !== 'EMP-910');
  const balanceRows = activeEmployees.flatMap((e) =>
    leaveTypes
      .filter((t) => t.defaultDays > 0)
      .map((t) => ({ tenantId, employeeId: e.id, leaveTypeId: t.id, year: 2026, allocated: t.defaultDays, used: 0 })),
  );
  await prisma.leaveBalance.createMany({ data: balanceRows });

  interface LeaveSpec {
    emp: typeof linh; type: typeof annual; start: Date; end: Date; days: number;
    status: LeaveStatus; reviewer?: string | null; note?: string; reason: string;
  }
  const leaveSpecs: LeaveSpec[] = [
    { emp: linh, type: annual, start: day(2026, 6, 10), end: day(2026, 6, 11), days: 2, status: LeaveStatus.APPROVED, reviewer: tuan.id, reason: 'Về quê có việc gia đình' },
    { emp: duc, type: annual, start: day(2026, 6, 19), end: day(2026, 6, 19), days: 1, status: LeaveStatus.APPROVED, reviewer: tuan.id, reason: 'Việc cá nhân' },
    { emp: hoa, type: sick, start: day(2026, 6, 24), end: day(2026, 6, 25), days: 2, status: LeaveStatus.APPROVED, reviewer: hr.id, reason: 'Sốt siêu vi, có giấy khám' },
    { emp: tuan, type: annual, start: day(2026, 7, 20), end: day(2026, 7, 22), days: 3, status: LeaveStatus.APPROVED, reviewer: hr.id, reason: 'Du lịch cùng gia đình' },
    { emp: binh, type: annual, start: day(2026, 7, 13), end: day(2026, 7, 14), days: 2, status: LeaveStatus.PENDING, reason: 'Đám cưới bạn thân ở Đà Nẵng' },
    { emp: kim, type: annual, start: day(2026, 7, 10), end: day(2026, 7, 10), days: 1, status: LeaveStatus.PENDING, reason: 'Khám sức khỏe định kỳ' },
    { emp: thao, type: sick, start: day(2026, 7, 7), end: day(2026, 7, 7), days: 1, status: LeaveStatus.PENDING, reason: 'Đau răng, đi nha sĩ' },
    { emp: son, type: annual, start: day(2026, 6, 30), end: day(2026, 7, 2), days: 3, status: LeaveStatus.REJECTED, reviewer: tuan.id, note: 'Trùng đợt release, dời sang tuần sau nhé', reason: 'Nghỉ phép năm' },
  ];
  for (const s of leaveSpecs) {
    await prisma.leaveRequest.create({
      data: {
        tenantId,
        employeeId: s.emp.id,
        leaveTypeId: s.type.id,
        startDate: s.start,
        endDate: s.end,
        totalDays: s.days,
        reason: s.reason,
        status: s.status,
        reviewedById: s.reviewer ?? null,
        reviewedAt: s.reviewer ? at(2026, 7, 3, 4) : null,
        reviewNote: s.note ?? null,
      },
    });
    if (s.status === LeaveStatus.APPROVED) {
      await prisma.leaveBalance.updateMany({
        where: { tenantId, employeeId: s.emp.id, leaveTypeId: s.type.id, year: 2026 },
        data: { used: { increment: s.days } },
      });
    }
  }
  console.log(`Leave: ${balanceRows.length} balances, ${leaveSpecs.length} đơn (4 APPROVED / 3 PENDING / 1 REJECTED)`);

  // ── 4) Assets ────────────────────────────────────────────────────────────────
  const catLaptop = await prisma.assetCategory.create({ data: { tenantId, name: 'Laptop', code: 'LAPTOP', icon: 'Laptop' } });
  const catMonitor = await prisma.assetCategory.create({ data: { tenantId, name: 'Màn hình', code: 'MONITOR', icon: 'Monitor' } });
  const catPhone = await prisma.assetCategory.create({ data: { tenantId, name: 'Điện thoại', code: 'PHONE', icon: 'Smartphone' } });

  const assetSpecs = [
    { code: 'AST-001', cat: catLaptop, name: 'MacBook Pro 14" M3', serial: 'C02XL0AAJGH5', brand: 'Apple', cost: 52_000_000, status: AssetStatus.ASSIGNED, holder: tuan },
    { code: 'AST-002', cat: catLaptop, name: 'MacBook Pro 14" M3', serial: 'C02XL0BBJGH6', brand: 'Apple', cost: 52_000_000, status: AssetStatus.ASSIGNED, holder: linh },
    { code: 'AST-003', cat: catLaptop, name: 'ThinkPad X1 Carbon Gen 11', serial: 'PF3XKQMZ', brand: 'Lenovo', cost: 38_000_000, status: AssetStatus.ASSIGNED, holder: duc },
    { code: 'AST-004', cat: catLaptop, name: 'ThinkPad X1 Carbon Gen 11', serial: 'PF3XKQNA', brand: 'Lenovo', cost: 38_000_000, status: AssetStatus.AVAILABLE, holder: null },
    { code: 'AST-005', cat: catMonitor, name: 'Dell UltraSharp U2723QE 27"', serial: 'CN0H8XK1', brand: 'Dell', cost: 14_500_000, status: AssetStatus.ASSIGNED, holder: linh },
    { code: 'AST-006', cat: catMonitor, name: 'Dell UltraSharp U2723QE 27"', serial: 'CN0H8XK2', brand: 'Dell', cost: 14_500_000, status: AssetStatus.UNDER_MAINTENANCE, holder: null },
    { code: 'AST-007', cat: catPhone, name: 'iPhone 15 (test device)', serial: 'F2LLD0AAPP0F', brand: 'Apple', cost: 22_000_000, status: AssetStatus.AVAILABLE, holder: null },
  ] as const;

  for (const a of assetSpecs) {
    const asset = await prisma.asset.create({
      data: {
        tenantId, categoryId: a.cat.id, assetCode: a.code, name: a.name, serialNumber: a.serial,
        brand: a.brand, status: a.status, condition: AssetCondition.GOOD,
        purchaseDate: day(2026, 1, 15), purchaseCost: a.cost, vendor: 'FPT Shop', location: 'VP HCM',
      },
    });
    if (a.holder) {
      await prisma.assetAssignment.create({
        data: {
          tenantId, assetId: asset.id, employeeId: a.holder.id, status: AssetAssignmentStatus.ACTIVE,
          assignedAt: at(2026, 2, 1, 2), assignedById: hr.id, conditionOut: AssetCondition.GOOD,
          ackStatus: AssetAckStatus.SIGNED, ackMethod: AssetAckMethod.IN_APP, acknowledgedAt: at(2026, 2, 1, 4),
        },
      });
    }
    if (a.code === 'AST-007') {
      // Lịch sử: từng giao cho Ngọc rồi thu hồi.
      await prisma.assetAssignment.create({
        data: {
          tenantId, assetId: asset.id, employeeId: ngoc.id, status: AssetAssignmentStatus.RETURNED,
          assignedAt: at(2026, 3, 1, 2), assignedById: hr.id, conditionOut: AssetCondition.GOOD,
          returnedAt: at(2026, 6, 15, 7), returnedById: hr.id, conditionIn: AssetCondition.GOOD,
          ackStatus: AssetAckStatus.SIGNED, ackMethod: AssetAckMethod.IN_APP, acknowledgedAt: at(2026, 3, 1, 3),
          note: 'Thu hồi sau khi kết thúc dự án test mobile',
        },
      });
    }
    if (a.code === 'AST-006') {
      await prisma.assetMaintenance.create({
        data: {
          tenantId, assetId: asset.id, startedAt: at(2026, 7, 1, 2),
          description: 'Màn hình chớp giật, gửi bảo hành Dell', vendor: 'Dell Việt Nam', createdById: hr.id,
        },
      });
    }
  }
  console.log(`Assets: 3 loại, ${assetSpecs.length} tài sản, 5 lượt cấp phát (1 đã thu hồi), 1 bảo trì`);

  // ── 5) Recruitment ───────────────────────────────────────────────────────────
  const template = await prisma.pipelineTemplate.findFirst({
    where: { tenantId },
    include: { stages: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!template || template.stages.length === 0) throw new Error('Pipeline template missing — run the base seed first.');

  const mkJob = async (title: string, deptId: string, headcount: number) => {
    const job = await prisma.job.create({
      data: {
        tenantId, departmentId: deptId, title, headcount, status: JobStatus.OPEN,
        employmentType: 'FULL_TIME', location: 'TP. Hồ Chí Minh', createdById: hr.id, openedAt: at(2026, 6, 1, 2),
        description: `Tuyển ${title} — làm việc hybrid, lương thỏa thuận.`,
      },
    });
    const stages = await Promise.all(
      template.stages.map((s) =>
        prisma.jobStage.create({ data: { jobId: job.id, name: s.name, order: s.order, type: s.type } }),
      ),
    );
    return { job, stages };
  };
  const stageOf = (stages: { id: string; type: StageType }[], type: StageType) =>
    stages.find((s) => s.type === type) ?? stages[0];

  const { job: job1, stages: st1 } = await mkJob('Senior Backend Engineer (Node.js)', engineering.id, 2);
  const { job: job2, stages: st2 } = await mkJob('Chuyên viên Nhân sự tổng hợp', otherDept.id, 1);

  await prisma.jobHiringTeam.createMany({
    data: [
      { jobId: job1.id, employeeId: hr.id, teamRole: HiringTeamRole.RECRUITER },
      { jobId: job1.id, employeeId: tuan.id, teamRole: HiringTeamRole.HIRING_MANAGER },
      { jobId: job1.id, employeeId: khoa.id, teamRole: HiringTeamRole.INTERVIEWER },
      { jobId: job2.id, employeeId: hr.id, teamRole: HiringTeamRole.RECRUITER },
    ],
  });

  const candSpecs = [
    { name: 'Vũ Quang Hải', email: 'hai.vu.dev@gmail.com', phone: '+84901234501', title: 'Backend Engineer @ MoMo', exp: 5, skills: ['Node.js', 'PostgreSQL', 'Redis', 'AWS'], source: CandidateSource.JOB_BOARD, job: job1, stage: stageOf(st1, StageType.INTERVIEW) },
    { name: 'Trần Bảo Ngân', email: 'ngan.tran.be@gmail.com', phone: '+84901234502', title: 'Software Engineer @ VNG', exp: 4, skills: ['TypeScript', 'NestJS', 'Kafka'], source: CandidateSource.REFERRAL, job: job1, stage: stageOf(st1, StageType.OFFER) },
    { name: 'Lê Đức Thịnh', email: 'thinh.le.dev@gmail.com', phone: '+84901234503', title: 'Fullstack Dev @ startup', exp: 3, skills: ['Node.js', 'React', 'MongoDB'], source: CandidateSource.CAREER_SITE, job: job1, stage: stageOf(st1, StageType.SCREEN) },
    { name: 'Phạm Minh Tú', email: 'tu.pham.swe@gmail.com', phone: '+84901234504', title: 'Junior Backend', exp: 1.5, skills: ['Node.js', 'MySQL'], source: CandidateSource.JOB_BOARD, job: job1, stage: stageOf(st1, StageType.SOURCED) },
    { name: 'Nguyễn Hà My', email: 'my.nguyen.hr@gmail.com', phone: '+84901234505', title: 'HR Executive @ FPT', exp: 4, skills: ['C&B', 'Tuyển dụng', 'Luật lao động'], source: CandidateSource.REFERRAL, job: job2, stage: stageOf(st2, StageType.SCREEN) },
    { name: 'Đỗ Văn Lâm', email: 'lam.do.hr@gmail.com', phone: '+84901234506', title: 'HR Generalist', exp: 2, skills: ['Tuyển dụng', 'Đào tạo'], source: CandidateSource.CAREER_SITE, job: job2, stage: stageOf(st2, StageType.SCREEN), rejected: true },
  ];

  let interviewApp: string | null = null;
  for (const c of candSpecs) {
    const cand = await prisma.candidate.create({
      data: {
        tenantId, fullName: c.name, email: c.email, phone: c.phone, currentTitle: c.title,
        totalYearsExp: c.exp, skills: [...c.skills], source: c.source, location: 'TP. Hồ Chí Minh',
        consentGivenAt: at(2026, 6, 5, 2), consentSource: 'Đồng ý qua email ứng tuyển',
      },
    });
    const app = await prisma.application.create({
      data: {
        tenantId, candidateId: cand.id, jobId: c.job.id, currentStageId: c.stage.id,
        status: 'rejected' in c && c.rejected ? ApplicationStatus.REJECTED : ApplicationStatus.ACTIVE,
        rejectionReason: 'rejected' in c && c.rejected ? 'UNDERQUALIFIED' : null,
        source: c.source, appliedAt: at(2026, 6, 8, 3),
      },
    });
    await prisma.applicationStageHistory.create({
      data: { applicationId: app.id, fromStageId: null, toStageId: c.stage.id, changedById: hr.id, changedAt: at(2026, 6, 9, 3) },
    });
    await prisma.applicationActivity.create({
      data: { applicationId: app.id, authorId: hr.id, type: 'NOTE', body: `CV ${c.name} nhìn ổn, chuyển bước tiếp theo.` },
    });
    if (c.stage.type === StageType.INTERVIEW) interviewApp = app.id;
    if (c.stage.type === StageType.OFFER) {
      // Ngân đã qua phỏng vấn — có 1 buổi COMPLETED kèm scorecard.
      const done = await prisma.interview.create({
        data: {
          tenantId, applicationId: app.id, stageId: stageOf(st1, StageType.INTERVIEW).id,
          scheduledAt: at(2026, 6, 25, 3), durationMin: 90, mode: InterviewMode.VIDEO,
          meetingUrl: 'https://meet.google.com/abc-defg-hij', status: InterviewStatus.COMPLETED, createdById: hr.id,
        },
      });
      await prisma.interviewInterviewer.createMany({
        data: [
          { interviewId: done.id, employeeId: tuan.id },
          { interviewId: done.id, employeeId: khoa.id },
        ],
      });
      await prisma.scorecard.createMany({
        data: [
          { interviewId: done.id, interviewerId: tuan.id, overall: ScorecardOverall.STRONG_YES, ratings: { technical: 4, communication: 3, culture: 4 }, notes: 'Nền tảng hệ thống tốt, trả lời sâu về scaling.', submittedAt: at(2026, 6, 25, 6) },
          { interviewId: done.id, interviewerId: khoa.id, overall: ScorecardOverall.YES, ratings: { technical: 3, communication: 4, culture: 4 }, notes: 'Giao tiếp tốt, cần hỏi thêm kinh nghiệm Kafka.', submittedAt: at(2026, 6, 25, 8) },
        ],
      });
    }
  }
  if (interviewApp) {
    const upcoming = await prisma.interview.create({
      data: {
        tenantId, applicationId: interviewApp, stageId: stageOf(st1, StageType.INTERVIEW).id,
        scheduledAt: at(2026, 7, 10, 7), durationMin: 60, mode: InterviewMode.ONSITE,
        location: 'Phòng họp 2, VP HCM', status: InterviewStatus.SCHEDULED, createdById: hr.id,
      },
    });
    await prisma.interviewInterviewer.createMany({
      data: [
        { interviewId: upcoming.id, employeeId: khoa.id },
        { interviewId: upcoming.id, employeeId: tuan.id },
      ],
    });
  }
  console.log('Recruitment: 2 jobs OPEN, 6 candidates, 6 applications, 2 interviews (1 completed + scorecards, 1 sắp tới)');

  // ── 6) KPI: teams + assignment + cycle qua service ───────────────────────────
  const squadWeb = await prisma.team.create({
    data: { tenantId, departmentId: engineering.id, name: 'Squad Web', leadId: tuan.id },
  });
  const squadMobile = await prisma.team.create({
    data: { tenantId, departmentId: engineering.id, name: 'Squad Mobile', leadId: khoa.id },
  });
  await prisma.employee.updateMany({ where: { id: { in: [tuan.id, linh.id, duc.id, son.id] } }, data: { teamId: squadWeb.id } });
  await prisma.employee.updateMany({ where: { id: { in: [khoa.id, ngoc.id, anh.id] } }, data: { teamId: squadMobile.id } });

  const framework = await prisma.kpiFramework.findFirst({ where: { tenantId, isActive: true } });
  if (framework) {
    await prisma.kpiFrameworkAssignment.create({ data: { frameworkId: framework.id, departmentId: engineering.id } });
    const cycle = await kpiCycleService.create(
      tenantId,
      { frameworkId: framework.id, period: KPI_PERIOD, periodType: 'MONTHLY' },
      admin.id,
    );
    try {
      await kpiCycleService.transition(cycle.id, tenantId, 'DATA_ENTRY', admin.id);
      console.log(`KPI: 2 squads, cycle ${KPI_PERIOD} (DATA_ENTRY) với ${cycle.scorecards.length} scorecards`);
    } catch {
      console.log(`KPI: 2 squads, cycle ${KPI_PERIOD} (DRAFT) với ${cycle.scorecards.length} scorecards`);
    }
  } else {
    console.log('KPI: bỏ qua (không có framework active)');
  }

  // ── 7) Sales / CRM ───────────────────────────────────────────────────────────
  const pipeline = await prisma.salesPipeline.findFirst({
    where: { tenantId },
    include: { stages: { orderBy: { order: 'asc' } } },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  if (!pipeline || pipeline.stages.length === 0) throw new Error('Sales pipeline missing — run the base seed first.');
  const sStage = (type: SalesStageType) => pipeline.stages.find((s) => s.type === type) ?? pipeline.stages[0];

  const abc = await prisma.salesCompany.create({
    data: { tenantId, name: 'Công ty TNHH ABC Tech', taxCode: '0312345678', industry: 'Phần mềm', size: '51-200', website: 'https://abctech.vn', address: 'Q.1, TP.HCM' },
  });
  const xyz = await prisma.salesCompany.create({
    data: { tenantId, name: 'CTCP Bán lẻ XYZ', taxCode: '0309876543', industry: 'Bán lẻ', size: '201-500', address: 'Cầu Giấy, Hà Nội' },
  });

  const products = await Promise.all([
    prisma.product.create({ data: { tenantId, name: 'HRM SaaS — Gói Starter', sku: 'HRM-ST', unitPrice: 5_000_000, unit: 'tháng', description: 'Tối đa 50 nhân viên' } }),
    prisma.product.create({ data: { tenantId, name: 'HRM SaaS — Gói Business', sku: 'HRM-BZ', unitPrice: 12_000_000, unit: 'tháng', description: 'Không giới hạn nhân viên + SSO' } }),
    prisma.product.create({ data: { tenantId, name: 'Dịch vụ triển khai & đào tạo', sku: 'SVC-IMPL', unitPrice: 30_000_000, unit: 'gói' } }),
  ]);

  const mkCustomer = (data: Parameters<typeof prisma.customer.create>[0]['data']) => prisma.customer.create({ data });
  const cAbc = await mkCustomer({ tenantId, type: CustomerType.B2B, companyId: abc.id, fullName: 'Trương Vĩnh Phát', title: 'CTO', email: 'phat.truong@abctech.vn', phone: '+84912000001', source: LeadSource.REFERRAL, lifecycleStatus: CustomerLifecycle.QUALIFIED, ownerId: khoa.id, assignedAt: at(2026, 6, 2, 2) });
  const cXyz = await mkCustomer({ tenantId, type: CustomerType.B2B, companyId: xyz.id, fullName: 'Lương Thị Hồng Nhung', title: 'Giám đốc Nhân sự', email: 'nhung.luong@xyzretail.vn', phone: '+84912000002', source: LeadSource.EVENT, lifecycleStatus: CustomerLifecycle.QUALIFIED, ownerId: tuan.id, assignedAt: at(2026, 6, 5, 2) });
  const cCafe = await mkCustomer({ tenantId, type: CustomerType.B2C, fullName: 'Chuỗi Cafe Sáng (a. Toàn)', email: 'toan@cafesang.vn', phone: '+84912000003', source: LeadSource.WEB, lifecycleStatus: CustomerLifecycle.CUSTOMER, ownerId: khoa.id, assignedAt: at(2026, 5, 20, 2) });
  const cDelta = await mkCustomer({ tenantId, type: CustomerType.B2C, fullName: 'Startup Delta (c. Vy)', email: 'vy@delta.vn', phone: '+84912000004', source: LeadSource.SOCIAL, lifecycleStatus: CustomerLifecycle.CONTACTED, ownerId: khoa.id, assignedAt: at(2026, 6, 25, 2) });
  const cLost = await mkCustomer({ tenantId, type: CustomerType.B2C, fullName: 'Cty Gama Logistics', email: 'contact@gama.vn', phone: '+84912000005', source: LeadSource.COLD_EMAIL, lifecycleStatus: CustomerLifecycle.DISQUALIFIED, lostReason: 'Đã dùng giải pháp nội bộ', ownerId: tuan.id, assignedAt: at(2026, 6, 1, 2) });
  await mkCustomer({ tenantId, type: CustomerType.B2C, fullName: 'Nguyễn Tấn Tài (Spa Hoa Sen)', phone: '+84912000006', source: LeadSource.ADVERTISING, lifecycleStatus: CustomerLifecycle.NEW });

  interface DealSpec {
    customer: { id: string }; owner: { id: string }; title: string; amount: number;
    stage: SalesStageType; status: DealStatus; expectedClose?: Date; wonAt?: Date; lostAt?: Date; lostReason?: string;
  }
  const dealSpecs: DealSpec[] = [
    { customer: cAbc, owner: khoa, title: 'HRM Business — ABC Tech (120 nhân viên)', amount: 144_000_000, stage: SalesStageType.PROPOSAL, status: DealStatus.OPEN, expectedClose: day(2026, 7, 30) },
    { customer: cXyz, owner: tuan, title: 'Triển khai HRM — XYZ Retail', amount: 90_000_000, stage: SalesStageType.NEGOTIATION, status: DealStatus.OPEN, expectedClose: day(2026, 8, 15) },
    { customer: cCafe, owner: khoa, title: 'Gói Starter — Chuỗi Cafe Sáng', amount: 60_000_000, stage: SalesStageType.WON, status: DealStatus.WON, wonAt: at(2026, 6, 20, 4) },
    { customer: cLost, owner: tuan, title: 'Gói Starter — Gama Logistics', amount: 25_000_000, stage: SalesStageType.LOST, status: DealStatus.LOST, lostAt: at(2026, 6, 28, 4), lostReason: 'Chọn giải pháp nội bộ' },
    { customer: cDelta, owner: khoa, title: 'Gói Starter — Startup Delta', amount: 30_000_000, stage: SalesStageType.QUALIFYING, status: DealStatus.OPEN, expectedClose: day(2026, 8, 31) },
  ];
  const deals: { id: string }[] = [];
  for (const d of dealSpecs) {
    const stage = sStage(d.stage);
    const deal = await prisma.deal.create({
      data: {
        tenantId, customerId: d.customer.id, pipelineId: pipeline.id, currentStageId: stage.id,
        ownerId: d.owner.id, title: d.title, amount: d.amount, status: d.status,
        expectedCloseDate: d.expectedClose ?? null, wonAt: d.wonAt ?? null, lostAt: d.lostAt ?? null, lostReason: d.lostReason ?? null,
      },
    });
    deals.push(deal);
    await prisma.dealStageHistory.create({
      data: { dealId: deal.id, fromStageId: null, toStageId: stage.id, changedById: d.owner.id, changedAt: at(2026, 6, 10, 2) },
    });
    await prisma.salesActivity.create({
      data: { tenantId, customerId: d.customer.id, dealId: deal.id, authorId: d.owner.id, type: SalesActivityType.NOTE, body: `Đã trao đổi nhu cầu: ${d.title}.`, occurredAt: at(2026, 6, 12, 3) },
    });
  }
  // Báo giá chính cho deal ABC (tổng khớp Deal.amount).
  const quote = await prisma.quote.create({
    data: { tenantId, dealId: deals[0].id, code: 'BG-2026-001', status: QuoteStatus.SENT, isPrimary: true, validUntil: day(2026, 7, 31), total: 144_000_000 },
  });
  await prisma.quoteItem.createMany({
    data: [
      { quoteId: quote.id, productId: products[1].id, description: 'Gói Business 12 tháng', quantity: 12, unitPrice: 12_000_000, discountPct: 0, lineTotal: 144_000_000 },
    ],
  });
  await prisma.salesTask.createMany({
    data: [
      { tenantId, customerId: cAbc.id, dealId: deals[0].id, assigneeId: khoa.id, type: SalesTaskType.CALL, title: 'Gọi follow-up báo giá ABC Tech', dueAt: at(2026, 7, 8, 7), status: SalesTaskStatus.OPEN },
      { tenantId, customerId: cXyz.id, dealId: deals[1].id, assigneeId: tuan.id, type: SalesTaskType.MEETING, title: 'Demo on-site cho XYZ Retail', dueAt: at(2026, 7, 10, 2), status: SalesTaskStatus.OPEN },
      { tenantId, customerId: cCafe.id, assigneeId: khoa.id, type: SalesTaskType.EMAIL, title: 'Gửi hướng dẫn onboarding Cafe Sáng', dueAt: at(2026, 6, 25, 3), status: SalesTaskStatus.DONE, completedAt: at(2026, 6, 25, 5) },
    ],
  });
  console.log('Sales: 2 companies, 6 customers, 3 products, 5 deals (1 WON, 1 LOST), 1 báo giá, 3 tasks');

  // ── 8) Finance (SPEC-048) ────────────────────────────────────────────────────
  const entity1 = await prisma.issuingEntity.create({
    data: { tenantId, name: 'Công ty TNHH CodeCrush Software', address: '123 Nguyễn Văn Linh, Q.7, TP.HCM', taxCode: '0315551234', phone: '028 3999 8888', isDefault: true },
  });
  const entity2 = await prisma.issuingEntity.create({
    data: { tenantId, name: 'CTCP CodeCrush Education', address: '45 Duy Tân, Cầu Giấy, Hà Nội', taxCode: '0109998765', phone: '024 3777 6666' },
  });

  const vcb = await prisma.fundAccount.create({
    data: { tenantId, issuingEntityId: entity1.id, name: 'VCB — TK thanh toán 007704xxxx', type: FundAccountType.BANK, openingBalance: 500_000_000 },
  });
  const cash = await prisma.fundAccount.create({
    data: { tenantId, issuingEntityId: entity1.id, name: 'Quỹ tiền mặt VP HCM', type: FundAccountType.CASH, openingBalance: 30_000_000 },
  });
  const acb = await prisma.fundAccount.create({
    data: { tenantId, issuingEntityId: entity2.id, name: 'ACB — TK Education 8899xxxx', type: FundAccountType.BANK, openingBalance: 200_000_000 },
  });

  // Top-up requests (tạo trước để giao dịch nạp quỹ trỏ sourceRefId).
  const topupApproved = await prisma.topUpRequest.create({
    data: {
      tenantId, issuingEntityId: entity1.id, title: 'Nạp quỹ chi lương + vận hành tháng 7',
      amount: 100_000_000, period: '2026-07', neededByDate: day(2026, 7, 5),
      justification: 'Kế hoạch chi tháng 7 đã duyệt 155tr; số dư khả dụng sau lương tháng 6 không đủ độ đệm an toàn 1 tháng.',
      status: TopUpStatus.APPROVED, reviewedById: founder.id, reviewedAt: at(2026, 7, 2, 3),
      reviewNote: 'Duyệt, chuyển từ TK tổng.', fundedAccountId: vcb.id, fundedAt: at(2026, 7, 2, 4), createdById: hr.id,
    },
  });
  await prisma.topUpRequest.create({
    data: {
      tenantId, issuingEntityId: entity2.id, title: 'Nạp quỹ marketing khóa học Q3',
      amount: 50_000_000, period: '2026-07', neededByDate: day(2026, 7, 20),
      justification: 'Chiến dịch tuyển sinh Q3 cần ngân sách quảng cáo 50tr theo kế hoạch đã trình.',
      status: TopUpStatus.PENDING, createdById: hr.id,
    },
  });

  const catSalary = catByName('OUT', /lương/i);
  const catRent = catByName('OUT', /thuê|văn phòng/i);
  const catMkt = catByName('OUT', /marketing|quảng/i);
  const catOps = catByName('OUT', /vận hành|khác|chi phí/i);
  const catRevenue = catByName('IN', /doanh thu|dịch vụ/i);
  const catTopup = incomeCats.find((c) => c.name === 'Nạp quỹ / Góp vốn') ?? catByName('IN', /nạp|góp/i);

  interface TxSpec {
    account: { id: string }; entity: { id: string }; dir: TransactionDirection; status: TransactionStatus;
    amount: number; date: Date; cat: { id: string } | null; desc: string; ref?: string; srcRef?: string;
  }
  const txSpecs: TxSpec[] = [
    { account: vcb, entity: entity1, dir: 'IN', status: 'ACTUAL', amount: 120_000_000, date: at(2026, 6, 14, 3), cat: catRevenue, desc: 'Thanh toán HĐ dịch vụ phần mềm — ABC Tech (đợt 1)', ref: 'FT26165001' },
    { account: vcb, entity: entity1, dir: 'OUT', status: 'ACTUAL', amount: 180_000_000, date: at(2026, 6, 5, 3), cat: catSalary, desc: 'Chi lương tháng 5/2026', ref: 'LUONG-2026-05' },
    { account: vcb, entity: entity1, dir: 'OUT', status: 'ACTUAL', amount: 25_000_000, date: at(2026, 6, 3, 3), cat: catRent, desc: 'Tiền thuê VP tháng 6/2026' },
    { account: vcb, entity: entity1, dir: 'OUT', status: 'ACTUAL', amount: 15_000_000, date: at(2026, 6, 18, 3), cat: catMkt, desc: 'Chạy quảng cáo tuyển dụng + brand' },
    { account: vcb, entity: entity1, dir: 'OUT', status: 'ACTUAL', amount: 25_000_000, date: at(2026, 7, 3, 3), cat: catRent, desc: 'Tiền thuê VP tháng 7/2026' },
    { account: vcb, entity: entity1, dir: 'IN', status: 'ACTUAL', amount: 100_000_000, date: at(2026, 7, 2, 4), cat: catTopup, desc: `Nạp quỹ theo đề xuất: Nạp quỹ chi lương + vận hành tháng 7`, srcRef: topupApproved.id },
    { account: cash, entity: entity1, dir: 'OUT', status: 'ACTUAL', amount: 3_500_000, date: at(2026, 6, 20, 3), cat: catOps, desc: 'Văn phòng phẩm + tiếp khách' },
    { account: cash, entity: entity1, dir: 'OUT', status: 'ACTUAL', amount: 5_200_000, date: at(2026, 7, 1, 3), cat: catOps, desc: 'Điện nước internet tháng 6' },
    { account: acb, entity: entity2, dir: 'IN', status: 'ACTUAL', amount: 85_000_000, date: at(2026, 6, 25, 3), cat: catRevenue, desc: 'Học phí khóa Fullstack K12', ref: 'FT26176002' },
    { account: acb, entity: entity2, dir: 'OUT', status: 'ACTUAL', amount: 40_000_000, date: at(2026, 6, 28, 3), cat: catSalary, desc: 'Thù lao giảng viên tháng 6' },
    // PLANNED — chỉ feed dự báo, không đụng số dư.
    { account: vcb, entity: entity1, dir: 'OUT', status: 'PLANNED', amount: 185_000_000, date: day(2026, 7, 5), cat: catSalary, desc: 'Dự kiến chi lương tháng 6/2026' },
    { account: vcb, entity: entity1, dir: 'IN', status: 'PLANNED', amount: 144_000_000, date: day(2026, 7, 30), cat: catRevenue, desc: 'Dự thu HĐ ABC Tech (ký mới)' },
  ];
  for (const t of txSpecs) {
    await prisma.cashTransaction.create({
      data: {
        tenantId, accountId: t.account.id, issuingEntityId: t.entity.id, direction: t.dir, status: t.status,
        amount: t.amount, occurredAt: t.date, categoryId: t.cat?.id ?? null, description: t.desc,
        reference: t.ref ?? null, source: 'MANUAL', sourceRefId: t.srcRef ?? null, createdById: hr.id,
      },
    });
  }
  // Recompute current balances = opening + Σ(IN actual) − Σ(OUT actual).
  for (const acc of [vcb, cash, acb]) {
    const sums = await prisma.cashTransaction.groupBy({
      by: ['direction'],
      where: { accountId: acc.id, status: 'ACTUAL' },
      _sum: { amount: true },
    });
    const inSum = Number(sums.find((s) => s.direction === 'IN')?._sum.amount ?? 0);
    const outSum = Number(sums.find((s) => s.direction === 'OUT')?._sum.amount ?? 0);
    const fresh = await prisma.fundAccount.findUniqueOrThrow({ where: { id: acc.id }, select: { openingBalance: true } });
    await prisma.fundAccount.update({
      where: { id: acc.id },
      data: { currentBalance: Number(fresh.openingBalance) + inSum - outSum },
    });
  }

  // Payment requests (flow PAYMENT: bước 1 MANAGER → bước 2 super_admin).
  const payStep = (requester: { managerId: string | null }, stepOrder: number) =>
    stepOrder === 1
      ? { stepOrder: 1, approverType: ApproverType.MANAGER, roleKey: null as string | null, approverId: requester.managerId }
      : { stepOrder: 2, approverType: ApproverType.ROLE, roleKey: 'super_admin', approverId: null as string | null };

  // 1 PENDING (chờ manager duyệt)
  await prisma.paymentRequest.create({
    data: {
      tenantId, employeeId: linh.id, type: PaymentRequestType.REIMBURSEMENT,
      title: 'Hoàn ứng taxi gặp khách hàng ABC Tech', amount: 450_000, status: PaymentRequestStatus.PENDING,
      expenseDate: day(2026, 7, 2), category: 'Đi lại', description: 'Grab 2 chiều VP ↔ Q.1, có hóa đơn.',
      flowId: paymentFlow?.id ?? null, currentStep: 1,
      approvals: paymentFlow
        ? { create: [{ tenantId, round: 1, ...payStep(linh, 1) }, { tenantId, round: 1, ...payStep(linh, 2) }] }
        : undefined,
    },
  });
  // 1 APPROVED (đã duyệt hết, chờ chi)
  await prisma.paymentRequest.create({
    data: {
      tenantId, employeeId: duc.id, type: PaymentRequestType.ADVANCE,
      title: 'Tạm ứng mua license JetBrains team', amount: 12_000_000, status: PaymentRequestStatus.APPROVED,
      neededByDate: day(2026, 7, 10), description: 'Gia hạn 5 license All Products Pack.',
      flowId: paymentFlow?.id ?? null, currentStep: 3,
      reviewedById: admin.id, reviewedAt: at(2026, 7, 4, 4),
      approvals: paymentFlow
        ? {
            create: [
              { tenantId, round: 1, ...payStep(duc, 1), decision: ApprovalDecision.APPROVED, decidedById: duc.managerId, decidedAt: at(2026, 7, 3, 4) },
              { tenantId, round: 1, ...payStep(duc, 2), decision: ApprovalDecision.APPROVED, decidedById: admin.id, decidedAt: at(2026, 7, 4, 4) },
            ],
          }
        : undefined,
    },
  });
  // 1 PAID (hoàn tất)
  await prisma.paymentRequest.create({
    data: {
      tenantId, employeeId: binh.id, type: PaymentRequestType.VENDOR_PAYMENT,
      title: 'Thanh toán NCC hosting tháng 6', amount: 8_800_000, status: PaymentRequestStatus.PAID,
      vendorName: 'Viettel IDC', invoiceNumber: 'VAT-2026-06-1188', dueDate: day(2026, 6, 30),
      flowId: paymentFlow?.id ?? null, currentStep: 3,
      reviewedById: admin.id, reviewedAt: at(2026, 6, 26, 4),
      paidById: admin.id, paidAt: at(2026, 6, 28, 4), paymentNote: 'CK VCB FT26179003',
      approvals: paymentFlow
        ? {
            create: [
              { tenantId, round: 1, ...payStep(binh, 1), decision: ApprovalDecision.APPROVED, decidedById: binh.managerId, decidedAt: at(2026, 6, 25, 4) },
              { tenantId, round: 1, ...payStep(binh, 2), decision: ApprovalDecision.APPROVED, decidedById: admin.id, decidedAt: at(2026, 6, 26, 4) },
            ],
          }
        : undefined,
    },
  });

  // Purchase requests.
  const prItems1 = [
    { lineNo: 1, productName: 'Ghế công thái học Sihoo M57', unit: 'cái', quantity: 4, unitPrice: 4_500_000, taxRate: 8 },
    { lineNo: 2, productName: 'Bàn nâng hạ 1m4', unit: 'cái', quantity: 2, unitPrice: 6_800_000, taxRate: 8 },
    { lineNo: 3, productName: 'Màn hình Dell 27" 4K', sku: 'U2723QE', unit: 'cái', quantity: 2, unitPrice: 14_500_000, taxRate: 10 },
  ].map((i) => {
    const sub = i.quantity * i.unitPrice;
    const tax = Math.round((sub * i.taxRate) / 100);
    return { ...i, lineSubtotal: sub, lineTax: tax, lineTotal: sub + tax };
  });
  const sum1 = prItems1.reduce((a, i) => ({ sub: a.sub + i.lineSubtotal, tax: a.tax + i.lineTax }), { sub: 0, tax: 0 });
  await prisma.purchaseRequest.create({
    data: {
      tenantId, employeeId: linh.id, code: 'PR-20260701-001', title: 'Trang bị chỗ ngồi cho nhân sự mới',
      vendorName: 'Nội thất Văn phòng Á Châu', expectedDeliveryDate: day(2026, 7, 15),
      status: PurchaseRequestStatus.APPROVED,
      subtotal: sum1.sub, taxAmount: sum1.tax, totalAmount: sum1.sub + sum1.tax,
      flowId: purchaseFlow?.id ?? null, currentStep: 3,
      reviewedById: admin.id, reviewedAt: at(2026, 7, 2, 4),
      issuingEntityId: entity1.id, issuingCompanyName: 'Công ty TNHH CodeCrush Software',
      issuingAddress: '123 Nguyễn Văn Linh, Q.7, TP.HCM', issuingTaxCode: '0315551234', issuingPhone: '028 3999 8888',
      items: { create: prItems1 },
      approvals: purchaseFlow
        ? {
            create: [
              { tenantId, round: 1, ...payStep(linh, 1), decision: ApprovalDecision.APPROVED, decidedById: linh.managerId, decidedAt: at(2026, 7, 1, 6) },
              { tenantId, round: 1, ...payStep(linh, 2), decision: ApprovalDecision.APPROVED, decidedById: admin.id, decidedAt: at(2026, 7, 2, 4) },
            ],
          }
        : undefined,
    },
  });
  const prItems2 = [
    { lineNo: 1, productName: 'License Figma Professional (năm)', unit: 'seat', quantity: 3, unitPrice: 4_200_000, taxRate: 10 },
    { lineNo: 2, productName: 'License Slack Pro (năm)', unit: 'seat', quantity: 10, unitPrice: 2_100_000, taxRate: 10 },
  ].map((i) => {
    const sub = i.quantity * i.unitPrice;
    const tax = Math.round((sub * i.taxRate) / 100);
    return { ...i, lineSubtotal: sub, lineTax: tax, lineTotal: sub + tax };
  });
  const sum2 = prItems2.reduce((a, i) => ({ sub: a.sub + i.lineSubtotal, tax: a.tax + i.lineTax }), { sub: 0, tax: 0 });
  await prisma.purchaseRequest.create({
    data: {
      tenantId, employeeId: thao.id, code: 'PR-20260705-001', title: 'Gia hạn license công cụ thiết kế & liên lạc',
      vendorName: 'SoftDist VN', expectedDeliveryDate: day(2026, 7, 20),
      status: PurchaseRequestStatus.PENDING,
      subtotal: sum2.sub, taxAmount: sum2.tax, totalAmount: sum2.sub + sum2.tax,
      flowId: purchaseFlow?.id ?? null, currentStep: 1,
      issuingEntityId: entity1.id, issuingCompanyName: 'Công ty TNHH CodeCrush Software',
      issuingAddress: '123 Nguyễn Văn Linh, Q.7, TP.HCM', issuingTaxCode: '0315551234', issuingPhone: '028 3999 8888',
      items: { create: prItems2 },
      approvals: purchaseFlow
        ? { create: [{ tenantId, round: 1, ...payStep(thao, 1) }, { tenantId, round: 1, ...payStep(thao, 2) }] }
        : undefined,
    },
  });

  // Spending plans.
  const planItems = [
    { title: 'Lương + BHXH tháng 7', amount: 95_000_000, categoryId: catSalary.id, expectedDate: day(2026, 7, 5) },
    { title: 'Thuê văn phòng', amount: 25_000_000, categoryId: catRent.id, expectedDate: day(2026, 7, 3) },
    { title: 'Marketing tuyển dụng', amount: 15_000_000, categoryId: catMkt.id, expectedDate: day(2026, 7, 15) },
    { title: 'Vận hành (điện nước, VPP)', amount: 10_000_000, categoryId: catOps.id, expectedDate: day(2026, 7, 10) },
    { title: 'Mua sắm nội thất (PR-20260701-001)', amount: 60_000_000, categoryId: catOps.id, expectedDate: day(2026, 7, 15) },
  ];
  await prisma.spendingPlan.create({
    data: {
      tenantId, departmentId: engineering.id, issuingEntityId: entity1.id, period: '2026-07',
      status: SpendingPlanStatus.APPROVED, totalAmount: planItems.reduce((a, i) => a + i.amount, 0),
      createdById: tuan.id, submittedById: tuan.id, submittedAt: at(2026, 6, 26, 4),
      reviewedById: hr.id, reviewedAt: at(2026, 6, 28, 4), reviewNote: 'OK theo ngân sách quý.',
      items: { create: planItems },
    },
  });
  await prisma.spendingPlan.create({
    data: {
      tenantId, departmentId: otherDept.id, issuingEntityId: entity1.id, period: '2026-08',
      status: SpendingPlanStatus.DRAFT, totalAmount: 32_000_000, createdById: huong.id,
      items: {
        create: [
          { title: 'Team building quý 3', amount: 24_000_000, categoryId: catOps.id, expectedDate: day(2026, 8, 15) },
          { title: 'Đào tạo kỹ năng quản lý', amount: 8_000_000, categoryId: catOps.id, expectedDate: day(2026, 8, 20) },
        ],
      },
    },
  });

  console.log('Finance: 2 pháp nhân, 3 quỹ (số dư tự tính), 12 giao dịch, 3 payment requests, 2 purchase requests, 2 spending plans, 2 top-up');
  console.log('Seed demo full hoàn tất!');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
