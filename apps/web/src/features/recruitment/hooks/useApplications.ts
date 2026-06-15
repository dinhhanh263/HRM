import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ApplicationDto,
  ApplicationActivityDto,
  CreateApplicationRequest,
  CreateApplicationNoteRequest,
  MoveApplicationRequest,
  RejectApplicationRequest,
  HireApplicationRequest,
  WithdrawApplicationRequest,
  JobStageDto,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const applicationKeys = {
  all: ['applications'] as const,
  byCandidate: (candidateId: string) =>
    [...applicationKeys.all, 'byCandidate', candidateId] as const,
  byJob: (jobId: string) => [...applicationKeys.all, 'byJob', jobId] as const,
  detail: (applicationId: string) =>
    [...applicationKeys.all, 'detail', applicationId] as const,
  activities: (applicationId: string) =>
    [...applicationKeys.all, 'activities', applicationId] as const,
};

// One application with its candidate, job and current stage — backs the detail page.
export function useApplication(applicationId: string) {
  return useQuery({
    queryKey: applicationKeys.detail(applicationId),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApplicationDto>>(
        `/recruitment/applications/${applicationId}`
      );
      return res.data.data;
    },
    enabled: !!applicationId,
  });
}

export function useCandidateApplications(candidateId: string) {
  return useQuery({
    queryKey: applicationKeys.byCandidate(candidateId),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApplicationDto[]>>(
        `/recruitment/candidates/${candidateId}/applications`
      );
      return res.data.data;
    },
    enabled: !!candidateId,
  });
}

export function useJobApplications(jobId: string) {
  return useQuery({
    queryKey: applicationKeys.byJob(jobId),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApplicationDto[]>>(
        `/recruitment/jobs/${jobId}/applications`
      );
      return res.data.data;
    },
    enabled: !!jobId,
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateApplicationRequest) => {
      const res = await apiClient.post<ApiResponse<ApplicationDto>>(
        '/recruitment/applications',
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.all });
    },
  });
}

interface MoveApplicationVars extends MoveApplicationRequest {
  applicationId: string;
  // The destination stage, carried so the optimistic update can repaint the
  // card in its new column before the server confirms.
  toStage: JobStageDto;
}

// Moving a card on the board feels instant: we patch the job's application
// cache to the new stage immediately and roll back if the server rejects.
export function useMoveApplication(jobId: string) {
  const queryClient = useQueryClient();
  const key = applicationKeys.byJob(jobId);

  return useMutation({
    mutationFn: async ({ applicationId, toStageId, note, force }: MoveApplicationVars) => {
      const res = await apiClient.patch<ApiResponse<ApplicationDto>>(
        `/recruitment/applications/${applicationId}/move`,
        { toStageId, note, force }
      );
      return res.data.data;
    },
    onMutate: async ({ applicationId, toStageId, toStage }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ApplicationDto[]>(key);
      queryClient.setQueryData<ApplicationDto[]>(key, (old) =>
        old?.map((app) =>
          app.id === applicationId
            ? { ...app, currentStageId: toStageId, currentStage: toStage }
            : app
        )
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.all });
    },
  });
}

// A terminal disposition (reject/hire/withdraw) closes the application. The board
// only renders ACTIVE cards, so patching the status optimistically makes the card
// leave the funnel immediately; we roll back if the server rejects.
function useDisposeApplication<V extends { applicationId: string }>(
  jobId: string,
  request: (vars: V) => Promise<ApplicationDto>,
  patch: (app: ApplicationDto) => ApplicationDto
) {
  const queryClient = useQueryClient();
  const key = applicationKeys.byJob(jobId);

  return useMutation({
    mutationFn: request,
    onMutate: async (vars: V) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ApplicationDto[]>(key);
      queryClient.setQueryData<ApplicationDto[]>(key, (old) =>
        old?.map((app) => (app.id === vars.applicationId ? patch(app) : app))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.all });
    },
  });
}

interface RejectApplicationVars extends RejectApplicationRequest {
  applicationId: string;
}

export function useRejectApplication(jobId: string) {
  return useDisposeApplication<RejectApplicationVars>(
    jobId,
    async ({ applicationId, rejectionReason, note }) => {
      const res = await apiClient.patch<ApiResponse<ApplicationDto>>(
        `/recruitment/applications/${applicationId}/reject`,
        { rejectionReason, note }
      );
      return res.data.data;
    },
    (app) => ({ ...app, status: 'REJECTED' })
  );
}

interface HireApplicationVars extends HireApplicationRequest {
  applicationId: string;
}

export function useHireApplication(jobId: string) {
  return useDisposeApplication<HireApplicationVars>(
    jobId,
    async ({ applicationId, note }) => {
      const res = await apiClient.patch<ApiResponse<ApplicationDto>>(
        `/recruitment/applications/${applicationId}/hire`,
        { note }
      );
      return res.data.data;
    },
    (app) => ({ ...app, status: 'HIRED' })
  );
}

interface WithdrawApplicationVars extends WithdrawApplicationRequest {
  applicationId: string;
}

export function useWithdrawApplication(jobId: string) {
  return useDisposeApplication<WithdrawApplicationVars>(
    jobId,
    async ({ applicationId, note }) => {
      const res = await apiClient.patch<ApiResponse<ApplicationDto>>(
        `/recruitment/applications/${applicationId}/withdraw`,
        { note }
      );
      return res.data.data;
    },
    (app) => ({ ...app, status: 'WITHDRAWN' })
  );
}

// The activity feed of one application — notes plus system events, newest first.
export function useApplicationActivities(applicationId: string | null) {
  return useQuery({
    queryKey: applicationKeys.activities(applicationId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApplicationActivityDto[]>>(
        `/recruitment/applications/${applicationId}/activities`
      );
      return res.data.data;
    },
    enabled: !!applicationId,
  });
}

export function useCreateApplicationNote(applicationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateApplicationNoteRequest) => {
      const res = await apiClient.post<ApiResponse<ApplicationActivityDto>>(
        `/recruitment/applications/${applicationId}/notes`,
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.activities(applicationId) });
    },
  });
}
