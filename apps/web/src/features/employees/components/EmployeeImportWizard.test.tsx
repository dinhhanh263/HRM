import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@/test/test-utils';
import type { ImportValidationSummary } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';
import { EmployeeImportWizard } from './EmployeeImportWizard';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

function makeSummary(over: Partial<ImportValidationSummary> = {}): ImportValidationSummary {
  return {
    importId: 'stage-1',
    totalRows: 3,
    validCount: 2,
    errorCount: 1,
    errors: [{ row: 2, column: 'email', code: 'IMPORT_INVALID_EMAIL', message: 'bad email' }],
    newDepartments: ['Engineering'],
    newPositions: [],
    ...over,
  };
}

function selectFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['fullName,email\nA,a@b.co'], 'employees.csv', { type: 'text/csv' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('EmployeeImportWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the wizard and shows the upload step', () => {
    render(<EmployeeImportWizard />);
    fireEvent.click(screen.getByRole('button', { name: /Nhập từ Excel/i }));

    expect(screen.getByText('Nhập nhân viên hàng loạt')).toBeInTheDocument();
    // Validate button is disabled until a file is picked.
    expect(screen.getByRole('button', { name: /Kiểm tra tệp/i })).toBeDisabled();
  });

  it('validates a chosen file and renders the review summary', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: makeSummary() } });

    render(<EmployeeImportWizard />);
    fireEvent.click(screen.getByRole('button', { name: /Nhập từ Excel/i }));

    selectFile();
    fireEvent.click(screen.getByRole('button', { name: /Kiểm tra tệp/i }));

    // Confirm button (review footer) carries the valid-row count.
    await screen.findByRole('button', { name: /Nhập 2 nhân viên/i });

    // Sent multipart to the validate endpoint with autoCreateOrgUnits flag.
    expect(mockPost).toHaveBeenCalledWith(
      '/employees/import/validate',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    );

    // The localized error code label appears in the error table.
    expect(screen.getByText('Email không hợp lệ')).toBeInTheDocument();
  });

  it('blocks the confirm action when there are no valid rows', async () => {
    mockPost.mockResolvedValue({
      data: {
        success: true,
        data: makeSummary({ importId: null, validCount: 0, errorCount: 3 }),
      },
    });

    render(<EmployeeImportWizard />);
    fireEvent.click(screen.getByRole('button', { name: /Nhập từ Excel/i }));
    selectFile();
    fireEvent.click(screen.getByRole('button', { name: /Kiểm tra tệp/i }));

    await waitFor(() =>
      expect(screen.getByText(/Không có dòng hợp lệ nào/i)).toBeInTheDocument(),
    );

    const confirm = screen.getByRole('button', { name: /Nhập 0 nhân viên/i });
    expect(confirm).toBeDisabled();
  });

  it('starts the import and shows progress after confirming', async () => {
    mockPost
      .mockResolvedValueOnce({ data: { success: true, data: makeSummary() } })
      .mockResolvedValueOnce({
        data: { success: true, data: { jobId: 'job-9', state: 'waiting', progress: null, result: null } },
      });
    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        success: true,
        data: { jobId: 'job-9', state: 'active', progress: { done: 1, total: 2 }, result: null },
      },
    });

    render(<EmployeeImportWizard />);
    fireEvent.click(screen.getByRole('button', { name: /Nhập từ Excel/i }));
    selectFile();
    fireEvent.click(screen.getByRole('button', { name: /Kiểm tra tệp/i }));

    const confirm = await screen.findByRole('button', { name: /Nhập 2 nhân viên/i });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(screen.getByText('Đang nhập dữ liệu')).toBeInTheDocument(),
    );
    expect(mockPost).toHaveBeenCalledWith('/employees/import', { importId: 'stage-1' });
  });

  it('downloads the xlsx template from the upload step', async () => {
    (apiClient.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: new Blob(['x']),
      headers: { 'content-disposition': 'attachment; filename="mau.xlsx"' },
    });
    // jsdom lacks blob URL helpers used by the save path.
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<EmployeeImportWizard />);
    fireEvent.click(screen.getByRole('button', { name: /Nhập từ Excel/i }));

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Tải mẫu Excel/i }));

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/employees/import/template', {
        params: { format: 'xlsx', lang: 'vi' },
        responseType: 'blob',
      }),
    );
  });
});
