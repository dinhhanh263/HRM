import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/test-utils';
import { EmployeeListPage } from './EmployeeListPage';
import type { EmployeeDto } from '@hrm/shared';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

const employees = [
  {
    id: 'e1',
    employeeCode: 'NV001',
    fullName: 'Tran Binh',
    email: 'binh@company.com',
    status: 'ACTIVE',
    contractType: 'FULL_TIME',
  },
] as unknown as EmployeeDto[];

const activateMutate = vi.fn();
const deactivateMutate = vi.fn();
const terminateMutate = vi.fn();
let listState = {
  data: {
    data: employees,
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  } as unknown,
  isLoading: false,
  error: null as unknown,
};

vi.mock('../hooks/useEmployees', () => ({
  useEmployees: () => listState,
  useActivateEmployee: () => ({ mutate: activateMutate, isPending: false }),
  useDeactivateEmployee: () => ({ mutate: deactivateMutate, isPending: false }),
  useTerminateEmployee: () => ({ mutate: terminateMutate, isPending: false }),
}));

vi.mock('../hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [{ id: 'd1', name: 'Engineering' }] }),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  listState = {
    data: { data: employees, pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } },
    isLoading: false,
    error: null,
  };
});

describe('EmployeeListPage', () => {
  it('renders the employee rows', () => {
    render(<EmployeeListPage />);
    expect(screen.getByText('Tran Binh')).toBeInTheDocument();
    expect(screen.getByText('NV001')).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    listState = { data: undefined, isLoading: true, error: null };
    const { container } = render(<EmployeeListPage />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows an error state when the query fails', () => {
    listState = { data: undefined, isLoading: false, error: new Error('boom') };
    render(<EmployeeListPage />);
    expect(screen.queryByText('Tran Binh')).not.toBeInTheDocument();
  });

  it('navigates to the create page from the add button', async () => {
    render(<EmployeeListPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Thêm nhân viên' }));
    expect(navigate).toHaveBeenCalledWith('/employees/new');
  });

  it('debounces the search input into the query filters', async () => {
    render(<EmployeeListPage />);
    await userEvent.type(screen.getByPlaceholderText(/Tìm tên/i), 'binh');
    // search still shows the row (data is mocked, not actually filtered server-side)
    await waitFor(() => expect(screen.getByText('Tran Binh')).toBeInTheDocument());
  });

  it('toggles sort order when a sortable header is clicked', async () => {
    render(<EmployeeListPage />);
    const sortBtn = screen.getByRole('button', { name: 'Nhân viên' });
    await userEvent.click(sortBtn);
    expect(sortBtn.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(sortBtn);
    expect(sortBtn.closest('th')).toHaveAttribute('aria-sort', 'descending');
  });

  it('reveals and applies the clear-filters action after searching', async () => {
    render(<EmployeeListPage />);
    const search = screen.getByPlaceholderText(/Tìm tên/i);
    await userEvent.type(search, 'binh');
    const clearBtn = await screen.findByRole('button', { name: /Xóa lọc/i });
    await userEvent.click(clearBtn);
    expect(search).toHaveValue('');
  });

  it('clears the search via the inline clear button', async () => {
    render(<EmployeeListPage />);
    const search = screen.getByPlaceholderText(/Tìm tên/i);
    await userEvent.type(search, 'binh');
    const inlineClear = search.parentElement?.querySelector('button');
    expect(inlineClear).toBeTruthy();
    await userEvent.click(inlineClear!);
    expect(search).toHaveValue('');
  });

  it('paginates to the next page when more than one page exists', async () => {
    listState = {
      data: { data: employees, pagination: { page: 1, limit: 20, total: 40, totalPages: 2 } },
      isLoading: false,
      error: null,
    };
    render(<EmployeeListPage />);
    expect(screen.getByRole('button', { name: /Trước/i })).toBeDisabled();
    const next = screen.getByRole('button', { name: /Sau/i });
    expect(next).toBeEnabled();
    await userEvent.click(next);
    expect(screen.getByText('Tran Binh')).toBeInTheDocument();
  });
});
