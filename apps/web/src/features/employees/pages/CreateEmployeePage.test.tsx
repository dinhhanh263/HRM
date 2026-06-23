import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { CreateEmployeePage } from './CreateEmployeePage';
import { useAuthStore } from '@/stores/auth.store';
import type { UserDto } from '@hrm/shared';

// The dev mock user (HR_MANAGER) is the default; some tests override the role to
// assert SUPER_ADMIN-only behavior. Capture it so we can restore between tests.
const defaultAuthUser = useAuthStore.getState().user;

function setAuthRole(role: UserDto['role']) {
  useAuthStore.setState({
    user: { ...(defaultAuthUser as UserDto), role },
  });
}

// Mock hooks
const mockMutate = vi.fn();
const mockNavigate = vi.fn();
// Mutable so individual tests can simulate a failed mutation.
let mockCreateError: unknown = null;

// Shape matches the API error envelope: { success, error: { code, message } }.
function serverError(code: string, message: string) {
  return Object.assign(new Error(`Request failed with status code 409`), {
    isAxiosError: true,
    response: { data: { success: false, error: { code, message } } },
  });
}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../hooks/useEmployees', () => ({
  useCreateEmployee: () => ({
    mutate: mockMutate,
    isPending: false,
    error: mockCreateError,
  }),
  useEmployees: () => ({ data: { data: [] } }),
}));

vi.mock('../hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: [
      { id: 'dept-1', name: 'Engineering' },
      { id: 'dept-2', name: 'Marketing' },
      { id: 'dept-3', name: 'HR' },
    ],
  }),
}));

vi.mock('../hooks/usePositions', () => ({
  usePositions: () => ({
    data: [
      { id: 'pos-1', name: 'Software Engineer' },
      { id: 'pos-2', name: 'Product Manager' },
      { id: 'pos-3', name: 'Designer' },
    ],
  }),
}));

// Assignable roles come from the tenant role catalog now (not a hardcoded enum).
// super_admin is included here to assert the form filters it out.
vi.mock('@/features/roles/hooks/useRoles', () => ({
  useRoles: () => ({
    data: [
      { id: 'role-emp', key: 'employee', name: 'Nhân viên', isSystem: true },
      { id: 'role-mgr', key: 'manager', name: 'Quản lý', isSystem: true },
      { id: 'role-director', key: 'director', name: 'Giám đốc', isSystem: false },
      { id: 'role-sa', key: 'super_admin', name: 'Super Admin', isSystem: true },
    ],
  }),
}));

