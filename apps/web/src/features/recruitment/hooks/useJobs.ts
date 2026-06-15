import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  JobDto,
  JobListItemDto,
  JobListParams,
  CreateJobRequest,
  UpdateJobRequest,
  JobStatus,
  JobStageInput,
  HiringTeamMemberDto,
  HiringTeamRole,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const jobKeys = {
  all: ['jobs'] as const,
  lists: () => [...jobKeys.all, 'list'] as const,
  list: (params: JobListParams) => [...jobKeys.lists(), params] as const,
  detail: (id: string) => [...jobKeys.all, 'detail', id] as const,
};

export function useJobs(params: JobListParams = {}) {
  return useQuery({
    queryKey: jobKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<JobListItemDto[]>>('/recruitment/jobs', {
        params,
      });
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: jobKeys.detail(id),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<JobDto>>(`/recruitment/jobs/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateJobRequest) => {
      const res = await apiClient.post<ApiResponse<JobDto>>('/recruitment/jobs', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}

export function useUpdateJob(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateJobRequest) => {
      const res = await apiClient.patch<ApiResponse<JobDto>>(`/recruitment/jobs/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}

export function useChangeJobStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: JobStatus }) => {
      const res = await apiClient.patch<ApiResponse<JobDto>>(`/recruitment/jobs/${id}/status`, {
        status,
      });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}

export function useReorderJobStages(jobId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stages: JobStageInput[]) => {
      const res = await apiClient.put<ApiResponse<JobDto>>(
        `/recruitment/jobs/${jobId}/stages`,
        { stages }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all });
    },
  });
}

export function useAddHiringTeamMember(jobId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { employeeId: string; teamRole: HiringTeamRole }) => {
      const res = await apiClient.post<ApiResponse<HiringTeamMemberDto>>(
        `/recruitment/jobs/${jobId}/hiring-team`,
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
    },
  });
}

export function useUpdateHiringTeamMember(jobId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, teamRole }: { memberId: string; teamRole: HiringTeamRole }) => {
      const res = await apiClient.patch<ApiResponse<HiringTeamMemberDto>>(
        `/recruitment/jobs/${jobId}/hiring-team/${memberId}`,
        { teamRole }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
    },
  });
}

export function useRemoveHiringTeamMember(jobId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memberId: string) => {
      await apiClient.delete(`/recruitment/jobs/${jobId}/hiring-team/${memberId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
    },
  });
}
