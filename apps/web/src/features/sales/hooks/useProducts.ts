import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse, ProductDto, CreateProductRequest, UpdateProductRequest, ListProductsResponse } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { getApiErrorCode } from '@/lib/api-error';

export const productKeys = {
  all: ['sales', 'products'] as const,
  list: (s: string) => [...productKeys.all, 'list', s] as const,
};

export function useProducts(search = '', activeOnly = false) {
  return useQuery({
    queryKey: productKeys.list(`${search}|${activeOnly}`),
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('search', search);
      if (activeOnly) params.set('status', 'ACTIVE');
      const res = await apiClient.get<ApiResponse<ListProductsResponse>>(`/sales/products?${params}`);
      return res.data.data;
    },
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateProductRequest) => (await apiClient.post<ApiResponse<ProductDto>>('/sales/products', body)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}
export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateProductRequest) => (await apiClient.patch<ApiResponse<ProductDto>>(`/sales/products/${id}`, body)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}
export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await apiClient.delete(`/sales/products/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}
export const isProductInUse = (err: unknown) => getApiErrorCode(err) === 'PRODUCT_IN_USE';
