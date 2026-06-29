import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

const SURVEY_INCLUDE = {
  questions: { orderBy: { order: 'asc' } },
  _count: { select: { responses: true } },
} satisfies Prisma.KpiSurveyInclude;

export const kpiSurveyRepository = {
  findAll(tenantId: string, frameworkId?: string) {
    return db.kpiSurvey.findMany({
      where: { tenantId, ...(frameworkId ? { frameworkId } : {}) },
      orderBy: { createdAt: 'asc' },
      include: SURVEY_INCLUDE,
    });
  },

  findActive(tenantId: string) {
    return db.kpiSurvey.findMany({
      where: { tenantId, active: true },
      orderBy: { createdAt: 'asc' },
      include: SURVEY_INCLUDE,
    });
  },

  findById(id: string, tenantId: string) {
    return db.kpiSurvey.findFirst({ where: { id, tenantId }, include: SURVEY_INCLUDE });
  },

  create(tenantId: string, data: { frameworkId: string | null; type: 'MONTHLY_MORALE' | 'QUARTERLY_PEER_360'; title: string; minResponses: number }) {
    return db.kpiSurvey.create({ data: { tenantId, ...data } });
  },

  update(id: string, data: Prisma.KpiSurveyUpdateInput) {
    return db.kpiSurvey.update({ where: { id }, data });
  },

  delete(id: string) {
    return db.kpiSurvey.delete({ where: { id } });
  },

  addQuestion(surveyId: string, data: Omit<Prisma.KpiSurveyQuestionUncheckedCreateInput, 'surveyId'>) {
    return db.kpiSurveyQuestion.create({ data: { ...data, surveyId } });
  },
  findQuestionInTenant(questionId: string, tenantId: string) {
    return db.kpiSurveyQuestion.findFirst({ where: { id: questionId, survey: { tenantId } }, select: { id: true } });
  },
  updateQuestion(id: string, data: Prisma.KpiSurveyQuestionUpdateInput) {
    return db.kpiSurveyQuestion.update({ where: { id }, data });
  },
  deleteQuestion(id: string) {
    return db.kpiSurveyQuestion.delete({ where: { id } });
  },

  /**
   * Lưu phản hồi ẩn danh + ghi sổ tham gia (chống ballot-stuffing) trong 1 transaction.
   * Hai bảng KHÔNG liên kết: response giữ answers (không userId), participation giữ
   * userId (không answers). Trùng (survey,cycle,user) → P2002 → service map 409.
   */
  createResponse(
    tenantId: string,
    surveyId: string,
    data: { cycleId: string | null; subjectEmployeeId: string | null; answers: Prisma.InputJsonValue; userId: string | null },
  ) {
    const { userId, ...response } = data;
    return db.$transaction(async (tx) => {
      if (userId) {
        await tx.kpiSurveyParticipation.create({ data: { tenantId, surveyId, cycleId: data.cycleId, userId } });
      }
      await tx.kpiSurveyResponse.create({ data: { tenantId, surveyId, ...response } });
    });
  },

  responsesForCycle(surveyId: string, cycleId: string, tenantId: string) {
    return db.kpiSurveyResponse.findMany({ where: { tenantId, surveyId, cycleId }, select: { answers: true } });
  },
};
