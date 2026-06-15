import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/test-utils';
import { PositionListPage } from './PositionListPage';
import type { PositionDto } from '@hrm/shared';

const positions = [
  { id: 'p1', name: 'Tech Lead', level: 4, department: { id: 'd1', name: 'Engineering' }, employeeCount: 0 },
  { id: 'p2', name: 'Sales Rep', level: 1, department: { id: 'd2', name: 'Sales' }, employeeCount: 2 },
] as unknown as PositionDto[];

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
let listState = {
  data: positions as PositionDto[] | undefined,
  isLoading: false,
  error: null as unknown,
};

vi.mock('../hooks/usePositions', () => ({
  usePositions: () => listState,
  useCreatePosition: () => ({ mutate: createMutate, isPending: false }),
  useUpdatePosition: () => ({ mutate: updateMutate, isPending: false }),
  useDeletePosition: () => ({ mutate: deleteMutate, isPending: false }),
}));

vi.mock('@/features/departments/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [{ id: 'd1', name: 'Engineering' }] }),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  listState = { data: positions, isLoading: false, error: null };
});

describe('PositionListPage', () => {
  it('renders the position rows', () => {
    render(<PositionListPage />);
    expect(screen.getByText('Tech Lead')).toBeInTheDocument();
    expect(screen.getByText('Sales Rep')).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    listState = { data: undefined, isLoading: true, error: null };
    const { container } = render(<PositionListPage />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows an error state when the query fails', () => {
    listState = { data: undefined, isLoading: false, error: new Error('boom') };
    render(<PositionListPage />);
    expect(screen.queryByText('Tech Lead')).not.toBeInTheDocument();
  });

  it('filters rows by the search input', async () => {
    render(<PositionListPage />);
    await userEvent.type(screen.getByPlaceholderText(/Tìm/i), 'sales rep');
    await waitFor(() => expect(screen.queryByText('Tech Lead')).not.toBeInTheDocument());
    expect(screen.getByText('Sales Rep')).toBeInTheDocument();
  });

  it('opens the create sheet from the header button', async () => {
    render(<PositionListPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Thêm chức vụ' }));
    expect(screen.getByLabelText(/Tên chức vụ/i)).toBeInTheDocument();
  });

  it('calls the delete mutation after confirming for a position with no employees', async () => {
    render(<PositionListPage />);
    const menuTriggers = screen.getAllByLabelText('Hành động');
    await userEvent.click(menuTriggers[0]);
    await userEvent.click(await screen.findByText('Xóa'));
    const confirm = await screen.findByRole('button', { name: 'Xóa' });
    await userEvent.click(confirm);
    expect(deleteMutate).toHaveBeenCalled();
  });
});
