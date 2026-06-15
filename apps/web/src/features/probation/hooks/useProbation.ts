import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import type {
  ProbationSelfReviewDto,
  PatchProbationSelfInput,
  SubmitProbationSelfInput,
  ProbationCriteriaDto,
  CreateProbationCriteriaInput,
  UpdateProbationCriteriaInput,
  ProbationReviewDto,
  ProbationReviewListParams,
  CreateProbationReviewInput,
  PatchProbationReviewInput,
  SubmitProbationReviewInput,
  DecideProbationReviewInput,
  ProbationGuidelineDto,
  ProbationGuidelineLanguage,
  CreateProbationGuidelineInput,
  UpdateProbationGuidelineInput,
  ApiResponse,
  PaginatedResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const probationKeys = {
  all: ['probation'] as const,
  criteria: (activeOnly?: boolean) =>
    [...probationKeys.all, 'criteria', { activeOnly }] as const,
  reviews: (params?: ProbationReviewListParams) =>
    [...probationKeys.all, 'reviews', params ?? {}] as const,
  review: (id: string) => [...probationKeys.all, 'review', id] as const,
  guidelines: (year?: number, language?: string) =>
    [...probationKeys.all, 'guidelines', { year, language }] as const,
  myReview: () => [...probationKeys.all, 'my-review'] as const,
};

// ---- Criteria ----

export function useProbationCriteria(activeOnly?: boolean) {
  return useQuery({
    queryKey: probationKeys.criteria(activeOnly),
    queryFn: async () => {
      const qs = activeOnly ? '?activeOnly=true' : '';
      const res = await apiClient.get<ApiResponse<ProbationCriteriaDto[]>>(
        `/probation/criteria${qs}`
      );
      return res.data.data;
    },
  });
}

export function useCreateProbationCriteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateProbationCriteriaInput) => {
      const res = await apiClient.post<ApiResponse<ProbationCriteriaDto>>(
        '/probation/criteria',
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: probationKeys.all });
    },
  });
}

export function useUpdateProbationCriteria(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateProbationCriteriaInput) => {
      const res = await apiClient.patch<ApiResponse<ProbationCriteriaDto>>(
        `/probation/criteria/${id}`,
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: probationKeys.all });
    },
  });
}

export function useDeleteProbationCriteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/probation/criteria/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: probationKeys.all });
    },
  });
}

// ---- Reviews ----

export function useProbationReviews(params: ProbationReviewListParams = {}) {
  return useQuery({
    queryKey: probationKeys.reviews(params),
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params.status) qs.set('status', params.status);
      if (params.employeeId) qs.set('employeeId', params.employeeId);
      if (params.page) qs.set('page', String(params.page));
      if (params.limit) qs.set('limit', String(params.limit));
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const res = await apiClient.get<PaginatedResponse<ProbationReviewDto>>(
        `/probation/reviews${suffix}`
      );
      return res.data;
    },
  });
}

export function useProbationReview(id: string) {
  return useQuery({
    queryKey: probationKeys.review(id),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ProbationReviewDto>>(
        `/probation/reviews/${id}`
      );
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateProbationReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateProbationReviewInput) => {
      const res = await apiClient.post<ApiResponse<ProbationReviewDto>>(
        '/probation/reviews',
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: probationKeys.all });
    },
  });
}

export function usePatchProbationReview(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: PatchProbationReviewInput) => {
      const res = await apiClient.patch<ApiResponse<ProbationReviewDto>>(
        `/probation/reviews/${id}`,
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: probationKeys.all });
    },
  });
}

export function useSubmitProbationReview(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: SubmitProbationReviewInput) => {
      const res = await apiClient.post<ApiResponse<ProbationReviewDto>>(
        `/probation/reviews/${id}/submit`,
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: probationKeys.all });
    },
  });
}

export function useDecideProbationReview(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: DecideProbationReviewInput) => {
      const res = await apiClient.post<ApiResponse<ProbationReviewDto>>(
        `/probation/reviews/${id}/decide`,
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: probationKeys.all });
    },
  });
}

export function useCancelProbationReview(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ApiResponse<ProbationReviewDto>>(
        `/probation/reviews/${id}/cancel`
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: probationKeys.all });
    },
  });
}

// ---- Guidelines (SPEC-032) ----

export function useProbationGuidelines(year?: number, language?: ProbationGuidelineLanguage) {
  return useQuery({
    queryKey: probationKeys.guidelines(year, language),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (year !== undefined) params.set('year', String(year));
      if (language) params.set('language', language);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await apiClient.get<ApiResponse<ProbationGuidelineDto[]>>(
        `/probation/guidelines${qs}`
      );
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useCreateProbationGuideline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateProbationGuidelineInput) => {
      const res = await apiClient.post<ApiResponse<ProbationGuidelineDto>>(
        '/probation/guidelines',
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: probationKeys.all });
    },
  });
}

export function useUpdateProbationGuideline(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateProbationGuidelineInput) => {
      const res = await apiClient.patch<ApiResponse<ProbationGuidelineDto>>(
        `/probation/guidelines/${id}`,
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: probationKeys.all });
    },
  });
}

export function useDeleteProbationGuideline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/probation/guidelines/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: probationKeys.all });
    },
  });
}

// ---- Self Evaluation (SPEC-033) ----

// Review mở của chính user (Step 1). 404 = không thử việc / chưa có review → null
// (trang hiện empty state thay vì error).
export function useMyProbationReview() {
  return useQuery({
    queryKey: probationKeys.myReview(),
    queryFn: async (): Promise<ProbationSelfReviewDto | null> => {
      try {
        const res = await apiClient.get<ApiResponse<ProbationSelfReviewDto>>(
          '/probation/reviews/me'
        );
        return res.data.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) return null;
        throw error;
      }
    },
    staleTime: 30_000,
  });
}

export function usePatchProbationSelf(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: PatchProbationSelfInput) => {
      const res = await apiClient.patch<ApiResponse<ProbationSelfReviewDto>>(
        `/probation/reviews/${id}/self`,
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: probationKeys.all });
    },
  });
}

export function useSubmitProbationSelf(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: SubmitProbationSelfInput) => {
      const res = await apiClient.post<ApiResponse<ProbationSelfReviewDto>>(
        `/probation/reviews/${id}/self/submit`,
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: probationKeys.all });
    },
  });
}
