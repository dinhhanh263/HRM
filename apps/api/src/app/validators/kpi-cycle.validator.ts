import { z } from 'zod';

const periodType = z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']);
const cycleStatus = z.enum(['DRAFT', 'DATA_ENTRY', 'SELF_ASSESSMENT', 'PENDING_REVIEW', 'FINALIZED', 'CLOSED']);

export const createCycleSchema = z.object({
  frameworkId: z.string().min(1),
  period: z.string().trim().min(1).max(10),
  periodType,
});

export const transitionCycleSchema = z.object({
  status: cycleStatus,
});

export const bulkEntriesSchema = z.object({
  entries: z
    .array(
      z.object({
        kpiDefinitionId: z.string().min(1),
        scorecardId: z.string().min(1).nullish(),
        teamId: z.string().min(1).nullish(),
        actualValue: z.number().finite().min(-1e9).max(1e9).nullable(), // khớp Decimal(14,4)
        note: z.string().max(500).nullish(),
      }),
    )
    .min(1)
    .max(500),
});

export const setScorecardProfileSchema = z.object({
  weightProfileId: z.string().min(1).nullable(),
});

export const selfAssessSchema = z.object({
  selfComment: z.string().trim().min(1).max(2000),
});

export const reviewScorecardSchema = z
  .object({
    decision: z.enum(['APPROVED', 'RETURNED']),
    note: z.string().max(1000).nullish(),
    strengths: z.string().max(2000).nullish(),
    areasToImprove: z.string().max(2000).nullish(),
    actionPlan: z.string().max(2000).nullish(),
    recognition: z.string().max(2000).nullish(),
    reviewComment: z.string().max(2000).nullish(),
  })
  // Trả về phải kèm lý do để nhân viên biết cần bổ sung gì.
  .refine((b) => b.decision !== 'RETURNED' || (b.note != null && b.note.trim().length > 0), {
    message: 'Trả về phải kèm ghi chú lý do',
    path: ['note'],
  });
