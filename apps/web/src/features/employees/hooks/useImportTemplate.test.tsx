import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createHookWrapper } from '@/test/test-utils';
import { apiClient } from '@/lib/api-client';
import { useDownloadImportTemplate } from './useImportTemplate';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn() },
}));

const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

// jsdom lacks these blob/URL bits; stub just enough to assert the save path.
const clickSpy = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  clickSpy.mockClear();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickSpy);
});

describe('useDownloadImportTemplate', () => {
  it('requests a blob with default xlsx + vi params and saves it', async () => {
    mockGet.mockResolvedValue({
      data: new Blob(['x']),
      headers: { 'content-disposition': 'attachment; filename="mau-nhap-nhan-vien.xlsx"' },
    });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useDownloadImportTemplate(), { wrapper: Wrapper });

    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith('/employees/import/template', {
      params: { format: 'xlsx', lang: 'vi' },
      responseType: 'blob',
    });
    expect(clickSpy).toHaveBeenCalled();
    expect(result.current.data).toBe('mau-nhap-nhan-vien.xlsx');
  });

  it('passes csv + en through to the request params', async () => {
    mockGet.mockResolvedValue({ data: new Blob(['x']), headers: {} });
    const { Wrapper } = createHookWrapper();
    const { result } = renderHook(() => useDownloadImportTemplate(), { wrapper: Wrapper });

    result.current.mutate({ format: 'csv', lang: 'en' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockGet).toHaveBeenCalledWith('/employees/import/template', {
      params: { format: 'csv', lang: 'en' },
      responseType: 'blob',
    });
    // No Content-Disposition → falls back to a sensible default filename.
    expect(result.current.data).toBe('employee-import-template.csv');
  });
});
