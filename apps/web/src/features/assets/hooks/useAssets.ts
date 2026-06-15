import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AssetDto,
  AssetDetailDto,
  AssetListParams,
  CreateAssetInput,
  UpdateAssetInput,
  AssignAssetInput,
  AcknowledgeHandoverInput,
  AssetAssignmentDto,
  ReturnAssetInput,
  CreateMaintenanceInput,
  CompleteMaintenanceInput,
  DisposeAssetInput,
  ApiResponse,
  PaginatedResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { filenameFromDisposition, saveBlob } from '@/lib/download';

export const assetKeys = {
  all: ['assets'] as const,
  lists: () => [...assetKeys.all, 'list'] as const,
  list: (params: AssetListParams) => [...assetKeys.lists(), params] as const,
  details: () => [...assetKeys.all, 'detail'] as const,
  detail: (id: string) => [...assetKeys.details(), id] as const,
  mine: () => [...assetKeys.all, 'mine'] as const,
};

export function useAssets(params: AssetListParams = {}) {
  return useQuery({
    queryKey: assetKeys.list(params),
    queryFn: async () => {
      const search = new URLSearchParams();
      if (params.page) search.set('page', String(params.page));
      if (params.limit) search.set('limit', String(params.limit));
      if (params.search) search.set('search', params.search);
      if (params.categoryId) search.set('categoryId', params.categoryId);
      if (params.status) search.set('status', params.status);
      if (params.assigneeId) search.set('assigneeId', params.assigneeId);
      if (params.sortBy) search.set('sortBy', params.sortBy);
      if (params.order) search.set('order', params.order);

      const res = await apiClient.get<PaginatedResponse<AssetDto>>(
        `/assets?${search.toString()}`,
      );
      return res.data;
    },
  });
}

// Export the current (filtered/sorted) asset list as a CSV download. Reuses the
// same query params as the table so "what you see" is "what you export".
export function useExportAssets() {
  return useMutation({
    mutationFn: async (params: AssetListParams = {}) => {
      const search = new URLSearchParams();
      if (params.search) search.set('search', params.search);
      if (params.categoryId) search.set('categoryId', params.categoryId);
      if (params.status) search.set('status', params.status);
      if (params.assigneeId) search.set('assigneeId', params.assigneeId);
      if (params.sortBy) search.set('sortBy', params.sortBy);
      if (params.order) search.set('order', params.order);

      const res = await apiClient.get(`/assets/export?${search.toString()}`, {
        responseType: 'blob',
      });
      const filename = filenameFromDisposition(
        res.headers['content-disposition'] as string | undefined,
        'assets.csv',
      );
      saveBlob(res.data as Blob, filename);
      return filename;
    },
  });
}

// Tải biên bản bàn giao (PDF) cho một phiếu bàn giao. Quyền do server gác:
// chủ phiếu hoặc người có assets:assign mới tải được.
export function useDownloadHandoverPdf() {
  return useMutation({
    mutationFn: async (vars: { assignmentId: string; assetCode: string }) => {
      const res = await apiClient.get(
        `/assets/assignments/${vars.assignmentId}/handover.pdf`,
        { responseType: 'blob' },
      );
      const filename = filenameFromDisposition(
        res.headers['content-disposition'] as string | undefined,
        `bien-ban-ban-giao-${vars.assetCode}.pdf`,
      );
      saveBlob(res.data as Blob, filename);
      return filename;
    },
  });
}

// Tải ảnh chữ ký (PNG) của một biên bản để xem trực tiếp. Quyền do server gác
// (chủ phiếu ∨ assets:assign). Trả Blob; component tự tạo/huỷ objectURL.
export function useHandoverSignature(assignmentId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [...assetKeys.all, 'signature', assignmentId] as const,
    enabled: enabled && !!assignmentId,
    staleTime: Infinity, // chữ ký bất biến sau khi đã ký
    queryFn: async () => {
      const res = await apiClient.get(`/assets/assignments/${assignmentId}/signature`, {
        responseType: 'blob',
      });
      return res.data as Blob;
    },
  });
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: assetKeys.detail(id),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<AssetDetailDto>>(`/assets/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

export function useCreateAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAssetInput) => {
      const res = await apiClient.post<ApiResponse<AssetDto>>('/assets', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
    },
  });
}

export function useUpdateAsset(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateAssetInput) => {
      const res = await apiClient.patch<ApiResponse<AssetDto>>(`/assets/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
    },
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/assets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
    },
  });
}

// Self-service: tài sản nhân viên đang giữ (assignment ACTIVE).
export function useMyAssets() {
  return useQuery({
    queryKey: assetKeys.mine(),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<AssetDto[]>>('/assets/mine');
      return res.data.data;
    },
  });
}

export function useAssignAsset(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: AssignAssetInput) => {
      const res = await apiClient.post<ApiResponse<AssetDetailDto>>(`/assets/${id}/assign`, data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assetKeys.mine() });
    },
  });
}

// Self-service: người nhận ký xác nhận một phiếu bàn giao đang chờ ký (IN_APP).
export function useAcknowledgeHandover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: { assignmentId: string } & AcknowledgeHandoverInput) => {
      const { assignmentId, ...body } = vars;
      const res = await apiClient.post<ApiResponse<AssetAssignmentDto>>(
        `/assets/assignments/${assignmentId}/acknowledge`,
        body,
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.mine() });
      queryClient.invalidateQueries({ queryKey: assetKeys.details() });
    },
  });
}

export function useReturnAsset(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ReturnAssetInput) => {
      const res = await apiClient.post<ApiResponse<AssetDetailDto>>(`/assets/${id}/return`, data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assetKeys.mine() });
    },
  });
}

export function useStartMaintenance(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateMaintenanceInput) => {
      const res = await apiClient.post<ApiResponse<AssetDetailDto>>(
        `/assets/${id}/maintenance`,
        data,
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
    },
  });
}

export function useCompleteMaintenance(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CompleteMaintenanceInput) => {
      const res = await apiClient.post<ApiResponse<AssetDetailDto>>(
        `/assets/${id}/maintenance/complete`,
        data,
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
    },
  });
}

export function useDisposeAsset(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: DisposeAssetInput) => {
      const res = await apiClient.post<ApiResponse<AssetDetailDto>>(`/assets/${id}/dispose`, data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
    },
  });
}
