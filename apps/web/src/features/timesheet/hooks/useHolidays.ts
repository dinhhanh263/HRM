import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  HolidayDto,
  CreateHolidayRequest,
  UpdateHolidayRequest,
  SeedHolidaysRequest,
  SeedHolidaysResult,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { timesheetKeys } from './useTimesheetPolicy';

export const holidayKeys = {
  list: (year: number) => [...timesheetKeys.all, 'holidays', year] as const,
};

export function useHolidays(year: number) {
  return useQuery({
    queryKey: holidayKeys.list(year),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<HolidayDto[]>>('/timesheet/holidays', {
        params: { year },
      });
      return res.data.data;
    },
  });
}

export function useCreateHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateHolidayRequest) => {
      const res = await apiClient.post<ApiResponse<HolidayDto>>('/timesheet/holidays', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...timesheetKeys.all, 'holidays'] });
    },
  });
}

export function useUpdateHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateHolidayRequest }) => {
      const res = await apiClient.patch<ApiResponse<HolidayDto>>(`/timesheet/holidays/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...timesheetKeys.all, 'holidays'] });
    },
  });
}

export function useSeedHolidays() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: SeedHolidaysRequest) => {
      const res = await apiClient.post<ApiResponse<SeedHolidaysResult>>(
        '/timesheet/holidays/seed',
        data,
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...timesheetKeys.all, 'holidays'] });
    },
  });
}

export function useDeleteHoliday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/timesheet/holidays/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...timesheetKeys.all, 'holidays'] });
    },
  });
}
