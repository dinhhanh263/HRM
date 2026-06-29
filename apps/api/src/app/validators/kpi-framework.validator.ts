import { z } from 'zod';

const periodType = z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']);
const direction = z.enum(['HIGHER_BETTER', 'LOWER_BETTER']);
const scope = z.enum(['INDIVIDUAL', 'TEAM']);
const inputType = z.enum(['MANUAL', 'SURVEY']);
const scoringMethod = z.enum(['THRESHOLD_LINEAR', 'DIRECT', 'BOOLEAN', 'BANDED']);
const weight = z.number().min(0).max(100);

export const upsertFrameworkSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(1000).nullish(),
    defaultPeriodType: periodType.optional(),
    passAnchor: z.number().min(0).max(100).optional(),
    targetAnchor: z.number().min(0).max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((f) => f.passAnchor == null || f.targetAnchor == null || f.passAnchor < f.targetAnchor, {
    message: 'passAnchor phải nhỏ hơn targetAnchor',
    path: ['passAnchor'],
  });

export const upsertPillarSchema = z.object({
  name: z.string().trim().min(1).max(120),
  weight,
  order: z.number().int().min(0).optional(),
  color: z.string().max(20).nullish(),
});

export const upsertDefinitionSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullish(),
  dataSource: z.string().max(300).nullish(),
  unit: z.string().max(40).nullish(),
  direction,
  targetValue: z.number().nullish(),
  minValue: z.number().nullish(),
  weightInPillar: weight,
  scope,
  inputType,
  scoringMethod,
  surveyKpiCode: z.string().max(40).nullish(),
  frequency: z.string().max(40).nullish(),
  order: z.number().int().min(0).optional(),
});

export const upsertProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).nullish(),
  pillarWeights: z
    .array(z.object({ pillarId: z.string().min(1), weight }))
    .min(1),
});

export const upsertBandSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    minScore: z.number().min(0).max(100),
    maxScore: z.number().min(0).max(100),
    color: z.string().max(20).nullish(),
    recommendedAction: z.string().max(500).nullish(),
    order: z.number().int().min(0).optional(),
  })
  .refine((b) => b.minScore <= b.maxScore, {
    message: 'minScore phải ≤ maxScore',
    path: ['minScore'],
  });

export const setDepartmentsSchema = z.object({
  departmentIds: z.array(z.string().min(1)),
});
