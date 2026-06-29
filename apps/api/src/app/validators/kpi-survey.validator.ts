import { z } from 'zod';

export const createSurveySchema = z.object({
  frameworkId: z.string().min(1).nullish(),
  type: z.enum(['MONTHLY_MORALE', 'QUARTERLY_PEER_360']),
  title: z.string().trim().min(1).max(200),
  minResponses: z.number().int().min(1).max(1000).optional(),
});

export const updateSurveySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  minResponses: z.number().int().min(1).max(1000).optional(),
  active: z.boolean().optional(),
});

export const surveyQuestionSchema = z
  .object({
    code: z.string().trim().min(1).max(20),
    text: z.string().trim().min(1).max(500),
    scaleMin: z.number().int().min(0).max(100).optional(),
    scaleMax: z.number().int().min(1).max(100).optional(),
    mapsToKpiCode: z.string().max(20).nullish(),
    order: z.number().int().min(0).optional(),
  })
  .refine((q) => (q.scaleMax ?? 10) >= (q.scaleMin ?? 1), {
    message: 'scaleMax phải ≥ scaleMin', path: ['scaleMax'],
  });

export const submitResponseSchema = z.object({
  cycleId: z.string().min(1).nullish(),
  subjectEmployeeId: z.string().min(1).nullish(),
  answers: z.record(z.string(), z.number()).refine((a) => Object.keys(a).length > 0, { message: 'Chưa có câu trả lời' }),
});
