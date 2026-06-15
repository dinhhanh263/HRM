import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  InterviewDto,
  MyInterviewsDto,
  CreateInterviewRequest,
  UpdateInterviewStatusRequest,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const interviewKeys = {
  all: ['interviews'] as const,
  byApplication: (applicationId: string) =>
    [...interviewKeys.all, 'byApplication', applicationId] as const,
  mine: () => [...interviewKeys.all, 'mine'] as const,
};

export function useApplicationInterviews(applicationId: string | null) {
  return useQuery({
    queryKey: interviewKeys.byApplication(applicationId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<InterviewDto[]>>(
        `/recruitment/applications/${applicationId}/interviews`
      );
      return res.data.data;
    },
    enabled: !!applicationId,
  });
}

export function useMyInterviews() {
  return useQuery({
    queryKey: interviewKeys.mine(),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<MyInterviewsDto>>(
        '/recruitment/interviews/mine'
      );
      return res.data.data;
    },
  });
}

export function useCreateInterview(applicationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateInterviewRequest) => {
      const res = await apiClient.post<ApiResponse<InterviewDto>>(
        '/recruitment/interviews',
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.byApplication(applicationId) });
      queryClient.invalidateQueries({ queryKey: interviewKeys.mine() });
      // Scheduling logs an INTERVIEW_SCHEDULED activity onto the application feed.
      queryClient.invalidateQueries({ queryKey: ['applications', 'activities', applicationId] });
    },
  });
}

interface UpdateStatusVars extends UpdateInterviewStatusRequest {
  applicationId: string;
  interviewId: string;
}

export function useUpdateInterviewStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ applicationId, interviewId, status }: UpdateStatusVars) => {
      const res = await apiClient.patch<ApiResponse<InterviewDto>>(
        `/recruitment/applications/${applicationId}/interviews/${interviewId}/status`,
        { status }
      );
      return res.data.data;
    },
    onSuccess: (_data, { applicationId }) => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.byApplication(applicationId) });
      queryClient.invalidateQueries({ queryKey: interviewKeys.mine() });
    },
  });
}
