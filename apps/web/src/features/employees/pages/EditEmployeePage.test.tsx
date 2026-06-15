import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/test-utils';
import { EditEmployeePage } from './EditEmployeePage';
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
} as unknown as EmployeeDto;

const updateMutate = vi.fn();
let detailState = {
  data: employee as EmployeeDto | undefined,
  isLoading: false,
  error: null as unknown,
};
let updateState = { mutate: updateMutate, isPending: false, error: null as unknown };

vi.mock('../hooks/useEmployees', () => ({
  useEmployee: () => detailState,
  useUpdateEmployee: () => updateState,
  useEmployees: () => ({ data: { data: [] } }),
}));

vi.mock('../hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [{ id: 'd1', name: 'Engineering' }] }),
}));
vi.mock('../hooks/usePositions', () => ({
  usePositions: () => ({ data: [{ id: 'p1', name: 'Developer' }] }),
}));
vi.mock('@/features/roles/hooks/useRoles', () => ({
  useRoles: () => ({
    data: [
      { id: 'role-emp', key: 'employee', name: 'Nhân viên', isSystem: true },
      { id: 'role-director', key: 'director', name: 'Giám đốc', isSystem: false },
    ],
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  detailState = { data: employee, isLoading: false, error: null };
  updateState = { mutate: updateMutate, isPending: false, error: null };
});

describe('EditEmployeePage', () => {
  it('renders the edit form prefilled with the employee', () => {
    render(<EditEmployeePage />);
    expect(screen.getByRole('heading', { name: 'Chỉnh sửa nhân viên' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tran Binh')).toBeInTheDocument();
  });

  it('shows a loading spinner while fetching', () => {
    detailState = { data: undefined, isLoading: true, error: null };
    render(<EditEmployeePage />);
    expect(screen.getByText('Đang tải dữ liệu...')).toBeInTheDocument();
  });

  it('shows a not-found state on error', () => {
    detailState = { data: undefined, isLoading: false, error: new Error('boom') };
    render(<EditEmployeePage />);
    expect(screen.getByText('Không tìm thấy nhân viên')).toBeInTheDocument();
  });

  it('navigates back to detail on cancel', async () => {
    render(<EditEmployeePage />);
    await userEvent.click(screen.getByRole('button', { name: /Hủy/i }));
    expect(navigate).toHaveBeenCalledWith('/employees/e1');
  });

  it('submits the update mutation', async () => {
    render(<EditEmployeePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Cập nhật' }));
    expect(updateMutate).toHaveBeenCalled();
  });

  // Regression: an employee without dateOfBirth/joinDate must not submit empty
  // strings — the API's date validator rejects '' and returns 422.
  it('omits empty optional fields instead of sending empty strings', async () => {
    render(<EditEmployeePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Cập nhật' }));

    const payload = updateMutate.mock.calls[0][0];
    expect(payload.dateOfBirth).toBeUndefined();
    expect(payload.joinDate).toBeUndefined();
    expect(payload.phone).toBeUndefined();
    expect(payload.idNumber).toBeUndefined();
    // departmentId/positionId unset on this employee → must be omitted, not ''
    expect(payload.departmentId).toBeUndefined();
    expect(payload.positionId).toBeUndefined();
    // managerId unset → must be null (clears assignment), never '' which the
    // cuid validator rejects. '' ?? null === '' was the bug; '' || null === null.
    expect(payload.managerId).toBeNull();
  });

  it('surfaces the server error message from a structured API error', () => {
    // Shape matches the API error envelope: { success, error: { code, message } }.
    const apiError = Object.assign(new Error('Request failed with status code 409'), {
      isAxiosError: true,
      response: {
        data: {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'An employee with this ID number already exists',
          },
        },
      },
    });
    updateState = { mutate: updateMutate, isPending: false, error: apiError };
    render(<EditEmployeePage />);

    expect(screen.getByText('An employee with this ID number already exists')).toBeInTheDocument();
    expect(screen.queryByText('Request failed with status code 409')).not.toBeInTheDocument();
  });

  it('falls back to the generic message when the error has no server message', () => {
    updateState = { mutate: updateMutate, isPending: false, error: new Error('Update failed') };
    render(<EditEmployeePage />);

    expect(screen.getByText('Không thể cập nhật nhân viên. Vui lòng thử lại.')).toBeInTheDocument();
    expect(screen.queryByText('Update failed')).not.toBeInTheDocument();
  });

  it('highlights the ID number field on ID_NUMBER_EXISTS instead of showing the banner', async () => {
    const apiError = Object.assign(new Error('Request failed with status code 409'), {
      isAxiosError: true,
      response: {
        data: {
          success: false,
          error: {
            code: 'ID_NUMBER_EXISTS',
            message: 'An employee with this ID number already exists',
          },
        },
      },
    });
    updateState = { mutate: updateMutate, isPending: false, error: apiError };
    render(<EditEmployeePage />);

    await waitFor(() => {
      expect(screen.getByText('Số CCCD/CMND này đã tồn tại')).toBeInTheDocument();
    });
    // Field-level error replaces the generic banner.
    expect(screen.queryByText('Có lỗi xảy ra')).not.toBeInTheDocument();
  });
});
