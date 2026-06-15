import { useQuery } from '@tanstack/react-query';
import type { PositionDto, ApiResponse } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export function usePositions() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<PositionDto[]>>('/positions');
      return res.data.data;
    },
  });
}
