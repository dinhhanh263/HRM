import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  EmployeeDto,
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  EmployeeListQuery,
  ApiResponse,
  PaginatedResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const employeeKeys = {
  all: ['employees'] as const,
  lists: () => [...employeeKeys.all, 'list'] as const,
  list: (filters: EmployeeListQuery) => [...employeeKeys.lists(), filters] as const,
  details: () => [...employeeKeys.all, 'detail'] as const,
  detail: (id: string) => [...employeeKeys.details(), id] as const,
};

export function useEmployees(filters: EmployeeListQuery = {}) {
  return useQuery({
    queryKey: employeeKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));
      if (filters.search) params.set('search', filters.search);
      if (filters.departmentId) params.set('departmentId', filters.departmentId);
      if (filters.positionId) params.set('positionId', filters.positionId);
      if (filters.status) params.set('status', filters.status);
      if (filters.contractType) params.set('contractType', filters.contractType);
      if (filters.minLevel !== undefined) params.set('minLevel', String(filters.minLevel));
      if (filters.sort) params.set('sort', filters.sort);
      if (filters.order) params.set('order', filters.order);

      const res = await apiClient.get<PaginatedResponse<EmployeeDto>>(
        `/employees?${params.toString()}`
      );
      return res.data;
    },
  });
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: employeeKeys.detail(id),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<EmployeeDto>>(`/employees/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateEmployeeRequest) => {
      const res = await apiClient.post<ApiResponse<EmployeeDto>>('/employees', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
    },
  });
}

export function useUpdateEmployee(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateEmployeeRequest) => {
      const res = await apiClient.patch<ApiResponse<EmployeeDto>>(`/employees/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
    },
  });
}

export function useActivateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<EmployeeDto>>(`/employees/${id}/activate`);
      return res.data.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
    },
  });
}

export function useDeactivateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<EmployeeDto>>(`/employees/${id}/deactivate`);
      return res.data.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
    },
  });
}

export function useTerminateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<EmployeeDto>>(`/employees/${id}/terminate`);
      return res.data.data;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
    },
  });
}
