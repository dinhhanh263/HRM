import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ApprovalFlowDto,
  CreateApprovalFlowRequest,
  UpdateApprovalFlowRequest,
  ApprovalStepInput,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const approvalFlowKeys = {
  all: ['approval-flows'] as const,
  lists: () => [...approvalFlowKeys.all, 'list'] as const,
  detail: (id: string) => [...approvalFlowKeys.all, 'detail', id] as const,
};

export function useApprovalFlows() {
  return useQuery({
    queryKey: approvalFlowKeys.lists(),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApprovalFlowDto[]>>('/leave/flows');
      return res.data.data;
    },
  });
}

export function useApprovalFlow(id: string) {
  return useQuery({
    queryKey: approvalFlowKeys.detail(id),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApprovalFlowDto>>(`/leave/flows/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateApprovalFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateApprovalFlowRequest) => {
      const res = await apiClient.post<ApiResponse<ApprovalFlowDto>>('/leave/flows', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalFlowKeys.all });
    },
  });
}

export function useUpdateApprovalFlow(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateApprovalFlowRequest) => {
      const res = await apiClient.patch<ApiResponse<ApprovalFlowDto>>(`/leave/flows/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalFlowKeys.all });
    },
  });
}

export function useReplaceApprovalSteps(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (steps: ApprovalStepInput[]) => {
      const res = await apiClient.put<ApiResponse<ApprovalFlowDto>>(`/leave/flows/${id}/steps`, {
        steps,
      });
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalFlowKeys.all });
    },
  });
}

export function useDeleteApprovalFlow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/leave/flows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalFlowKeys.all });
    },
  });
}
