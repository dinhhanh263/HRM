import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ContractDto,
  CreateContractInput,
  UpdateContractInput,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const contractKeys = {
  all: ['contracts'] as const,
  list: (employeeId: string) => [...contractKeys.all, 'list', employeeId] as const,
};

const base = (employeeId: string) => `/employees/${employeeId}/contracts`;

export function useContracts(employeeId: string) {
  return useQuery({
    queryKey: contractKeys.list(employeeId),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ContractDto[]>>(base(employeeId));
      return res.data.data;
    },
    enabled: !!employeeId,
  });
}

export function useCreateContract(employeeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateContractInput) => {
      const res = await apiClient.post<ApiResponse<ContractDto>>(base(employeeId), data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.list(employeeId) });
    },
  });
}

export function useUpdateContract(employeeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateContractInput }) => {
      const res = await apiClient.patch<ApiResponse<ContractDto>>(
        `${base(employeeId)}/${id}`,
        data,
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.list(employeeId) });
    },
  });
}

export function useEndContract(employeeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      endDate,
      status,
    }: {
      id: string;
      endDate: string;
      status?: 'EXPIRED' | 'TERMINATED';
    }) => {
      const res = await apiClient.post<ApiResponse<ContractDto>>(
        `${base(employeeId)}/${id}/end`,
        { endDate, status },
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.list(employeeId) });
    },
  });
}

export function useDeleteContract(employeeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`${base(employeeId)}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.list(employeeId) });
    },
  });
}
