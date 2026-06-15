import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  RoleDto,
  RoleListItemDto,
  PermissionCatalogGroup,
  CreateRoleInput,
  UpdateRoleInput,
  ApiResponse,
} from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export const roleKeys = {
  all: ['roles'] as const,
  lists: () => [...roleKeys.all, 'list'] as const,
  detail: (id: string) => [...roleKeys.all, 'detail', id] as const,
};

export const permissionKeys = {
  all: ['permissions'] as const,
  catalog: () => [...permissionKeys.all, 'catalog'] as const,
};

export function usePermissionsCatalog() {
  return useQuery({
    queryKey: permissionKeys.catalog(),
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<PermissionCatalogGroup[]>>('/permissions');
      return res.data.data;
    },
    staleTime: Infinity, // catalog is static for the session
  });
}

export function useRoles(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: roleKeys.lists(),
    // Listing roles needs `roles:view` (SUPER_ADMIN only). Callers that merely
    // gate UI on role-assignment rights pass `enabled: false` for other users to
    // avoid a background 403.
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<RoleListItemDto[]>>('/roles');
      return res.data.data;
    },
  });
}

export function useRole(id: string | undefined) {
  return useQuery({
    queryKey: roleKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<RoleDto>>(`/roles/${id}`);
      return res.data.data;
    },
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateRoleInput) => {
      const res = await apiClient.post<ApiResponse<RoleDto>>('/roles', data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.all });
    },
  });
}

export function useUpdateRole(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateRoleInput) => {
      const res = await apiClient.patch<ApiResponse<RoleDto>>(`/roles/${id}`, data);
      return res.data.data;
    },
    onSuccess: (role) => {
      queryClient.invalidateQueries({ queryKey: roleKeys.all });
      queryClient.setQueryData(roleKeys.detail(role.id), role);
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/roles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleKeys.all });
    },
  });
}
