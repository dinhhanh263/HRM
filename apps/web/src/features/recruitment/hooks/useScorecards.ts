import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  InterviewScorecardsDto,
  ScorecardDto,
  ScorecardSummaryItemDto,
  SubmitScorecardRequest,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const scorecardKeys = {
  all: ['scorecards'] as const,
  byInterview: (interviewId: string) =>
    [...scorecardKeys.all, 'byInterview', interviewId] as const,
  summary: (applicationId: string) =>
    [...scorecardKeys.all, 'summary', applicationId] as const,
};

export function useInterviewScorecards(interviewId: string, enabled = true) {
  return useQuery({
    queryKey: scorecardKeys.byInterview(interviewId),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<InterviewScorecardsDto>>(
        `/recruitment/interviews/${interviewId}/scorecards`
      );
      return res.data.data;
    },
    enabled: enabled && !!interviewId,
  });
}

export function useSubmitScorecard(interviewId: string, applicationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SubmitScorecardRequest) => {
      const res = await apiClient.put<ApiResponse<ScorecardDto>>(
        `/recruitment/interviews/${interviewId}/scorecard`,
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      // Submitting unlocks peers (no-peek) and shifts the average, so refresh both.
      queryClient.invalidateQueries({ queryKey: scorecardKeys.byInterview(interviewId) });
      queryClient.invalidateQueries({ queryKey: scorecardKeys.summary(applicationId) });
      // Flip myScorecardSubmitted on the interviewer's own "PV của tôi" list.
      queryClient.invalidateQueries({ queryKey: ['interviews', 'mine'] });
    },
  });
}

export function useApplicationScorecardSummary(applicationId: string | null) {
  return useQuery({
    queryKey: scorecardKeys.summary(applicationId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ScorecardSummaryItemDto[]>>(
        `/recruitment/applications/${applicationId}/scorecard-summary`
      );
      return res.data.data;
    },
    enabled: !!applicationId,
  });
}
