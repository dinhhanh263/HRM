import { apiClient } from '@/lib/api-client';
import type {
  ApiResponse,
  KpiFrameworkDto,
  KpiFrameworkListItemDto,
  KpiFrameworkValidationDto,
  UpsertKpiFrameworkInput,
  UpsertKpiPillarInput,
  UpsertKpiDefinitionInput,
  UpsertKpiWeightProfileInput,
  UpsertKpiRatingBandInput,
  TeamDto,
  UpsertTeamInput,
  KpiCycleDto,
  KpiCycleDetailDto,
  CreateKpiCycleInput,
  KpiCycleStatus,
  UpsertKpiEntryInput,
  KpiEmployeeHistoryDto,
  ReviewScorecardInput,
  KpiSurveyDto,
  CreateKpiSurveyInput,
  UpdateKpiSurveyInput,
  UpsertKpiSurveyQuestionInput,
  SubmitSurveyResponseInput,
  SurveyAggregateResultDto,
} from '@hrm/shared';

const base = '/kpi-frameworks';
const data = <T>(p: Promise<{ data: ApiResponse<T> }>) => p.then((r) => r.data.data);

export const kpiApi = {
  list: () => data<KpiFrameworkListItemDto[]>(apiClient.get(base)),
  get: (id: string) => data<KpiFrameworkDto>(apiClient.get(`${base}/${id}`)),
  validate: (id: string) => data<KpiFrameworkValidationDto>(apiClient.get(`${base}/${id}/validate`)),
  create: (body: UpsertKpiFrameworkInput) => data<KpiFrameworkDto>(apiClient.post(base, body)),
  update: (id: string, body: UpsertKpiFrameworkInput) => data<KpiFrameworkDto>(apiClient.patch(`${base}/${id}`, body)),
  remove: (id: string) => apiClient.delete(`${base}/${id}`),

  addPillar: (id: string, body: UpsertKpiPillarInput) => data<KpiFrameworkDto>(apiClient.post(`${base}/${id}/pillars`, body)),
  updatePillar: (id: string, pillarId: string, body: UpsertKpiPillarInput) =>
    data<KpiFrameworkDto>(apiClient.patch(`${base}/${id}/pillars/${pillarId}`, body)),
  removePillar: (id: string, pillarId: string) => data<KpiFrameworkDto>(apiClient.delete(`${base}/${id}/pillars/${pillarId}`)),

  addDefinition: (id: string, pillarId: string, body: UpsertKpiDefinitionInput) =>
    data<KpiFrameworkDto>(apiClient.post(`${base}/${id}/pillars/${pillarId}/definitions`, body)),
  updateDefinition: (id: string, defId: string, body: UpsertKpiDefinitionInput) =>
    data<KpiFrameworkDto>(apiClient.patch(`${base}/${id}/definitions/${defId}`, body)),
  removeDefinition: (id: string, defId: string) => data<KpiFrameworkDto>(apiClient.delete(`${base}/${id}/definitions/${defId}`)),

  addProfile: (id: string, body: UpsertKpiWeightProfileInput) => data<KpiFrameworkDto>(apiClient.post(`${base}/${id}/profiles`, body)),
  updateProfile: (id: string, profileId: string, body: UpsertKpiWeightProfileInput) =>
    data<KpiFrameworkDto>(apiClient.patch(`${base}/${id}/profiles/${profileId}`, body)),
  removeProfile: (id: string, profileId: string) => data<KpiFrameworkDto>(apiClient.delete(`${base}/${id}/profiles/${profileId}`)),

  addBand: (id: string, body: UpsertKpiRatingBandInput) => data<KpiFrameworkDto>(apiClient.post(`${base}/${id}/bands`, body)),
  updateBand: (id: string, bandId: string, body: UpsertKpiRatingBandInput) =>
    data<KpiFrameworkDto>(apiClient.patch(`${base}/${id}/bands/${bandId}`, body)),
  removeBand: (id: string, bandId: string) => data<KpiFrameworkDto>(apiClient.delete(`${base}/${id}/bands/${bandId}`)),

  setDepartments: (id: string, departmentIds: string[]) =>
    data<KpiFrameworkDto>(apiClient.put(`${base}/${id}/departments`, { departmentIds })),

  // Cycles
  cycles: () => data<KpiCycleDto[]>(apiClient.get('/kpi-cycles')),
  cycle: (id: string) => data<KpiCycleDetailDto>(apiClient.get(`/kpi-cycles/${id}`)),
  createCycle: (body: CreateKpiCycleInput) => data<KpiCycleDetailDto>(apiClient.post('/kpi-cycles', body)),
  transitionCycle: (id: string, status: KpiCycleStatus) =>
    data<KpiCycleDetailDto>(apiClient.post(`/kpi-cycles/${id}/transition`, { status })),
  upsertEntries: (id: string, entries: UpsertKpiEntryInput[]) =>
    data<KpiCycleDetailDto>(apiClient.put(`/kpi-cycles/${id}/entries`, { entries })),
  setScorecardProfile: (scorecardId: string, weightProfileId: string | null) =>
    data<KpiCycleDetailDto>(apiClient.put(`/kpi-cycles/scorecards/${scorecardId}/profile`, { weightProfileId })),
  myHistory: () => data<KpiEmployeeHistoryDto>(apiClient.get('/kpi-cycles/my-scorecards')),
  employeeHistory: (employeeId: string) =>
    data<KpiEmployeeHistoryDto>(apiClient.get(`/kpi-cycles/employee/${employeeId}/history`)),
  selfAssess: (scorecardId: string, selfComment: string) =>
    data<KpiCycleDetailDto>(apiClient.put(`/kpi-cycles/scorecards/${scorecardId}/self-assess`, { selfComment })),
  reviewScorecard: (scorecardId: string, body: ReviewScorecardInput) =>
    data<KpiCycleDetailDto>(apiClient.post(`/kpi-cycles/scorecards/${scorecardId}/review`, body)),
  resubmitScorecard: (scorecardId: string) =>
    data<KpiCycleDetailDto>(apiClient.post(`/kpi-cycles/scorecards/${scorecardId}/resubmit`, {})),

  aggregateSurveys: (cycleId: string) =>
    data<SurveyAggregateResultDto>(apiClient.post(`/kpi-cycles/${cycleId}/aggregate-surveys`, {})),
  exportCycle: (cycleId: string) =>
    apiClient.get<Blob>(`/kpi-cycles/${cycleId}/export`, { responseType: 'blob' }),

  // Surveys
  surveys: (frameworkId?: string) =>
    data<KpiSurveyDto[]>(apiClient.get('/kpi-surveys', { params: frameworkId ? { frameworkId } : {} })),
  activeSurveys: () => data<KpiSurveyDto[]>(apiClient.get('/kpi-surveys/active')),
  createSurvey: (body: CreateKpiSurveyInput) => data<KpiSurveyDto>(apiClient.post('/kpi-surveys', body)),
  updateSurvey: (id: string, body: UpdateKpiSurveyInput) => data<KpiSurveyDto>(apiClient.patch(`/kpi-surveys/${id}`, body)),
  removeSurvey: (id: string) => apiClient.delete(`/kpi-surveys/${id}`),
  addSurveyQuestion: (id: string, body: UpsertKpiSurveyQuestionInput) =>
    data<KpiSurveyDto>(apiClient.post(`/kpi-surveys/${id}/questions`, body)),
  removeSurveyQuestion: (id: string, questionId: string) =>
    data<KpiSurveyDto>(apiClient.delete(`/kpi-surveys/${id}/questions/${questionId}`)),
  respondSurvey: (id: string, body: SubmitSurveyResponseInput) =>
    apiClient.post(`/kpi-surveys/${id}/responses`, body),

  // Teams
  teams: () => data<TeamDto[]>(apiClient.get('/kpi-teams')),
  createTeam: (body: UpsertTeamInput) => data<TeamDto>(apiClient.post('/kpi-teams', body)),
  updateTeam: (id: string, body: UpsertTeamInput) => data<TeamDto>(apiClient.patch(`/kpi-teams/${id}`, body)),
  removeTeam: (id: string) => apiClient.delete(`/kpi-teams/${id}`),
};
