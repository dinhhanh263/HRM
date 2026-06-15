import { z } from 'zod';

// SPEC-031: nhóm What/How của tiêu chí.
const competencyGroup = z.enum(['PERFORMANCE', 'VALUES']);

// SPEC-031: rubric BARS — nếu có thì đúng 5 mức, score 1..5 không trùng (suy ra phủ đủ 1..5).
const rubricLevelSchema = z.object({
  score: z.number().int().min(1).max(5),
  level: z.string().min(1).max(120),
  definition: z.string().max(2000).optional(),
  observable: z.string().max(2000).optional(),
});

const rubricSchema = z
  .array(rubricLevelSchema)
  .length(5)
  .refine((levels) => new Set(levels.map((l) => l.score)).size === 5, {
    message: 'Rubric scores must be unique (1..5)',
  });

export const createProbationCriteriaSchema = z.object({
  name: z.string().min(1).max(120),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  group: competencyGroup.optional(),
  rubric: rubricSchema.nullish(),
});

export const updateProbationCriteriaSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  group: competencyGroup.optional(),
  rubric: rubricSchema.nullish(),
});

export const listProbationCriteriaQuerySchema = z.object({
  activeOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const createProbationReviewSchema = z.object({
  employeeId: z.string().min(1),
});

const dateInput = z.union([z.string().datetime({ offset: true }), z.string().date()]);
const ratingsInput = z.record(z.string().min(1), z.number().int().min(1).max(5));
const outcome = z.enum(['CONFIRM', 'EXTEND', 'FAIL']);

// SPEC-031: bằng chứng deliverable — title bắt buộc, link là URL thật, tối đa 50 mục.
// Link render thành <a href> ở view của HR nên chỉ nhận http(s) — z.string().url()
// một mình vẫn chấp nhận javascript:/data: (XSS khi click).
const deliverableSchema = z.object({
  title: z.string().min(1).max(200),
  link: z
    .string()
    .url()
    .max(500)
    .refine((u) => /^https?:\/\//i.test(u), { message: 'Link must be http(s)' })
    .nullish(),
  outcome: z.enum(['MET', 'EXCEEDED', 'NOT_MET']).nullish(),
  note: z.string().max(1000).nullish(),
});
const deliverablesInput = z.array(deliverableSchema).max(50);

// Save draft — every field optional (partial scorecard).
export const patchProbationReviewSchema = z.object({
  ratings: ratingsInput.optional(),
  deliverables: deliverablesInput.optional(),
  strengths: z.string().max(2000).nullish(),
  weaknesses: z.string().max(2000).nullish(),
  comment: z.string().max(2000).nullish(),
  recommendation: outcome.nullish(),
  newProbationEndDate: dateInput.nullish(),
});

// Submit — ratings + recommendation required; business rules checked in the service.
export const submitProbationReviewSchema = z.object({
  ratings: ratingsInput,
  recommendation: outcome,
  deliverables: deliverablesInput.optional(),
  strengths: z.string().max(2000).nullish(),
  weaknesses: z.string().max(2000).nullish(),
  comment: z.string().max(2000).nullish(),
  newProbationEndDate: dateInput.nullish(),
});

// SPEC-033: Self Evaluation — NV tự chấm cùng thang 1..5; comment tổng tùy chọn.
export const patchProbationSelfSchema = z.object({
  selfRatings: ratingsInput.optional(),
  selfComment: z.string().max(2000).nullish(),
});

export const submitProbationSelfSchema = z.object({
  selfRatings: ratingsInput,
  selfComment: z.string().max(2000).nullish(),
});

// Decide — HR final outcome; consequence-specific fields validated in the service.
export const decideReviewSchema = z.object({
  decision: outcome,
  decisionNote: z.string().max(2000).nullish(),
  newProbationEndDate: dateInput.nullish(),
});

export const listProbationReviewQuerySchema = z.object({
  status: z.enum(['DRAFT', 'PENDING_HR', 'DECIDED', 'CANCELLED']).optional(),
  employeeId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// SPEC-032: hướng dẫn đánh giá theo năm cho manager.
const guidelineYear = z.number().int().min(2000).max(2100);
// §2c: mỗi bài gắn ngôn ngữ; tab lọc theo ngôn ngữ UI.
const guidelineLanguage = z.enum(['vi', 'en']);

export const listProbationGuidelineQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  language: guidelineLanguage.optional(),
});

export const createProbationGuidelineSchema = z.object({
  year: guidelineYear,
  language: guidelineLanguage.optional(),
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(20_000),
  order: z.number().int().min(0).optional(),
});

export const updateProbationGuidelineSchema = z
  .object({
    year: guidelineYear.optional(),
    language: guidelineLanguage.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().min(1).max(20_000).optional(),
    order: z.number().int().min(0).optional(),
  })
  // PATCH rỗng chỉ bump updatedAt → hiển thị "Cập nhật" sai với người đọc.
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export type CreateProbationCriteriaInput = z.infer<typeof createProbationCriteriaSchema>;
export type UpdateProbationCriteriaInput = z.infer<typeof updateProbationCriteriaSchema>;
export type CreateProbationReviewInput = z.infer<typeof createProbationReviewSchema>;
export type PatchProbationReviewInput = z.infer<typeof patchProbationReviewSchema>;
export type SubmitProbationReviewInput = z.infer<typeof submitProbationReviewSchema>;
export type DecideReviewInput = z.infer<typeof decideReviewSchema>;
