import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApiResponse,
  SalesCompanyDto,
  CreateCompanyRequest,
  UpdateCompanyRequest,
  ListCompaniesResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const companyKeys = {
  all: ['sales', 'companies'] as const,
  list: (search: string) => [...companyKeys.all, 'list', search] as const,
};

export function useCompanies(search = '', enabled = true) {
  return useQuery({
    queryKey: companyKeys.list(search),
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('search', search);
      const res = await apiClient.get<ApiResponse<ListCompaniesResponse>>(`/sales/companies?${params}`);
      return res.data.data;
    },
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateCompanyRequest) => {
      const res = await apiClient.post<ApiResponse<SalesCompanyDto>>('/sales/companies', body);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: companyKeys.all }),
  });
}

export function useUpdateCompany(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateCompanyRequest) => {
      const res = await apiClient.patch<ApiResponse<SalesCompanyDto>>(`/sales/companies/${id}`, body);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: companyKeys.all }),
  });
}
