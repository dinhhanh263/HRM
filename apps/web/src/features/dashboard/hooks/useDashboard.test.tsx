import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createHookWrapper } from '@/test/test-utils';
import { apiClient } from '@/lib/api-client';
import { dashboardKeys, useDashboard } from './useDashboard';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn() },
}));

const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dashboardKeys', () => {
  it('builds keys', () => {
    expect(dashboardKeys.all).toEqual(['dashboard']);
  });
});

describe('useDashboard', () => {
  it('fetches the aggregate dashboard payload', async () => {
    const payload = {
      role: 'HR_MANAGER',
      stats: {
        totalActive: 3,
        onLeaveToday: 1,
        pendingApprovals: 1,
        newHiresThisMonth: 1,
        terminatedThisMonth: 1,
        departmentCount: 2,
      },
      pendingLeave: [],
      upcomingEvents: [],
    };
    mockGet.mockResolvedValue({ data: { success: true, data: payload } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useDashboard(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
    expect(mockGet).toHaveBeenCalledWith('/dashboard');
  });
});
