import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { KpiFrameworkDto } from '@hrm/shared';
import { kpiApi } from '../api';

export const kpiKeys = {
  all: ['kpi-frameworks'] as const,
  list: () => [...kpiKeys.all, 'list'] as const,
  detail: (id: string) => [...kpiKeys.all, 'detail', id] as const,
  validation: (id: string) => [...kpiKeys.all, 'validation', id] as const,
  teams: ['kpi-teams'] as const,
};

export function useKpiFrameworks() {
  return useQuery({ queryKey: kpiKeys.list(), queryFn: kpiApi.list });
}

export function useKpiFramework(id: string | undefined) {
  return useQuery({
    queryKey: kpiKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: () => kpiApi.get(id!),
  });
}

export function useKpiValidation(id: string | undefined) {
  return useQuery({
    queryKey: kpiKeys.validation(id ?? ''),
    enabled: !!id,
    queryFn: () => kpiApi.validate(id!),
  });
}

/**
 * Mọi mutation nested (pillar/KPI/profile/band/assignment) trả về framework DTO
 * đầy đủ → cache lại detail + refresh validation + list. Một hook gom mọi action.
 */
export function useKpiFrameworkMutations(frameworkId: string | undefined) {
  const qc = useQueryClient();

  const onFramework = (fw: KpiFrameworkDto) => {
    qc.setQueryData(kpiKeys.detail(fw.id), fw);
    qc.invalidateQueries({ queryKey: kpiKeys.validation(fw.id) });
    qc.invalidateQueries({ queryKey: kpiKeys.list() });
  };

  const id = frameworkId ?? '';

  return {
    createFramework: useMutation({
      mutationFn: kpiApi.create,
      onSuccess: (fw) => onFramework(fw),
    }),
    updateFramework: useMutation({
      mutationFn: (body: Parameters<typeof kpiApi.update>[1]) => kpiApi.update(id, body),
      onSuccess: onFramework,
    }),
    deleteFramework: useMutation({
      mutationFn: (fid: string) => kpiApi.remove(fid),
      onSuccess: () => qc.invalidateQueries({ queryKey: kpiKeys.list() }),
    }),

    addPillar: useMutation({ mutationFn: (b: Parameters<typeof kpiApi.addPillar>[1]) => kpiApi.addPillar(id, b), onSuccess: onFramework }),
    updatePillar: useMutation({ mutationFn: (v: { pillarId: string; body: Parameters<typeof kpiApi.updatePillar>[2] }) => kpiApi.updatePillar(id, v.pillarId, v.body), onSuccess: onFramework }),
    removePillar: useMutation({ mutationFn: (pillarId: string) => kpiApi.removePillar(id, pillarId), onSuccess: onFramework }),

    addDefinition: useMutation({ mutationFn: (v: { pillarId: string; body: Parameters<typeof kpiApi.addDefinition>[2] }) => kpiApi.addDefinition(id, v.pillarId, v.body), onSuccess: onFramework }),
    updateDefinition: useMutation({ mutationFn: (v: { defId: string; body: Parameters<typeof kpiApi.updateDefinition>[2] }) => kpiApi.updateDefinition(id, v.defId, v.body), onSuccess: onFramework }),
    removeDefinition: useMutation({ mutationFn: (defId: string) => kpiApi.removeDefinition(id, defId), onSuccess: onFramework }),

    addProfile: useMutation({ mutationFn: (b: Parameters<typeof kpiApi.addProfile>[1]) => kpiApi.addProfile(id, b), onSuccess: onFramework }),
    updateProfile: useMutation({ mutationFn: (v: { profileId: string; body: Parameters<typeof kpiApi.updateProfile>[2] }) => kpiApi.updateProfile(id, v.profileId, v.body), onSuccess: onFramework }),
    removeProfile: useMutation({ mutationFn: (profileId: string) => kpiApi.removeProfile(id, profileId), onSuccess: onFramework }),

    addBand: useMutation({ mutationFn: (b: Parameters<typeof kpiApi.addBand>[1]) => kpiApi.addBand(id, b), onSuccess: onFramework }),
    updateBand: useMutation({ mutationFn: (v: { bandId: string; body: Parameters<typeof kpiApi.updateBand>[2] }) => kpiApi.updateBand(id, v.bandId, v.body), onSuccess: onFramework }),
    removeBand: useMutation({ mutationFn: (bandId: string) => kpiApi.removeBand(id, bandId), onSuccess: onFramework }),

    setDepartments: useMutation({ mutationFn: (departmentIds: string[]) => kpiApi.setDepartments(id, departmentIds), onSuccess: onFramework }),
  };
}

// ── Cycles ────────────────────────────────────────────────────────────────
export const cycleKeys = {
  all: ['kpi-cycles'] as const,
  list: () => [...cycleKeys.all, 'list'] as const,
  detail: (id: string) => [...cycleKeys.all, 'detail', id] as const,
};

