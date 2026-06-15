import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createHookWrapper } from '@/test/test-utils';
import { apiClient } from '@/lib/api-client';
import {
  departmentKeys,
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
} from './useDepartments';

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

describe('departmentKeys', () => {
  it('builds keys', () => {
    expect(departmentKeys.all).toEqual(['departments']);
    expect(departmentKeys.lists()).toEqual(['departments', 'list']);
    expect(departmentKeys.detail('d1')).toEqual(['departments', 'detail', 'd1']);
  });
});

describe('useDepartments', () => {
  it('lists departments', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [{ id: 'd1' }] } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useDepartments(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'd1' }]);
    expect(mockGet).toHaveBeenCalledWith('/departments');
  });
});

describe('department mutations', () => {
  it('create posts + invalidates', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: { id: 'd9' } } });
    const { Wrapper, queryClient } = createHookWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateDepartment(), { wrapper: Wrapper });
    result.current.mutate({ name: 'IT' } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/departments', { name: 'IT' });
    expect(spy).toHaveBeenCalledWith({ queryKey: departmentKeys.all });
  });

  it('update patches by id', async () => {
    mockPatch.mockResolvedValue({ data: { success: true, data: { id: 'd1' } } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useUpdateDepartment('d1'), { wrapper: Wrapper });
    result.current.mutate({ name: 'HR' } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPatch).toHaveBeenCalledWith('/departments/d1', { name: 'HR' });
  });

  it('delete calls the delete endpoint', async () => {
    mockDelete.mockResolvedValue({ data: {} });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useDeleteDepartment(), { wrapper: Wrapper });
    result.current.mutate('d1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDelete).toHaveBeenCalledWith('/departments/d1');
  });
});
