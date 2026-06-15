import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/test-utils';
import { DepartmentListPage } from './DepartmentListPage';
import type { DepartmentDto } from '@hrm/shared';

const departments: DepartmentDto[] = [
  { id: 'd1', name: 'Engineering', description: 'Builds', employeeCount: 0 },
  { id: 'd2', name: 'Sales', description: null, employeeCount: 3 },
] as DepartmentDto[];

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
let listState = {
  data: departments as DepartmentDto[] | undefined,
  isLoading: false,
  error: null as unknown,
};

vi.mock('../hooks/useDepartments', () => ({
  useDepartments: () => listState,
  useCreateDepartment: () => ({ mutate: createMutate, isPending: false }),
  useUpdateDepartment: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteDepartment: () => ({ mutate: deleteMutate, isPending: false }),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  listState = { data: departments, isLoading: false, error: null };
});

describe('DepartmentListPage', () => {
  it('renders the department rows', () => {
    render(<DepartmentListPage />);
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    listState = { data: undefined, isLoading: true, error: null };
    const { container } = render(<DepartmentListPage />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows an error state when the query fails', () => {
    listState = { data: undefined, isLoading: false, error: new Error('boom') };
    render(<DepartmentListPage />);
    expect(screen.queryByText('Engineering')).not.toBeInTheDocument();
  });

  it('filters rows by the search input', async () => {
    render(<DepartmentListPage />);
    await userEvent.type(screen.getByPlaceholderText(/Tìm/i), 'sales');
    await waitFor(() => expect(screen.queryByText('Engineering')).not.toBeInTheDocument());
    expect(screen.getByText('Sales')).toBeInTheDocument();
  });

  it('opens the create sheet from the header button', async () => {
    render(<DepartmentListPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Thêm phòng ban' }));
    expect(screen.getByLabelText(/Tên phòng ban/i)).toBeInTheDocument();
  });

  it('calls the delete mutation after confirming for a department with no employees', async () => {
    render(<DepartmentListPage />);
    // First row menu trigger = Engineering (employeeCount 0)
    const menuTriggers = screen.getAllByLabelText('Hành động');
    await userEvent.click(menuTriggers[0]);
    await userEvent.click(await screen.findByText('Xóa'));
    const confirm = await screen.findByRole('button', { name: 'Xóa' });
    await userEvent.click(confirm);
    expect(deleteMutate).toHaveBeenCalled();
  });
});
