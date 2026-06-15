import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  LeaveTypeDto,
  LeaveRequestDto,
  LeaveBalanceDto,
  CreateLeaveTypeRequest,
  UpdateLeaveTypeRequest,
  CreateLeaveRequestRequest,
  RejectLeaveRequestRequest,
  LeaveRequestListQuery,
  SetLeaveBalanceRequest,
  LeaveBalanceRosterResponse,
  ApiResponse,
  PaginatedResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { saveBlob, filenameFromDisposition } from '@/lib/download';

export interface LeaveRosterQuery {
  year: number;
  departmentId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const leaveKeys = {
  all: ['leave'] as const,
  types: (activeOnly?: boolean) => [...leaveKeys.all, 'types', { activeOnly }] as const,
  balances: (year: number, employeeId?: string) =>
    [...leaveKeys.all, 'balances', { year, employeeId }] as const,
  roster: (query: LeaveRosterQuery) => [...leaveKeys.all, 'roster', query] as const,
  requests: (filters: LeaveRequestListQuery) =>
    [...leaveKeys.all, 'requests', filters] as const,
  request: (id: string) => [...leaveKeys.all, 'request', id] as const,
};

// ---- Leave types ----

export function useLeaveTypes(activeOnly?: boolean) {
  return useQuery({
    queryKey: leaveKeys.types(activeOnly),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeOnly) params.set('activeOnly', 'true');
      const qs = params.toString();
      const res = await apiClient.get<ApiResponse<LeaveTypeDto[]>>(
        `/leave/types${qs ? `?${qs}` : ''}`
      );
      return res.data.data;
    },
  });
}

export function useCreateLeaveType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateLeaveTypeRequest) => {
      const res = await apiClient.post<ApiResponse<LeaveTypeDto>>('/leave/types', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leaveKeys.all });
    },
  });
}

export function useUpdateLeaveType(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateLeaveTypeRequest) => {
      const res = await apiClient.patch<ApiResponse<LeaveTypeDto>>(`/leave/types/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leaveKeys.all });
    },
  });
}

export function useDeleteLeaveType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/leave/types/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leaveKeys.all });
    },
  });
}

// ---- Balances ----

export function useLeaveBalances(year: number, employeeId?: string) {
  return useQuery({
    queryKey: leaveKeys.balances(year, employeeId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('year', String(year));
      if (employeeId) params.set('employeeId', employeeId);
      const res = await apiClient.get<ApiResponse<LeaveBalanceDto[]>>(
        `/leave/balances?${params.toString()}`
      );
      return res.data.data;
    },
  });
}

/**
 * Company-wide / team leave balance roster (GET /balances/roster): one row per
 * active employee, columns = active leave types. Row-level scope and access are
 * enforced server-side (HR = whole tenant, MANAGER = team, others = 403).
 */
export function useLeaveBalanceRoster(query: LeaveRosterQuery, enabled = true) {
  return useQuery({
    queryKey: leaveKeys.roster(query),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('year', String(query.year));
      if (query.departmentId) params.set('departmentId', query.departmentId);
      if (query.search) params.set('search', query.search);
      if (query.page) params.set('page', String(query.page));
      if (query.limit) params.set('limit', String(query.limit));
      const res = await apiClient.get<{ success: boolean } & LeaveBalanceRosterResponse>(
        `/leave/balances/roster?${params.toString()}`
      );
      return res.data;
    },
    enabled,
  });
}

/** Download the roster as an .xlsx, honouring the active filters (year /
 *  department / search). Streamed as a blob and saved client-side; returns a
 *  mutation so the page can show pending state and toast on error. */
export function useExportLeaveRoster() {
  return useMutation({
    mutationFn: async (query: Omit<LeaveRosterQuery, 'page' | 'limit'>) => {
      const params = new URLSearchParams();
      params.set('year', String(query.year));
      if (query.departmentId) params.set('departmentId', query.departmentId);
      if (query.search) params.set('search', query.search);
      const res = await apiClient.get(`/leave/balances/roster/export?${params.toString()}`, {
        responseType: 'blob',
      });
      const filename = filenameFromDisposition(
        res.headers['content-disposition'] as string | undefined,
        `leave-balances-${query.year}.xlsx`,
      );
      saveBlob(res.data as Blob, filename);
      return filename;
    },
  });
}

/** HR sets a per-employee allocation override (PUT /balances). Returns the
 *  employee's recomputed balances for the year. */
export function useSetLeaveBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: SetLeaveBalanceRequest) => {
      const res = await apiClient.put<ApiResponse<LeaveBalanceDto[]>>('/leave/balances', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leaveKeys.all });
    },
  });
}

// ---- Requests ----

export function useLeaveRequests(filters: LeaveRequestListQuery = {}) {
  return useQuery({
    queryKey: leaveKeys.requests(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));
      if (filters.scope) params.set('scope', filters.scope);
      if (filters.status) params.set('status', filters.status);
      if (filters.leaveTypeId) params.set('leaveTypeId', filters.leaveTypeId);
      if (filters.year) params.set('year', String(filters.year));
      if (filters.search) params.set('search', filters.search);
      const res = await apiClient.get<PaginatedResponse<LeaveRequestDto>>(
        `/leave/requests?${params.toString()}`
      );
      return res.data;
    },
  });
}

/** Single request with its approval timeline (GET /requests/:id). */
export function useLeaveRequest(id: string | null) {
  return useQuery({
    queryKey: leaveKeys.request(id ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<LeaveRequestDto>>(`/leave/requests/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateLeaveRequestRequest) => {
      const res = await apiClient.post<ApiResponse<LeaveRequestDto>>('/leave/requests', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leaveKeys.all });
    },
  });
}

/** Resubmit a RETURNED request after the owner edits it (POST /requests/:id/resubmit). */
export function useResubmitLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CreateLeaveRequestRequest }) => {
      const res = await apiClient.post<ApiResponse<LeaveRequestDto>>(
        `/leave/requests/${id}/resubmit`,
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leaveKeys.all });
    },
  });
}

export function useCancelLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<LeaveRequestDto>>(
        `/leave/requests/${id}/cancel`
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leaveKeys.all });
    },
  });
}

export function useApproveLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<LeaveRequestDto>>(
        `/leave/requests/${id}/approve`
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leaveKeys.all });
    },
  });
}

export function useRejectLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string } & RejectLeaveRequestRequest) => {
      const res = await apiClient.post<ApiResponse<LeaveRequestDto>>(
        `/leave/requests/${id}/reject`,
        { note }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leaveKeys.all });
    },
  });
}
