import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  DepartmentDto,
  CreateDepartmentRequest,
  UpdateDepartmentRequest,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const departmentKeys = {
  all: ['departments'] as const,
  lists: () => [...departmentKeys.all, 'list'] as const,
  detail: (id: string) => [...departmentKeys.all, 'detail', id] as const,
};

export function useDepartments() {
  return useQuery({
    queryKey: departmentKeys.lists(),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<DepartmentDto[]>>('/departments');
      return res.data.data;
    },
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateDepartmentRequest) => {
      const res = await apiClient.post<ApiResponse<DepartmentDto>>('/departments', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: departmentKeys.all });
    },
  });
}

export function useUpdateDepartment(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateDepartmentRequest) => {
      const res = await apiClient.patch<ApiResponse<DepartmentDto>>(`/departments/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: departmentKeys.all });
    },
  });
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/departments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: departmentKeys.all });
    },
  });
}
