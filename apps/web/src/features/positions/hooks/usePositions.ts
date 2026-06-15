import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  PositionDto,
  CreatePositionRequest,
  UpdatePositionRequest,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const positionKeys = {
  all: ['positions'] as const,
  lists: () => [...positionKeys.all, 'list'] as const,
  detail: (id: string) => [...positionKeys.all, 'detail', id] as const,
};

export function usePositions() {
  return useQuery({
    queryKey: positionKeys.lists(),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<PositionDto[]>>('/positions');
      return res.data.data;
    },
  });
}

export function useCreatePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreatePositionRequest) => {
      const res = await apiClient.post<ApiResponse<PositionDto>>('/positions', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: positionKeys.all });
    },
  });
}

export function useUpdatePosition(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdatePositionRequest) => {
      const res = await apiClient.patch<ApiResponse<PositionDto>>(`/positions/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: positionKeys.all });
    },
  });
}

export function useDeletePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/positions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: positionKeys.all });
    },
  });
}
