import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createHookWrapper } from '@/test/test-utils';
import { apiClient } from '@/lib/api-client';
import {
  positionKeys,
  usePositions,
  useCreatePosition,
  useUpdatePosition,
  useDeletePosition,
} from './usePositions';

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

describe('positionKeys', () => {
  it('builds keys', () => {
    expect(positionKeys.all).toEqual(['positions']);
    expect(positionKeys.lists()).toEqual(['positions', 'list']);
    expect(positionKeys.detail('p1')).toEqual(['positions', 'detail', 'p1']);
  });
});

describe('usePositions', () => {
  it('lists positions', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [{ id: 'p1' }] } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => usePositions(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'p1' }]);
    expect(mockGet).toHaveBeenCalledWith('/positions');
  });
});

describe('position mutations', () => {
  it('create posts + invalidates', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: { id: 'p9' } } });
    const { Wrapper, queryClient } = createHookWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreatePosition(), { wrapper: Wrapper });
    result.current.mutate({ title: 'Dev' } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/positions', { title: 'Dev' });
    expect(spy).toHaveBeenCalledWith({ queryKey: positionKeys.all });
  });

  it('update patches by id', async () => {
    mockPatch.mockResolvedValue({ data: { success: true, data: { id: 'p1' } } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useUpdatePosition('p1'), { wrapper: Wrapper });
    result.current.mutate({ title: 'Lead' } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPatch).toHaveBeenCalledWith('/positions/p1', { title: 'Lead' });
  });

  it('delete calls the delete endpoint', async () => {
    mockDelete.mockResolvedValue({ data: {} });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useDeletePosition(), { wrapper: Wrapper });
    result.current.mutate('p1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDelete).toHaveBeenCalledWith('/positions/p1');
  });
});