describe('CreateEmployeePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateError = null;
  });

  afterEach(() => {
    useAuthStore.setState({ user: defaultAuthUser });
  });

  describe('Rendering', () => {
    it('should render page with correct title', () => {
      render(<CreateEmployeePage />);

      expect(screen.getByText('Thêm nhân viên mới')).toBeInTheDocument();
      expect(screen.getByText(/Tạo hồ sơ và tài khoản/)).toBeInTheDocument();
    });

    it('should render back button', () => {
      render(<CreateEmployeePage />);

      expect(screen.getByText('Quay lại danh sách')).toBeInTheDocument();
    });

    it('should render all form sections', () => {
      render(<CreateEmployeePage />);

      expect(screen.getByText('Thông tin tài khoản')).toBeInTheDocument();
      expect(screen.getByText('Thông tin cá nhân')).toBeInTheDocument();
      expect(screen.getByText('Thông tin công việc')).toBeInTheDocument();
    });

    it('should render account info fields', () => {
      render(<CreateEmployeePage />);

      expect(screen.getByPlaceholderText('email@company.com')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Tối thiểu 8 ký tự')).toBeInTheDocument();
    });

    it('should render personal info fields', () => {
      render(<CreateEmployeePage />);

      expect(screen.getByPlaceholderText('Nguyễn Văn A')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('0901234567')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('001012345678')).toBeInTheDocument();
      // SPEC-040 replaced the single "address" field with permanent/current address
      // plus extended personal fields; assert one of the new fields renders.
      expect(screen.getByPlaceholderText('ca.nhan@email.com')).toBeInTheDocument();
    });

    it('should render the dependents field (parity with Edit form)', () => {
      render(<CreateEmployeePage />);

      expect(screen.getByText('Số người phụ thuộc')).toBeInTheDocument();
      // Only numeric field on the form — uniquely identifies dependentsCount.
      expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    });

    it('should render avatar section', () => {
      render(<CreateEmployeePage />);

      expect(screen.getByText('Ảnh đại diện')).toBeInTheDocument();
      expect(screen.getByText('Tải ảnh lên')).toBeInTheDocument();
    });

    it('should render action buttons', () => {
      render(<CreateEmployeePage />);

      expect(screen.getByText('Hủy bỏ')).toBeInTheDocument();
      expect(screen.getByText('Tạo nhân viên')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should navigate back when back button is clicked', async () => {
      const user = userEvent.setup();
      render(<CreateEmployeePage />);

      const backButton = screen.getByText('Quay lại danh sách');
      await user.click(backButton);

      expect(mockNavigate).toHaveBeenCalledWith('/employees');
    });

    it('should navigate back when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<CreateEmployeePage />);

      const cancelButton = screen.getByText('Hủy bỏ');
      await user.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith('/employees');
    });
  });

  describe('Form Validation', () => {
    it('should show error when email is empty', async () => {
      const user = userEvent.setup();
      render(<CreateEmployeePage />);

      // Fill required fields except email
      await user.type(screen.getByPlaceholderText('Tối thiểu 8 ký tự'), 'Password123');
      await user.type(screen.getByPlaceholderText('Nguyễn Văn A'), 'Test User');

      const submitButton = screen.getByText('Tạo nhân viên');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/email không hợp lệ/i)).toBeInTheDocument();
      });
    });

    it('should show error when password is too short', async () => {
      const user = userEvent.setup();
      render(<CreateEmployeePage />);

      await user.type(screen.getByPlaceholderText('email@company.com'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Tối thiểu 8 ký tự'), 'short');
      await user.type(screen.getByPlaceholderText('Nguyễn Văn A'), 'Test User');

      const submitButton = screen.getByText('Tạo nhân viên');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Mật khẩu tối thiểu 8 ký tự/)).toBeInTheDocument();
      });
    });

    it('should show error when password lacks uppercase', async () => {
      const user = userEvent.setup();
      render(<CreateEmployeePage />);

      await user.type(screen.getByPlaceholderText('email@company.com'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Tối thiểu 8 ký tự'), 'password123');
      await user.type(screen.getByPlaceholderText('Nguyễn Văn A'), 'Test User');

      const submitButton = screen.getByText('Tạo nhân viên');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Cần ít nhất 1 chữ hoa/)).toBeInTheDocument();
      });
    });

    it('should show error when full name is empty', async () => {
      const user = userEvent.setup();
      render(<CreateEmployeePage />);

      await user.type(screen.getByPlaceholderText('email@company.com'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Tối thiểu 8 ký tự'), 'Password123');

      const submitButton = screen.getByText('Tạo nhân viên');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Họ tên tối thiểu 2 ký tự/)).toBeInTheDocument();
      });
    });
  });

  describe('Form Submission', () => {
    it('should call create mutation with correct data when form is valid', async () => {
      const user = userEvent.setup();
      render(<CreateEmployeePage />);

      // Fill required fields
      await user.type(screen.getByPlaceholderText('email@company.com'), 'newuser@example.com');
      await user.type(screen.getByPlaceholderText('Tối thiểu 8 ký tự'), 'Password123');
      await user.type(screen.getByPlaceholderText('VD: NV001, CC-2026-01'), 'NV-001');
      await user.type(screen.getByPlaceholderText('Nguyễn Văn A'), 'Nguyễn Văn Test');
      await user.type(screen.getByPlaceholderText('0901234567'), '0909123456');

      const submitButton = screen.getByText('Tạo nhân viên');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled();
        const callArgs = mockMutate.mock.calls[0][0];
        expect(callArgs.email).toBe('newuser@example.com');
        expect(callArgs.password).toBe('Password123');
        expect(callArgs.employeeCode).toBe('NV-001');
        expect(callArgs.fullName).toBe('Nguyễn Văn Test');
        expect(callArgs.phone).toBe('0909123456');
        // Defaults to 0 when left untouched (matches server default).
        expect(callArgs.dependentsCount).toBe(0);
      });
    });

    it('should submit the entered dependents count', async () => {
      const user = userEvent.setup();
      render(<CreateEmployeePage />);

      await user.type(screen.getByPlaceholderText('email@company.com'), 'newuser@example.com');
      await user.type(screen.getByPlaceholderText('Tối thiểu 8 ký tự'), 'Password123');
      await user.type(screen.getByPlaceholderText('VD: NV001, CC-2026-01'), 'NV-001');
      await user.type(screen.getByPlaceholderText('Nguyễn Văn A'), 'Nguyễn Văn Test');

      const dependentsInput = screen.getByRole('spinbutton');
      await user.clear(dependentsInput);
      await user.type(dependentsInput, '3');

      await user.click(screen.getByText('Tạo nhân viên'));

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalled();
        expect(mockMutate.mock.calls[0][0].dependentsCount).toBe(3);
      });
    });

    it('should not submit when the employee code is missing', async () => {
      const user = userEvent.setup();
      render(<CreateEmployeePage />);

      // Every required field except the employee code.
      await user.type(screen.getByPlaceholderText('email@company.com'), 'newuser@example.com');
      await user.type(screen.getByPlaceholderText('Tối thiểu 8 ký tự'), 'Password123');
      await user.type(screen.getByPlaceholderText('Nguyễn Văn A'), 'Nguyễn Văn Test');

      await user.click(screen.getByText('Tạo nhân viên'));
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('should not submit when form has validation errors', async () => {
      const user = userEvent.setup();
      render(<CreateEmployeePage />);

      // Don't fill any fields
      const submitButton = screen.getByText('Tạo nhân viên');
      await user.click(submitButton);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  describe('Password Visibility Toggle', () => {
    it('should toggle password visibility', async () => {
      const user = userEvent.setup();
      render(<CreateEmployeePage />);

      const passwordInput = screen.getByPlaceholderText('Tối thiểu 8 ký tự');
      expect(passwordInput).toHaveAttribute('type', 'password');

      // Find the toggle button (within the password field wrapper)
      const toggleButton = passwordInput.parentElement?.querySelector('button');
      expect(toggleButton).toBeInTheDocument();

      if (toggleButton) {
        await user.click(toggleButton);
        expect(passwordInput).toHaveAttribute('type', 'text');

        await user.click(toggleButton);
        expect(passwordInput).toHaveAttribute('type', 'password');
      }
    });
  });

  describe('Avatar Preview', () => {
    it('should show initials based on full name', async () => {
      const user = userEvent.setup();
      render(<CreateEmployeePage />);

      // Initially shows "NV" for empty name
      expect(screen.getByText('NV')).toBeInTheDocument();

      // Type a name
      await user.type(screen.getByPlaceholderText('Nguyễn Văn A'), 'Trần Văn Bình');

      await waitFor(() => {
        expect(screen.getByText('TV')).toBeInTheDocument();
      });
    });
  });

  describe('Default Values', () => {
    it('should have default contract type as FULL_TIME', () => {
      render(<CreateEmployeePage />);

      // The select should show "Toàn thời gian" as default
      const contractTypeElements = screen.getAllByText('Toàn thời gian');
      expect(contractTypeElements.length).toBeGreaterThan(0);
    });

    it('should leave role unselected by default (SUPER_ADMIN sees the control)', () => {
      setAuthRole('SUPER_ADMIN');
      render(<CreateEmployeePage />);

      // No default role anymore — assignment is explicit. The control shows its
      // placeholder until the admin picks a tenant role.
      expect(screen.getByText('Chọn vai trò')).toBeInTheDocument();
    });
  });

  describe('Error Display', () => {
    it('should show the server error message when the API returns a structured error', () => {
      // A code with no field mapping still falls back to the banner.
      mockCreateError = serverError('CONFLICT', 'Some unmapped conflict happened');
      render(<CreateEmployeePage />);

      expect(screen.getByText('Some unmapped conflict happened')).toBeInTheDocument();
      expect(screen.queryByText('Request failed with status code 409')).not.toBeInTheDocument();
    });

    it('should fall back to the generic message when the error has no server message', () => {
      mockCreateError = new Error('Network Error');
      render(<CreateEmployeePage />);

      expect(screen.getByText('Không thể tạo nhân viên. Vui lòng thử lại.')).toBeInTheDocument();
      expect(screen.queryByText('Network Error')).not.toBeInTheDocument();
    });

    it('should highlight the email field on EMAIL_EXISTS instead of showing the banner', async () => {
      mockCreateError = serverError('EMAIL_EXISTS', 'A user with this email already exists');
      render(<CreateEmployeePage />);

      await waitFor(() => {
        expect(screen.getByText('Email này đã được sử dụng')).toBeInTheDocument();
      });
      // Field-level error replaces the generic banner.
      expect(screen.queryByText('Có lỗi xảy ra')).not.toBeInTheDocument();
    });

    it('should highlight the ID number field on ID_NUMBER_EXISTS instead of showing the banner', async () => {
      mockCreateError = serverError(
        'ID_NUMBER_EXISTS',
        'An employee with this ID number already exists',
      );
      render(<CreateEmployeePage />);

      await waitFor(() => {
        expect(screen.getByText('Số CCCD/CMND này đã tồn tại')).toBeInTheDocument();
      });
      expect(screen.queryByText('Có lỗi xảy ra')).not.toBeInTheDocument();
    });
  });

  describe('Role assignment (separation of duties)', () => {
    it('hides the role control for non-admin callers', () => {
      setAuthRole('HR_MANAGER');
      render(<CreateEmployeePage />);

      expect(screen.queryByText('Vai trò')).not.toBeInTheDocument();
    });

    it('shows the role control for SUPER_ADMIN', () => {
      setAuthRole('SUPER_ADMIN');
      render(<CreateEmployeePage />);

      expect(screen.getByText('Vai trò')).toBeInTheDocument();
    });
  });
});
