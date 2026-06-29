import type {
  KpiSurveyDto, CreateKpiSurveyInput, UpdateKpiSurveyInput,
  UpsertKpiSurveyQuestionInput, SubmitSurveyResponseInput,
} from '@hrm/shared';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '../../shared/errors/AppError.js';
import { kpiSurveyRepository } from '../repositories/kpi-survey.repository.js';
import { kpiCycleRepository } from '../repositories/kpi-cycle.repository.js';

type SurveyRow = Awaited<ReturnType<typeof kpiSurveyRepository.findById>>;

function toDto(s: NonNullable<SurveyRow>, openCycleId: string | null = null): KpiSurveyDto {
  return {
    id: s.id, frameworkId: s.frameworkId, type: s.type, title: s.title,
    isAnonymous: s.isAnonymous, minResponses: s.minResponses, active: s.active,
    responseCount: s._count.responses, openCycleId,
    questions: s.questions.map((q) => ({
      id: q.id, code: q.code, text: q.text, scaleMin: q.scaleMin, scaleMax: q.scaleMax,
      mapsToKpiCode: q.mapsToKpiCode, order: q.order,
    })),
  };
}

async function loadSurvey(id: string, tenantId: string) {
  const s = await kpiSurveyRepository.findById(id, tenantId);
  if (!s) throw new NotFoundError('Survey not found');
  return s;
}

export const kpiSurveyService = {
  async list(tenantId: string, frameworkId?: string): Promise<KpiSurveyDto[]> {
    return (await kpiSurveyRepository.findAll(tenantId, frameworkId)).map((s) => toDto(s));
  },

  async listActive(tenantId: string): Promise<KpiSurveyDto[]> {
    const surveys = await kpiSurveyRepository.findActive(tenantId);
    return Promise.all(surveys.map(async (s) => {
      const open = s.frameworkId ? await kpiCycleRepository.findOpenCycleByFramework(tenantId, s.frameworkId) : null;
      return toDto(s, open?.id ?? null);
    }));
  },

  async create(tenantId: string, input: CreateKpiSurveyInput): Promise<KpiSurveyDto> {
    const s = await kpiSurveyRepository.create(tenantId, {
      frameworkId: input.frameworkId ?? null, type: input.type,
      title: input.title.trim(), minResponses: input.minResponses ?? 3,
    });
    return toDto(await loadSurvey(s.id, tenantId));
  },

  async update(id: string, tenantId: string, input: UpdateKpiSurveyInput): Promise<KpiSurveyDto> {
    await loadSurvey(id, tenantId);
    await kpiSurveyRepository.update(id, {
      title: input.title?.trim(), minResponses: input.minResponses, active: input.active,
    });
    return toDto(await loadSurvey(id, tenantId));
  },

  async remove(id: string, tenantId: string): Promise<void> {
    await loadSurvey(id, tenantId);
    await kpiSurveyRepository.delete(id);
  },

  async addQuestion(surveyId: string, tenantId: string, input: UpsertKpiSurveyQuestionInput): Promise<KpiSurveyDto> {
    await loadSurvey(surveyId, tenantId);
    await kpiSurveyRepository.addQuestion(surveyId, {
      code: input.code.trim(), text: input.text.trim(),
      scaleMin: input.scaleMin ?? 1, scaleMax: input.scaleMax ?? 10,
      mapsToKpiCode: input.mapsToKpiCode ?? null, order: input.order ?? 0,
    });
    return toDto(await loadSurvey(surveyId, tenantId));
  },

  async removeQuestion(surveyId: string, questionId: string, tenantId: string): Promise<KpiSurveyDto> {
    const q = await kpiSurveyRepository.findQuestionInTenant(questionId, tenantId);
    if (!q) throw new NotFoundError('Question not found');
    await kpiSurveyRepository.deleteQuestion(questionId);
    return toDto(await loadSurvey(surveyId, tenantId));
  },

  /**
   * Gửi phản hồi ẩn danh. Validate đáp án + thang điểm; KHÔNG lưu người trả lời ở
   * response. `userId` chỉ dùng cho sổ tham gia (chống trả lời nhiều lần). Validate
   * cycleId thuộc tenant + đúng framework + đang mở (chống bơm vào cycle chéo/đóng).
   */
  async respond(surveyId: string, tenantId: string, userId: string | null, input: SubmitSurveyResponseInput): Promise<void> {
    const survey = await loadSurvey(surveyId, tenantId);
    if (!survey.active) throw new ValidationError('Survey đã đóng');

    if (input.cycleId) {
      const cycle = await kpiCycleRepository.findById(input.cycleId, tenantId);
      if (!cycle) throw new ValidationError('Chu kỳ không hợp lệ');
      if (survey.frameworkId && cycle.frameworkId !== survey.frameworkId) throw new ValidationError('Chu kỳ không thuộc framework của survey');
      if (cycle.status !== 'DATA_ENTRY' && cycle.status !== 'SELF_ASSESSMENT') throw new ValidationError('Chu kỳ đã đóng nhập liệu');
    }

    const byCode = new Map(survey.questions.map((q) => [q.code, q]));
    for (const [code, value] of Object.entries(input.answers)) {
      const q = byCode.get(code);
      if (!q) throw new ValidationError(`Câu hỏi không hợp lệ: ${code}`);
      if (typeof value !== 'number' || value < q.scaleMin || value > q.scaleMax) {
        throw new ValidationError(`Điểm ngoài thang cho câu ${code}`);
      }
    }
    if (Object.keys(input.answers).length === 0) throw new ValidationError('Chưa có câu trả lời nào');

    try {
      await kpiSurveyRepository.createResponse(tenantId, surveyId, {
        cycleId: input.cycleId ?? null,
        subjectEmployeeId: input.subjectEmployeeId ?? null,
        answers: input.answers,
        userId,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('Bạn đã trả lời survey này cho kỳ hiện tại');
      }
      throw err;
    }
  },
};
