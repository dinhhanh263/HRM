import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiResponse,
  CustomerDto,
  CreateCustomerRequest,
  UpdateCustomerRequest,
  ListCustomersQuery,
  ListCustomersResponse,
  SalesOwnerDto,
  CustomerLifecycle,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { saveBlob, filenameFromDisposition } from '@/lib/download';

export interface ImportResult {
  total: number;
  valid: number;
  created: number;
  skipped: { rowNumber: number; fullName: string; reason: string }[];
}

export const salesKeys = {
  all: ['sales'] as const,
  customers: (q: ListCustomersQuery) => [...salesKeys.all, 'customers', q] as const,
  customer: (id: string) => [...salesKeys.all, 'customer', id] as const,
};

export function useCustomers(query: ListCustomersQuery) {
  return useQuery({
    queryKey: salesKeys.customers(query),
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.set(k, String(v));
      });
      const res = await apiClient.get<ApiResponse<ListCustomersResponse>>(
        `/sales/customers?${params.toString()}`,
      );
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: salesKeys.customer(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<CustomerDto>>(`/sales/customers/${id}`);
      return res.data.data;
    },
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateCustomerRequest) => {
      const res = await apiClient.post<ApiResponse<CustomerDto>>('/sales/customers', body);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.all }),
  });
}

export function useUpdateCustomer(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateCustomerRequest) => {
      const res = await apiClient.patch<ApiResponse<CustomerDto>>(`/sales/customers/${id}`, body);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.all }),
  });
}

// ---- Ownership / assignment (Task 1.2) ----

export function useImportCustomers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, dryRun }: { file: File; dryRun: boolean }) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post<ApiResponse<ImportResult>>(
        `/sales/customers/import?dryRun=${dryRun ? '1' : '0'}`,
        fd,
      );
      return res.data.data;
    },
    onSuccess: (_data, vars) => {
      if (!vars.dryRun) qc.invalidateQueries({ queryKey: salesKeys.all });
    },
  });
}

export async function downloadImportTemplate(): Promise<void> {
  const res = await apiClient.get('/sales/customers/import/template', { responseType: 'blob' });
  const filename = filenameFromDisposition(res.headers['content-disposition'], 'customer-import-template.xlsx');
  saveBlob(res.data as Blob, filename);
}

export function useSalesOwners(enabled: boolean) {
  return useQuery({
    queryKey: [...salesKeys.all, 'owners'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<SalesOwnerDto[]>>('/sales/customers/owners');
      return res.data.data;
    },
  });
}

export function useClaimCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<ApiResponse<CustomerDto>>(`/sales/customers/${id}/claim`);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.all }),
  });
}

export function useAssignCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ownerId }: { id: string; ownerId: string | null }) => {
      const res = await apiClient.post<ApiResponse<CustomerDto>>(`/sales/customers/${id}/assign`, { ownerId });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.all }),
  });
}

export function useChangeLifecycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, lifecycleStatus, lostReason }: { id: string; lifecycleStatus: CustomerLifecycle; lostReason?: string }) => {
      const res = await apiClient.post<ApiResponse<CustomerDto>>(`/sales/customers/${id}/lifecycle`, {
        lifecycleStatus,
        lostReason,
      });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.all }),
  });
}

export function useBulkAssign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ customerIds, ownerId }: { customerIds: string[]; ownerId: string | null }) => {
      const res = await apiClient.post<ApiResponse<{ count: number }>>('/sales/customers/bulk-assign', {
        customerIds,
        ownerId,
      });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.all }),
  });
}
