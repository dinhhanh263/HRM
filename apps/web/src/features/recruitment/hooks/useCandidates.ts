import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CandidateDto,
  CandidateListItemDto,
  CandidateListParams,
  CreateCandidateRequest,
  UpdateCandidateRequest,
  ApiResponse,
  PaginatedResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const candidateKeys = {
  all: ['candidates'] as const,
  lists: () => [...candidateKeys.all, 'list'] as const,
  list: (params: CandidateListParams) => [...candidateKeys.lists(), params] as const,
  detail: (id: string) => [...candidateKeys.all, 'detail', id] as const,
};

export function useCandidates(params: CandidateListParams = {}) {
  return useQuery({
    queryKey: candidateKeys.list(params),
    queryFn: async () => {
      // Send skills as a single comma-joined param so it survives axios' default
      // array serialization and matches the API's parseSkills().
      const { skills, ...rest } = params;
      const query: Record<string, unknown> = { ...rest };
      if (skills?.length) query.skills = skills.join(',');
      const res = await apiClient.get<PaginatedResponse<CandidateListItemDto>>(
        '/recruitment/candidates',
        { params: query }
      );
      return res.data;
    },
    staleTime: 30_000,
  });
}

export function useCandidate(id: string) {
  return useQuery({
    queryKey: candidateKeys.detail(id),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<CandidateDto>>(`/recruitment/candidates/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateCandidate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateCandidateRequest) => {
      const res = await apiClient.post<ApiResponse<CandidateDto>>('/recruitment/candidates', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: candidateKeys.all });
    },
  });
}

export function useUpdateCandidate(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateCandidateRequest) => {
      const res = await apiClient.patch<ApiResponse<CandidateDto>>(
        `/recruitment/candidates/${id}`,
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: candidateKeys.all });
    },
  });
}
