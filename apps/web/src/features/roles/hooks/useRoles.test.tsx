import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createHookWrapper } from '@/test/test-utils';
import { apiClient } from '@/lib/api-client';
import {
  roleKeys,
  permissionKeys,
  usePermissionsCatalog,
  useRoles,
  useRole,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
} from './useRoles';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockPatch = apiClient.patch as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('role + permission keys', () => {
  it('builds keys', () => {
    expect(roleKeys.all).toEqual(['roles']);
    expect(roleKeys.lists()).toEqual(['roles', 'list']);
    expect(roleKeys.detail('r1')).toEqual(['roles', 'detail', 'r1']);
    expect(permissionKeys.all).toEqual(['permissions']);
    expect(permissionKeys.catalog()).toEqual(['permissions', 'catalog']);
  });
});

describe('usePermissionsCatalog', () => {
  it('fetches the catalog', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [{ resource: 'employee' }] } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => usePermissionsCatalog(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ resource: 'employee' }]);
    expect(mockGet).toHaveBeenCalledWith('/permissions');
  });
});

describe('useRoles', () => {
  it('lists roles', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [{ id: 'r1' }] } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useRoles(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'r1' }]);
    expect(mockGet).toHaveBeenCalledWith('/roles');
  });
});

describe('useRole', () => {
  it('is disabled without an id', () => {
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useRole(undefined), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches a single role by id', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: { id: 'r1' } } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useRole('r1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 'r1' });
    expect(mockGet).toHaveBeenCalledWith('/roles/r1');
  });
});

describe('role mutations', () => {
  it('create posts + invalidates', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: { id: 'r9' } } });
    const { Wrapper, queryClient } = createHookWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateRole(), { wrapper: Wrapper });
    result.current.mutate({ name: 'Auditor' } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/roles', { name: 'Auditor' });
    expect(spy).toHaveBeenCalledWith({ queryKey: roleKeys.all });
  });

  it('update patches by id, invalidates + seeds the detail cache', async () => {
    mockPatch.mockResolvedValue({ data: { success: true, data: { id: 'r1', name: 'Updated' } } });
    const { Wrapper, queryClient } = createHookWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const setData = vi.spyOn(queryClient, 'setQueryData');
    const { result } = renderHook(() => useUpdateRole('r1'), { wrapper: Wrapper });
    result.current.mutate({ name: 'Updated' } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPatch).toHaveBeenCalledWith('/roles/r1', { name: 'Updated' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: roleKeys.all });
    expect(setData).toHaveBeenCalledWith(roleKeys.detail('r1'), { id: 'r1', name: 'Updated' });
  });

  it('delete calls the delete endpoint', async () => {
    mockDelete.mockResolvedValue({ data: {} });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useDeleteRole(), { wrapper: Wrapper });
    result.current.mutate('r1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDelete).toHaveBeenCalledWith('/roles/r1');
  });
});
