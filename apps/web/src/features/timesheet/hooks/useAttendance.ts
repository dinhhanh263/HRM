import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AttendanceRecordDto,
  CheckInRequest,
  CheckOutRequest,
  AdjustAttendanceRequest,
  TimesheetSummaryDto,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { timesheetKeys } from './useTimesheetPolicy';

type ReviewScope = 'team' | 'all';

export const attendanceKeys = {
  mine: (month: string) => [...timesheetKeys.all, 'attendance', 'me', month] as const,
  review: (scope: ReviewScope, month: string) =>
    [...timesheetKeys.all, 'attendance', 'review', scope, month] as const,
  summary: (month: string, employeeId?: string) =>
    [...timesheetKeys.all, 'summary', month, employeeId ?? 'self'] as const,
};

export function useMyAttendance(month: string) {
  return useQuery({
    queryKey: attendanceKeys.mine(month),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<AttendanceRecordDto[]>>(
        '/timesheet/attendance/me',
        { params: { month } },
      );
      return res.data.data;
    },
  });
}

export function useCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CheckInRequest) => {
      const res = await apiClient.post<ApiResponse<AttendanceRecordDto>>(
        '/timesheet/attendance/check-in',
        data,
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...timesheetKeys.all, 'attendance'] });
    },
  });
}

export function useCheckOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CheckOutRequest) => {
      const res = await apiClient.post<ApiResponse<AttendanceRecordDto>>(
        '/timesheet/attendance/check-out',
        data,
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...timesheetKeys.all, 'attendance'] });
    },
  });
}

export function useTeamAttendance(scope: ReviewScope, month: string) {
  return useQuery({
    queryKey: attendanceKeys.review(scope, month),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<AttendanceRecordDto[]>>('/timesheet/attendance', {
        params: { scope, month },
      });
      return res.data.data;
    },
  });
}

/**
 * Payroll-grade month summary (the GET /timesheet/summary contract). Defaults
 * to the requester's own record; reviewers may pass a teammate's `employeeId`
 * — the server enforces the scope.
 */
export function useTimesheetSummary(month: string, employeeId?: string) {
  return useQuery({
    queryKey: attendanceKeys.summary(month, employeeId),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<TimesheetSummaryDto>>('/timesheet/summary', {
        params: { month, ...(employeeId ? { employeeId } : {}) },
      });
      return res.data.data;
    },
  });
}

export function useAdjustAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: AdjustAttendanceRequest) => {
      const res = await apiClient.post<ApiResponse<AttendanceRecordDto>>(
        '/timesheet/attendance/adjust',
        data,
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...timesheetKeys.all, 'attendance'] });
    },
  });
}
