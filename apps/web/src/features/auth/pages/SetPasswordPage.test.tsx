import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { SetPasswordPage } from './SetPasswordPage';
import i18n from '@/i18n';
import { useThemeStore } from '@/stores/theme.store';

// Mock useSetPassword — overridable per test via mockState.
const mockMutate = vi.fn();
let mockState: { isPending: boolean; isSuccess: boolean; error: unknown };
vi.mock('../hooks/useAuth', () => ({
  useSetPassword: () => ({
    mutate: mockMutate,
    isPending: mockState.isPending,
    isSuccess: mockState.isSuccess,
    error: mockState.error,
  }),
}));

function setUrl(search: string) {
  window.history.pushState({}, '', `/set-password${search}`);
}

describe('SetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockState = { isPending: false, isSuccess: false, error: null };
    useThemeStore.setState({ theme: 'ocean', mode: 'light', language: 'vi' });
    i18n.changeLanguage('vi');
    setUrl('?token=valid-token');
  });

  describe('Rendering', () => {
    it('should render the set-password form when a token is present', () => {
      render(<SetPasswordPage />);

      expect(screen.getAllByText('Thiết lập mật khẩu').length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('••••••••••')).toBeInTheDocument();
    });

    it('should render an invalid-link state when token is missing', () => {
      setUrl('');
      render(<SetPasswordPage />);

      expect(screen.getByText('Liên kết không hợp lệ')).toBeInTheDocument();
      // No password field should be shown in this state.
      expect(screen.queryByPlaceholderText('••••••••')).not.toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('should show an error when passwords do not match', async () => {
      const user = userEvent.setup();
      render(<SetPasswordPage />);

      await user.type(screen.getByPlaceholderText('••••••••'), 'Password1');
      await user.type(screen.getByPlaceholderText('••••••••••'), 'Password2');
      await user.click(screen.getByRole('button', { name: /Kích hoạt tài khoản/i }));

      await waitFor(() => {
        expect(screen.getByText(/Mật khẩu xác nhận không khớp/)).toBeInTheDocument();
      });
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('should show an error when password is too weak', async () => {
      const user = userEvent.setup();
      render(<SetPasswordPage />);

      await user.type(screen.getByPlaceholderText('••••••••'), 'weak');
      await user.type(screen.getByPlaceholderText('••••••••••'), 'weak');
      await user.click(screen.getByRole('button', { name: /Kích hoạt tài khoản/i }));

      await waitFor(() => {
        // Anchor end-of-string: the strength hint shares this prefix.
        expect(screen.getByText(/Mật khẩu tối thiểu 8 ký tự$/)).toBeInTheDocument();
      });
      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  describe('Submission', () => {
    it('should call setPassword with the token and password when valid', async () => {
      const user = userEvent.setup();
      render(<SetPasswordPage />);

      await user.type(screen.getByPlaceholderText('••••••••'), 'Password1');
      await user.type(screen.getByPlaceholderText('••••••••••'), 'Password1');
      await user.click(screen.getByRole('button', { name: /Kích hoạt tài khoản/i }));

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith({
          token: 'valid-token',
          password: 'Password1',
        });
      });
    });
  });

  describe('States', () => {
    it('should show a success state with a link to sign in', () => {
      mockState.isSuccess = true;
      render(<SetPasswordPage />);

      expect(screen.getByText('Kích hoạt thành công')).toBeInTheDocument();
      expect(screen.getByText('Đến trang đăng nhập')).toBeInTheDocument();
    });

    it('should show an invalid-token error when the mutation fails', () => {
      mockState.error = new Error('bad token');
      render(<SetPasswordPage />);

      expect(
        screen.getByText(/Liên kết không hợp lệ hoặc đã hết hạn/),
      ).toBeInTheDocument();
    });
  });
});
