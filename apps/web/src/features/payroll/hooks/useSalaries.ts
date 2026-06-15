import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  SalaryRosterEntryDto,
  EmployeeSalaryDto,
  CreateEmployeeSalaryRequest,
  SalaryListQuery,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { payrollKeys } from './usePayrollSettings';

export const salaryKeys = {
  roster: (query: SalaryListQuery) => [...payrollKeys.all, 'salaries', 'roster', query] as const,
  history: (employeeId: string) =>
    [...payrollKeys.all, 'salaries', 'history', employeeId] as const,
};

export function useSalaryRoster(query: SalaryListQuery) {
  return useQuery({
    queryKey: salaryKeys.roster(query),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<SalaryRosterEntryDto[]>>('/payroll/salaries', {
        params: query,
      });
      return res.data.data;
    },
  });
}

export function useEmployeeSalaries(employeeId: string | null) {
  return useQuery({
    queryKey: salaryKeys.history(employeeId ?? ''),
    enabled: !!employeeId,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<EmployeeSalaryDto[]>>(
        `/payroll/salaries/${employeeId}`,
      );
      return res.data.data;
    },
  });
}

export function useCreateSalary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateEmployeeSalaryRequest) => {
      const res = await apiClient.post<ApiResponse<EmployeeSalaryDto>>('/payroll/salaries', data);
      return res.data.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...payrollKeys.all, 'salaries'] });
      queryClient.invalidateQueries({ queryKey: salaryKeys.history(variables.employeeId) });
    },
  });
}

export function useDeleteSalary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/payroll/salaries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...payrollKeys.all, 'salaries'] });
    },
  });
}
