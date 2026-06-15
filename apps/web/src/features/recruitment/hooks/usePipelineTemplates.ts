import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  PipelineTemplateDto,
  CreatePipelineTemplateRequest,
  UpdatePipelineTemplateRequest,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const pipelineTemplateKeys = {
  all: ['pipeline-templates'] as const,
  lists: () => [...pipelineTemplateKeys.all, 'list'] as const,
  detail: (id: string) => [...pipelineTemplateKeys.all, 'detail', id] as const,
};

export function usePipelineTemplates() {
  return useQuery({
    queryKey: pipelineTemplateKeys.lists(),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<PipelineTemplateDto[]>>(
        '/recruitment/pipeline-templates'
      );
      return res.data.data;
    },
    staleTime: 30_000,
  });
}

export function useCreatePipelineTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreatePipelineTemplateRequest) => {
      const res = await apiClient.post<ApiResponse<PipelineTemplateDto>>(
        '/recruitment/pipeline-templates',
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineTemplateKeys.all });
    },
  });
}

export function useUpdatePipelineTemplate(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdatePipelineTemplateRequest) => {
      const res = await apiClient.patch<ApiResponse<PipelineTemplateDto>>(
        `/recruitment/pipeline-templates/${id}`,
        data
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineTemplateKeys.all });
    },
  });
}

export function useSetDefaultPipelineTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.patch<ApiResponse<PipelineTemplateDto>>(
        `/recruitment/pipeline-templates/${id}`,
        { isDefault: true }
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineTemplateKeys.all });
    },
  });
}

export function useDeletePipelineTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/recruitment/pipeline-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineTemplateKeys.all });
    },
  });
}
