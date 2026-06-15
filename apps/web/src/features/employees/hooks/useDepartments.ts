import { useQuery } from '@tanstack/react-query';
import type { DepartmentDto, ApiResponse } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<DepartmentDto[]>>('/departments');
      return res.data.data;
    },
  });
}
