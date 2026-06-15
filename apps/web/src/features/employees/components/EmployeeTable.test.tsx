import { describe, it, expect, vi, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { EmployeeTable } from './EmployeeTable';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSION_KEYS, type EmployeeDto, type PermissionKey } from '@hrm/shared';

// The dev auth store auto-logs in a mock user with every permission, so by
// default permission gates are open in tests. These helpers narrow the
// permission set to exercise role-based affordances and restore it afterwards.
const fullPermUser = useAuthStore.getState().user;

function setPermissions(permissions: PermissionKey[]) {
  useAuthStore.setState({
    user: { ...fullPermUser!, permissions },
    isAuthenticated: true,
    isLoading: false,
  });
}

afterEach(() => {
  useAuthStore.setState({ user: fullPermUser, isAuthenticated: !!fullPermUser });
});

const emp = (over: Partial<EmployeeDto> = {}): EmployeeDto =>
  ({
    id: 'e1',
    fullName: 'Nguyen Van A',
    employeeCode: 'EMP001',
    department: { id: 'd1', name: 'Engineering' },
    position: { id: 'p1', name: 'Developer' },
    joinDate: '2024-01-15',
    status: 'ACTIVE',
    avatar: null,
    user: { email: 'a@company.com' },
    ...over,
  }) as EmployeeDto;

describe('EmployeeTable', () => {
  it('renders the empty state when there are no employees', () => {
    render(
      <EmployeeTable
        employees={[]}
        onActivate={vi.fn()}
        onDeactivate={vi.fn()}
        onTerminate={vi.fn()}
      />
    );
    expect(screen.getByText('Không có nhân viên nào')).toBeInTheDocument();
  });

  it('shows the empty-state Add button when the user can create employees', () => {
    setPermissions([...PERMISSION_KEYS]);
    render(
      <EmployeeTable
        employees={[]}
        onActivate={vi.fn()}
        onDeactivate={vi.fn()}
        onTerminate={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Thêm nhân viên/i })).toBeInTheDocument();
  });

  it('hides the empty-state Add button and shows a read-only message when the user cannot create employees', () => {
    setPermissions(['employees:view']);
    render(
      <EmployeeTable
        employees={[]}
        onActivate={vi.fn()}
        onDeactivate={vi.fn()}
        onTerminate={vi.fn()}
      />
    );
    expect(screen.getByText('Không có nhân viên nào')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Thêm nhân viên/i })).not.toBeInTheDocument();
    expect(screen.getByText('Hiện chưa có nhân viên nào để hiển thị')).toBeInTheDocument();
  });

  it('renders employee name, code, department, position, and email', () => {
    render(
      <EmployeeTable
        employees={[emp()]}
        onActivate={vi.fn()}
        onDeactivate={vi.fn()}
        onTerminate={vi.fn()}
      />
    );
    expect(screen.getByText('Nguyen Van A')).toBeInTheDocument();
    expect(screen.getByText('EMP001')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Developer')).toBeInTheDocument();
    expect(screen.getByText('a@company.com')).toBeInTheDocument();
  });

  it('renders initials when there is no avatar', () => {
    render(
      <EmployeeTable
        employees={[emp({ fullName: 'Tran Binh' })]}
        onActivate={vi.fn()}
        onDeactivate={vi.fn()}
        onTerminate={vi.fn()}
      />
    );
    expect(screen.getByText('TB')).toBeInTheDocument();
  });

  it('fires onSort when a sortable header is clicked', async () => {
    const onSort = vi.fn();
    render(
      <EmployeeTable
        employees={[emp()]}
        onSort={onSort}
        onActivate={vi.fn()}
        onDeactivate={vi.fn()}
        onTerminate={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Mã NV/i }));
    expect(onSort).toHaveBeenCalledWith('employeeCode');
  });

  it('marks the active sort column with aria-sort', () => {
    render(
      <EmployeeTable
        employees={[emp()]}
        sort="fullName"
        order="desc"
        onSort={vi.fn()}
        onActivate={vi.fn()}
        onDeactivate={vi.fn()}
        onTerminate={vi.fn()}
      />
    );
    const header = screen.getByRole('columnheader', { name: /Nhân viên/i });
    expect(header).toHaveAttribute('aria-sort', 'descending');
  });

  it('calls onDeactivate from the row menu for an active employee', async () => {
    const onDeactivate = vi.fn();
    render(
      <EmployeeTable
        employees={[emp()]}
        onActivate={vi.fn()}
        onDeactivate={onDeactivate}
        onTerminate={vi.fn()}
      />
    );
    const menuTriggers = screen.getAllByRole('button');
    await userEvent.click(menuTriggers[menuTriggers.length - 1]);
    await userEvent.click(await screen.findByText('Tạm nghỉ'));
    expect(onDeactivate).toHaveBeenCalledWith('e1');
  });
});
