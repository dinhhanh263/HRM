import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AssetCategoryDto,
  CreateAssetCategoryInput,
  UpdateAssetCategoryInput,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const assetCategoryKeys = {
  all: ['asset-categories'] as const,
  lists: () => [...assetCategoryKeys.all, 'list'] as const,
};

export function useAssetCategories() {
  return useQuery({
    queryKey: assetCategoryKeys.lists(),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<AssetCategoryDto[]>>('/assets/categories');
      return res.data.data;
    },
  });
}

export function useCreateAssetCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAssetCategoryInput) => {
      const res = await apiClient.post<ApiResponse<AssetCategoryDto>>('/assets/categories', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetCategoryKeys.all });
    },
  });
}

export function useUpdateAssetCategory(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateAssetCategoryInput) => {
      const res = await apiClient.patch<ApiResponse<AssetCategoryDto>>(
        `/assets/categories/${id}`,
        data,
      );
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetCategoryKeys.all });
    },
  });
}

export function useDeleteAssetCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/assets/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetCategoryKeys.all });
    },
  });
}
