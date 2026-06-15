import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createHookWrapper } from '@/test/test-utils';
import { apiClient } from '@/lib/api-client';
import {
  employeeKeys,
  useEmployees,
  useEmployee,
  useCreateEmployee,
  useUpdateEmployee,
  useActivateEmployee,
  useDeactivateEmployee,
  useTerminateEmployee,
} from './useEmployees';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockPatch = apiClient.patch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('employeeKeys', () => {
  it('builds hierarchical keys', () => {
    expect(employeeKeys.all).toEqual(['employees']);
    expect(employeeKeys.lists()).toEqual(['employees', 'list']);
    expect(employeeKeys.detail('e1')).toEqual(['employees', 'detail', 'e1']);
  });
});

describe('useEmployees', () => {
  it('encodes all filters into the query string', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [], pagination: {} } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(
      () =>
        useEmployees({
          page: 2,
          limit: 10,
          search: 'an',
          departmentId: 'd1',
          positionId: 'p1',
          status: 'ACTIVE',
          contractType: 'FULL_TIME',
          sort: 'fullName',
          order: 'asc',
        }),
      { wrapper: Wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = mockGet.mock.calls[0][0] as string;
    expect(url).toContain('page=2');
    expect(url).toContain('search=an');
    expect(url).toContain('departmentId=d1');
    expect(url).toContain('sort=fullName');
    expect(url).toContain('order=asc');
  });

  it('omits unset filters', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: [], pagination: {} } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useEmployees(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet.mock.calls[0][0]).toBe('/employees?');
  });
});

describe('useEmployee', () => {
  it('is disabled without an id', () => {
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useEmployee(''), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('fetches a single employee by id', async () => {
    mockGet.mockResolvedValue({ data: { success: true, data: { id: 'e1' } } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useEmployee('e1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 'e1' });
    expect(mockGet).toHaveBeenCalledWith('/employees/e1');
  });
});

describe('employee mutations', () => {
  it('useCreateEmployee posts and invalidates the list', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: { id: 'e9' } } });
    const { Wrapper, queryClient } = createHookWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateEmployee(), { wrapper: Wrapper });
    result.current.mutate({ fullName: 'New' } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith('/employees', { fullName: 'New' });
    expect(spy).toHaveBeenCalledWith({ queryKey: employeeKeys.lists() });
  });

  it('useUpdateEmployee patches and invalidates detail + list', async () => {
    mockPatch.mockResolvedValue({ data: { success: true, data: { id: 'e1' } } });
    const { Wrapper, queryClient } = createHookWrapper();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateEmployee('e1'), { wrapper: Wrapper });
    result.current.mutate({ fullName: 'Up' } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPatch).toHaveBeenCalledWith('/employees/e1', { fullName: 'Up' });
    expect(spy).toHaveBeenCalledWith({ queryKey: employeeKeys.detail('e1') });
  });

  it.each([
    ['useActivateEmployee', useActivateEmployee, 'activate'],
    ['useDeactivateEmployee', useDeactivateEmployee, 'deactivate'],
    ['useTerminateEmployee', useTerminateEmployee, 'terminate'],
  ] as const)('%s posts to the lifecycle endpoint', async (_name, hook, action) => {
    mockPost.mockResolvedValue({ data: { success: true, data: { id: 'e1' } } });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => hook(), { wrapper: Wrapper });
    result.current.mutate('e1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith(`/employees/e1/${action}`);
  });
});
