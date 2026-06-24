import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiResponse,
  CreateIssuingEntityRequest,
  IssuingEntityDto,
  UpdateIssuingEntityRequest,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

// SPEC-043: issuing entities are tenant master data behind the settings:* gate.
export const issuingEntityKeys = {
  all: ['issuing-entities'] as const,
  list: (activeOnly: boolean) => [...issuingEntityKeys.all, 'list', activeOnly] as const,
};

/**
 * List issuing entities for the current tenant.
 * @param activeOnly - true for the PR dropdown (hides soft-hidden entities);
 *                     false (default) for the management screen (shows all).
 */
export function useIssuingEntities(activeOnly = false) {
  return useQuery({
    queryKey: issuingEntityKeys.list(activeOnly),
    queryFn: async () => {
      const query = activeOnly ? '?activeOnly=1' : '';
      const res = await apiClient.get<ApiResponse<IssuingEntityDto[]>>(
        `/issuing-entities${query}`,
      );
      return res.data.data;
    },
  });
}

export function useCreateIssuingEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateIssuingEntityRequest) => {
      const res = await apiClient.post<ApiResponse<IssuingEntityDto>>('/issuing-entities', data);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: issuingEntityKeys.all }),
  });
}

export function useUpdateIssuingEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateIssuingEntityRequest }) => {
      const res = await apiClient.patch<ApiResponse<IssuingEntityDto>>(
        `/issuing-entities/${id}`,
        data,
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: issuingEntityKeys.all }),
  });
}

// Soft-hide (server sets active=false) — keeps PO snapshots of past requests intact.
export function useDeleteIssuingEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/issuing-entities/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: issuingEntityKeys.all }),
  });
}

export function useUploadIssuingEntityLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.post<ApiResponse<IssuingEntityDto>>(
        `/issuing-entities/${id}/logo`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: issuingEntityKeys.all }),
  });
}

export function useDeleteIssuingEntityLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/issuing-entities/${id}/logo`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: issuingEntityKeys.all }),
  });
}

/**
 * Fetch the logo image through the authenticated api-client (the GET /logo
 * endpoint needs the auth header, so a bare <img src> to the API path fails).
 * Returns an object URL the caller MUST revoke when done.
 */
export async function fetchIssuingEntityLogoUrl(id: string): Promise<string> {
  const res = await apiClient.get<Blob>(`/issuing-entities/${id}/logo`, {
    responseType: 'blob',
  });
  return URL.createObjectURL(res.data);
}
