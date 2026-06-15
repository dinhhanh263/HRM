import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import i18n from '@/i18n';
import { useThemeStore } from '@/stores/theme.store';

// Mock useForgotPassword — overridable per test via mockState.
const mockMutate = vi.fn();
let mockState: { isPending: boolean; isSuccess: boolean; error: unknown };
vi.mock('../hooks/useAuth', () => ({
  useForgotPassword: () => ({
    mutate: mockMutate,
    isPending: mockState.isPending,
    isSuccess: mockState.isSuccess,
    error: mockState.error,
  }),
}));

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockState = { isPending: false, isSuccess: false, error: null };
    useThemeStore.setState({ theme: 'ocean', mode: 'light', language: 'vi' });
    i18n.changeLanguage('vi');
    window.history.pushState({}, '', '/forgot-password');
  });

  describe('Rendering', () => {
    it('should render the email form by default', () => {
      render(<ForgotPasswordPage />);

      expect(screen.getAllByText('Quên mật khẩu?').length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText('name@company.com')).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('should show an error and not submit when the email is empty', async () => {
      const user = userEvent.setup();
      render(<ForgotPasswordPage />);

      await user.click(screen.getByRole('button', { name: /Gửi liên kết đặt lại/i }));

      await waitFor(() => {
        expect(screen.getByText(/Vui lòng nhập email hợp lệ/)).toBeInTheDocument();
      });
      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  describe('Submission', () => {
    it('should call forgotPassword with email and tenantSlug when valid', async () => {
      const user = userEvent.setup();
      render(<ForgotPasswordPage />);

      await user.type(screen.getByPlaceholderText('name@company.com'), 'user@codecrush.asia');
      await user.click(screen.getByRole('button', { name: /Gửi liên kết đặt lại/i }));

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith({
          email: 'user@codecrush.asia',
          tenantSlug: 'codecrush',
        });
      });
    });
  });

  describe('States', () => {
    it('should show a neutral, conditional "check your inbox" panel on success', () => {
      mockState.isSuccess = true;
      render(<ForgotPasswordPage />);

      expect(screen.getByText('Kiểm tra hộp thư của bạn')).toBeInTheDocument();
      // Copy must be conditional ("if it matches an account"), never claim it
      // was actually sent — that would leak whether the account exists.
      expect(screen.getByText(/Nếu địa chỉ dưới đây khớp với một tài khoản/)).toBeInTheDocument();
      expect(screen.getByText(/Thử email khác/)).toBeInTheDocument();
      // The email input must no longer be shown in the success state.
      expect(screen.queryByPlaceholderText('name@company.com')).not.toBeInTheDocument();
    });

    it('should echo the submitted email back in the success panel', async () => {
      const user = userEvent.setup();
      render(<ForgotPasswordPage />);

      await user.type(screen.getByPlaceholderText('name@company.com'), 'typo@codecrush.asia');
      // Flip the mock to success, then submit so the panel renders.
      mockState.isSuccess = true;
      await user.click(screen.getByRole('button', { name: /Gửi liên kết đặt lại/i }));

      await waitFor(() => {
        expect(screen.getByText('typo@codecrush.asia')).toBeInTheDocument();
      });
    });
  });
});
