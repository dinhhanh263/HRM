import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildKpiCycleWorkbook } from '../../src/domain/kpi/export.js';
import type { KpiCycleDetailDto } from '@hrm/shared';

function fakeCycle(): KpiCycleDetailDto {
  const pillars = [
    { id: 'p1', frameworkId: 'f', name: 'Delivery', weight: 60, order: 0, color: null, definitions: [] },
    { id: 'p2', frameworkId: 'f', name: 'Quality', weight: 40, order: 1, color: null, definitions: [] },
  ];
  return {
    id: 'c1', frameworkId: 'f', frameworkName: 'Agile', period: '2026-06', periodType: 'MONTHLY', status: 'DATA_ENTRY',
    framework: {
      id: 'f', tenantId: 't', name: 'Agile', description: null, defaultPeriodType: 'MONTHLY',
      passAnchor: 60, targetAnchor: 90, isActive: true, pillars, weightProfiles: [], ratingBands: [],
      departmentIds: [], createdAt: '', updatedAt: '',
    },
    scorecards: [
      {
        id: 's1', cycleId: 'c1', employeeId: 'e1', employeeName: 'Alice', teamId: null,
        weightProfileId: null, weightProfileName: 'Dev', weightedTotal: 83, ratingLabel: 'Tốt',
        status: 'PENDING', currentStep: 0, selfComment: null, selfSubmittedAt: null, strengths: null,
        areasToImprove: null, actionPlan: null, recognition: null, reviewComment: null, reviewerId: null,
        pillars: [
          { pillarId: 'p1', pillarName: 'Delivery', score: 80, weight: 60 },
          { pillarId: 'p2', pillarName: 'Quality', score: 90, weight: 40 },
        ],
        entries: [], approvals: [],
      },
    ],
    teams: [], teamEntries: [], createdAt: '', updatedAt: '',
  };
}

describe('buildKpiCycleWorkbook', () => {
  it('produces an xlsx with a header and one row per scorecard', async () => {
    const buf = await buildKpiCycleWorkbook(fakeCycle());
    expect(buf.length).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheet = wb.getWorksheet('Tổng hợp KPI')!;
    expect(sheet).toBeTruthy();

    // Row 1 = title, row 2 = header, row 3 = Alice
    const header = sheet.getRow(2).values as unknown[];
    expect(header).toContain('Delivery');
    expect(header).toContain('Quality');
    expect(header).toContain('Tổng (weighted)');

    const aliceRow = sheet.getRow(3).values as unknown[];
    expect(aliceRow).toContain('Alice');
    expect(aliceRow).toContain(80); // Delivery score as a real number
    expect(aliceRow).toContain(83); // weighted total
    expect(aliceRow).toContain('Tốt');
  });

  it('handles an empty cycle (no scorecards) and null scores without crashing', async () => {
    const cycle = fakeCycle();
    cycle.scorecards = [];
    const empty = await buildKpiCycleWorkbook(cycle);
    expect(empty.length).toBeGreaterThan(0);

    const withNull = fakeCycle();
    withNull.scorecards[0].weightedTotal = null;
    withNull.scorecards[0].ratingLabel = null;
    withNull.scorecards[0].pillars[0].score = null;
    const buf = await buildKpiCycleWorkbook(withNull);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const row = wb.getWorksheet('Tổng hợp KPI')!.getRow(3).values as unknown[];
    expect(row).toContain('Alice'); // row still rendered, null cells blank
  });
});
