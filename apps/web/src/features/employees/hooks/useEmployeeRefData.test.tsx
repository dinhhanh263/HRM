import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createHookWrapper } from '@/test/test-utils';
import { apiClient } from '@/lib/api-client';
import { useDepartments } from './useDepartments';
import { usePositions } from './usePositions';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn() },
}));

const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('employees ref-data hooks', () => {
  it('useDepartments fetches the department list', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [{ id: 'd1' }] } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useDepartments(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'd1' }]);
    expect(mockGet).toHaveBeenCalledWith('/departments');
  });

  it('usePositions fetches the position list', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [{ id: 'p1' }] } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => usePositions(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 'p1' }]);
    expect(mockGet).toHaveBeenCalledWith('/positions');
  });
});
