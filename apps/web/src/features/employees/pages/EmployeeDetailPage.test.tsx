import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { EmployeeDetailPage } from './EmployeeDetailPage';
import type { EmployeeDto } from '@hrm/shared';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate, useParams: () => ({ id: 'e1' }) };
});

const employee = {
  id: 'e1',
  employeeCode: 'NV001',
  fullName: 'Tran Binh',
  status: 'ACTIVE',
  contractType: 'FULL_TIME',
  phone: '0900000000',
  dateOfBirth: '1990-01-01',
  joinDate: '2020-06-01',
  department: { id: 'd1', name: 'Engineering' },
  position: { id: 'p1', name: 'Developer' },
  user: { email: 'binh@company.com', role: 'EMPLOYEE' },
} as unknown as EmployeeDto;

const activateMutate = vi.fn();
const deactivateMutate = vi.fn();
const terminateMutate = vi.fn();
let detailState = {
  data: employee as EmployeeDto | undefined,
  isLoading: false,
  error: null as unknown,
};

vi.mock('../hooks/useEmployees', () => ({
  useEmployee: () => detailState,
  useActivateEmployee: () => ({ mutate: activateMutate, isPending: false }),
  useDeactivateEmployee: () => ({ mutate: deactivateMutate, isPending: false }),
  useTerminateEmployee: () => ({ mutate: terminateMutate, isPending: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  detailState = { data: employee, isLoading: false, error: null };
});

describe('EmployeeDetailPage', () => {
  it('renders the employee profile details', () => {
    render(<EmployeeDetailPage />);
    expect(screen.getByRole('heading', { name: 'Tran Binh' })).toBeInTheDocument();
    expect(screen.getAllByText('NV001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('binh@company.com').length).toBeGreaterThan(0);
  });

  it('shows a loading spinner while fetching', () => {
    detailState = { data: undefined, isLoading: true, error: null };
    render(<EmployeeDetailPage />);
    expect(screen.getByText('Đang tải dữ liệu...')).toBeInTheDocument();
  });

  it('shows a not-found state on error', () => {
    detailState = { data: undefined, isLoading: false, error: new Error('boom') };
    render(<EmployeeDetailPage />);
    expect(screen.getByText('Không tìm thấy nhân viên')).toBeInTheDocument();
  });

  it('navigates back to the list', async () => {
    render(<EmployeeDetailPage />);
    await userEvent.click(screen.getByRole('button', { name: /Quay lại/i }));
    expect(navigate).toHaveBeenCalledWith('/employees');
  });

  it('navigates to the edit page from the edit button', async () => {
    render(<EmployeeDetailPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa' }));
    expect(navigate).toHaveBeenCalledWith('/employees/e1/edit');
  });

  it('deactivates an active employee', async () => {
    render(<EmployeeDetailPage />);
    await userEvent.click(screen.getByRole('button', { name: /Tạm nghỉ/i }));
    expect(deactivateMutate).toHaveBeenCalledWith('e1');
  });
});
