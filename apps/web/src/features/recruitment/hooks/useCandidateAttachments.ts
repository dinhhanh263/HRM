import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CandidateAttachmentDto, ApiResponse } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { candidateKeys } from './useCandidates';

export const attachmentKeys = {
  list: (candidateId: string) =>
    [...candidateKeys.detail(candidateId), 'attachments'] as const,
};

export function useCandidateAttachments(candidateId: string) {
  return useQuery({
    queryKey: attachmentKeys.list(candidateId),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<CandidateAttachmentDto[]>>(
        `/recruitment/candidates/${candidateId}/attachments`
      );
      return res.data.data;
    },
    enabled: !!candidateId,
    // Parsing runs in a background worker. Poll while any attachment is still
    // PENDING/PROCESSING so the UI flips to DONE/FAILED on its own.
    refetchInterval: (query) => {
      const rows = query.state.data;
      const inFlight = rows?.some(
        (a) => a.parseStatus === 'PENDING' || a.parseStatus === 'PROCESSING'
      );
      return inFlight ? 2000 : false;
    },
  });
}

export function useReparseCv(candidateId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (attachmentId: string) => {
      const res = await apiClient.post<ApiResponse<CandidateAttachmentDto>>(
        `/recruitment/candidates/${candidateId}/attachments/${attachmentId}/parse`
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attachmentKeys.list(candidateId) });
    },
  });
}

export function useUploadCv(candidateId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await apiClient.post<ApiResponse<CandidateAttachmentDto>>(
        `/recruitment/candidates/${candidateId}/attachments`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attachmentKeys.list(candidateId) });
      // rawCvText changes on the candidate, so refresh the detail too.
      queryClient.invalidateQueries({ queryKey: candidateKeys.detail(candidateId) });
    },
  });
}

/**
 * Download an attachment through the authenticated API (the stored fileUrl is
 * not publicly served), then trigger a browser save with the original name.
 */
export async function downloadAttachment(
  candidateId: string,
  attachment: CandidateAttachmentDto
): Promise<void> {
  const res = await apiClient.get<Blob>(
    `/recruitment/candidates/${candidateId}/attachments/${attachment.id}/download`,
    { responseType: 'blob' }
  );
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
