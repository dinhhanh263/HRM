import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  OvertimeRequestDto,
  OvertimeReviewResultDto,
  CreateOvertimeRequest,
  RejectOvertimeRequest,
  OvertimeStatus,
  ApprovalFlowDto,
  CreateApprovalFlowRequest,
  UpdateApprovalFlowRequest,
  ApprovalStepInput,
  ApiResponse,
  PaginatedResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { timesheetKeys } from './useTimesheetPolicy';

type ReviewScope = 'team' | 'all';

export interface OvertimeListParams {
  month?: string;
  status?: OvertimeStatus;
  page?: number;
  limit?: number;
}

export const overtimeKeys = {
  mine: (params: OvertimeListParams) => [...timesheetKeys.all, 'overtime', 'me', params] as const,
  review: (scope: ReviewScope, params: OvertimeListParams) =>
    [...timesheetKeys.all, 'overtime', 'review', scope, params] as const,
  detail: (id: string) => [...timesheetKeys.all, 'overtime', 'detail', id] as const,
};

export const overtimeFlowKeys = {
  all: [...timesheetKeys.all, 'overtime', 'flows'] as const,
  detail: (id: string) => [...timesheetKeys.all, 'overtime', 'flows', id] as const,
};

export function useMyOvertime(params: OvertimeListParams) {
  return useQuery({
    queryKey: overtimeKeys.mine(params),
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<OvertimeRequestDto>>('/timesheet/overtime/me', {
        params,
      });
      return res.data;
    },
  });
}

export function useSubmitOvertime() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateOvertimeRequest) => {
      const res = await apiClient.post<ApiResponse<OvertimeRequestDto>>('/timesheet/overtime', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...timesheetKeys.all, 'overtime'] });
    },
  });
}

export function useTeamOvertime(scope: ReviewScope, params: OvertimeListParams) {
  return useQuery({
    queryKey: overtimeKeys.review(scope, params),
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<OvertimeRequestDto>>('/timesheet/overtime', {
        params: { ...params, scope },
      });
      return res.data;
    },
  });
}

function useInvalidateOvertime() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [...timesheetKeys.all, 'overtime'] });
}

// Reviewer approves: returns the snapshotted request plus any advisory cap warnings.
export function useApproveOvertime() {
  const invalidate = useInvalidateOvertime();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<OvertimeReviewResultDto>>(
        `/timesheet/overtime/${id}/approve`,
      );
      return res.data.data;
    },
    onSuccess: invalidate,
  });
}

export function useRejectOvertime() {
  const invalidate = useInvalidateOvertime();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string } & RejectOvertimeRequest) => {
      const res = await apiClient.post<ApiResponse<OvertimeRequestDto>>(
        `/timesheet/overtime/${id}/reject`,
        { note },
      );
      return res.data.data;
    },
    onSuccess: invalidate,
  });
}

// Owner withdraws their own pending request.
export function useCancelOvertime() {
  const invalidate = useInvalidateOvertime();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<OvertimeRequestDto>>(
        `/timesheet/overtime/${id}/cancel`,
      );
      return res.data.data;
    },
    onSuccess: invalidate,
  });
}

// Single request with approval timeline (flowId/currentStep/approvals).
export function useOvertimeRequest(id: string) {
  return useQuery({
    queryKey: overtimeKeys.detail(id),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<OvertimeRequestDto>>(`/timesheet/overtime/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

// Owner resubmits a RETURNED request (re-validates + re-resolves flow, round+1).
export function useResubmitOvertime() {
  const invalidate = useInvalidateOvertime();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CreateOvertimeRequest }) => {
      const res = await apiClient.patch<ApiResponse<OvertimeRequestDto>>(
        `/timesheet/overtime/${id}/resubmit`,
        data,
      );
      return res.data.data;
    },
    onSuccess: invalidate,
  });
}

// ---- Overtime approval flow config (HR/Admin, timesheet:configure) ----
export function useOvertimeFlows() {
  return useQuery({
    queryKey: overtimeFlowKeys.all,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApprovalFlowDto[]>>('/timesheet/overtime/flows');
      return res.data.data;
    },
  });
}

export function useOvertimeFlow(id: string) {
  return useQuery({
    queryKey: overtimeFlowKeys.detail(id),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApprovalFlowDto>>(`/timesheet/overtime/flows/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

function useInvalidateOvertimeFlows() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: overtimeFlowKeys.all });
}

export function useCreateOvertimeFlow() {
  const invalidate = useInvalidateOvertimeFlows();
  return useMutation({
    mutationFn: async (data: CreateApprovalFlowRequest) => {
      const res = await apiClient.post<ApiResponse<ApprovalFlowDto>>(
        '/timesheet/overtime/flows',
        data,
      );
      return res.data.data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateOvertimeFlow(id: string) {
  const invalidate = useInvalidateOvertimeFlows();
  return useMutation({
    mutationFn: async (data: UpdateApprovalFlowRequest) => {
      const res = await apiClient.patch<ApiResponse<ApprovalFlowDto>>(
        `/timesheet/overtime/flows/${id}`,
        data,
      );
      return res.data.data;
    },
    onSuccess: invalidate,
  });
}

export function useReplaceOvertimeFlowSteps(id: string) {
  const invalidate = useInvalidateOvertimeFlows();
  return useMutation({
    mutationFn: async (steps: ApprovalStepInput[]) => {
      const res = await apiClient.put<ApiResponse<ApprovalFlowDto>>(
        `/timesheet/overtime/flows/${id}/steps`,
        { steps },
      );
      return res.data.data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteOvertimeFlow() {
  const invalidate = useInvalidateOvertimeFlows();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/timesheet/overtime/flows/${id}`);
    },
    onSuccess: invalidate,
  });
}