export function useKpiCycles() {
  return useQuery({ queryKey: cycleKeys.list(), queryFn: kpiApi.cycles });
}

export function useKpiCycle(id: string | undefined) {
  return useQuery({ queryKey: cycleKeys.detail(id ?? ''), enabled: !!id, queryFn: () => kpiApi.cycle(id!) });
}

export function useKpiCycleMutations(cycleId?: string) {
  const qc = useQueryClient();
  const onDetail = (d: { id: string }) => {
    qc.setQueryData(cycleKeys.detail(d.id), d);
    qc.invalidateQueries({ queryKey: cycleKeys.list() });
  };
  const id = cycleId ?? '';
  return {
    create: useMutation({ mutationFn: kpiApi.createCycle, onSuccess: onDetail }),
    transition: useMutation({ mutationFn: (status: Parameters<typeof kpiApi.transitionCycle>[1]) => kpiApi.transitionCycle(id, status), onSuccess: onDetail }),
    upsertEntries: useMutation({ mutationFn: (entries: Parameters<typeof kpiApi.upsertEntries>[1]) => kpiApi.upsertEntries(id, entries), onSuccess: onDetail }),
    setProfile: useMutation({ mutationFn: (v: { scorecardId: string; weightProfileId: string | null }) => kpiApi.setScorecardProfile(v.scorecardId, v.weightProfileId), onSuccess: onDetail }),
    review: useMutation({ mutationFn: (v: { scorecardId: string; body: Parameters<typeof kpiApi.reviewScorecard>[1] }) => kpiApi.reviewScorecard(v.scorecardId, v.body), onSuccess: onDetail }),
    resubmit: useMutation({ mutationFn: (scorecardId: string) => kpiApi.resubmitScorecard(scorecardId), onSuccess: onDetail }),
    aggregateSurveys: useMutation({
      mutationFn: () => kpiApi.aggregateSurveys(id),
      onSuccess: () => qc.invalidateQueries({ queryKey: cycleKeys.detail(id) }),
    }),
  };
}

// ── Surveys ─────────────────────────────────────────────────────────────────
export const surveyKeys = { all: ['kpi-surveys'] as const, active: ['kpi-surveys', 'active'] as const };

export function useKpiSurveys() {
  return useQuery({ queryKey: surveyKeys.all, queryFn: () => kpiApi.surveys() });
}
export function useActiveSurveys() {
  return useQuery({ queryKey: surveyKeys.active, queryFn: kpiApi.activeSurveys });
}
export function useKpiSurveyMutations() {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: surveyKeys.all });
  return {
    create: useMutation({ mutationFn: kpiApi.createSurvey, onSuccess: inval }),
    update: useMutation({ mutationFn: (v: { id: string; body: Parameters<typeof kpiApi.updateSurvey>[1] }) => kpiApi.updateSurvey(v.id, v.body), onSuccess: inval }),
    remove: useMutation({ mutationFn: (id: string) => kpiApi.removeSurvey(id), onSuccess: inval }),
    addQuestion: useMutation({ mutationFn: (v: { id: string; body: Parameters<typeof kpiApi.addSurveyQuestion>[1] }) => kpiApi.addSurveyQuestion(v.id, v.body), onSuccess: inval }),
    removeQuestion: useMutation({ mutationFn: (v: { id: string; questionId: string }) => kpiApi.removeSurveyQuestion(v.id, v.questionId), onSuccess: inval }),
  };
}
export function useRespondSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; body: Parameters<typeof kpiApi.respondSurvey>[1] }) => kpiApi.respondSurvey(v.id, v.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: surveyKeys.active }),
  });
}

export function useSelfAssess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scorecardId: string; selfComment: string }) => kpiApi.selfAssess(v.scorecardId, v.selfComment),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...cycleKeys.all, 'my-history'] }),
  });
}

export function useMyKpiHistory() {
  return useQuery({ queryKey: [...cycleKeys.all, 'my-history'], queryFn: kpiApi.myHistory });
}

export function useEmployeeKpiHistory(employeeId: string | undefined) {
  return useQuery({
    queryKey: [...cycleKeys.all, 'history', employeeId ?? ''],
    enabled: !!employeeId,
    queryFn: () => kpiApi.employeeHistory(employeeId!),
  });
}

// ── Teams ─────────────────────────────────────────────────────────────────
export function useKpiTeams() {
  return useQuery({ queryKey: kpiKeys.teams, queryFn: kpiApi.teams });
}

export function useKpiTeamMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: kpiKeys.teams });
  return {
    create: useMutation({ mutationFn: kpiApi.createTeam, onSuccess: invalidate }),
    update: useMutation({ mutationFn: (v: { id: string; body: Parameters<typeof kpiApi.updateTeam>[1] }) => kpiApi.updateTeam(v.id, v.body), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id: string) => kpiApi.removeTeam(id), onSuccess: invalidate }),
  };
}
