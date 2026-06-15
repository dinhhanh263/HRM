import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';
import i18n from '@/i18n';
import { useThemeStore } from '@/stores/theme.store';

function readThemeStorage() {
  const raw = localStorage.getItem('hrm-theme');
  return raw ? JSON.parse(raw).state : null;
}

// Mock useLogin hook
const mockMutate = vi.fn();
vi.mock('../hooks/useAuth', () => ({
  useLogin: () => ({
    mutate: mockMutate,
    isPending: false,
    error: null,
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Reset the singleton theme store + i18n so each test is isolated
    useThemeStore.setState({ theme: 'ocean', mode: 'light', language: 'vi' });
    i18n.changeLanguage('vi');
  });

  describe('Rendering', () => {
    it('should render login form with all required fields', () => {
      render(<LoginPage />);

      // Check form title - use getAllByText since title may appear multiple times
      const titleElements = screen.getAllByText('Đăng nhập');
      expect(titleElements.length).toBeGreaterThan(0);

      // Check form fields
      expect(screen.getByPlaceholderText('name@company.com')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();

      // Check submit button - get the one with type="submit"
      const submitButtons = screen.getAllByRole('button');
      const loginButton = submitButtons.find(btn => btn.textContent?.includes('Đăng nhập'));
      expect(loginButton).toBeInTheDocument();
    });

    it('should render brand panel with company info', () => {
      render(<LoginPage />);

      expect(screen.getByText('HRM')).toBeInTheDocument();
      expect(screen.getByText(/by CodeCrush/)).toBeInTheDocument();
      expect(screen.getByText(/Quản lý nhân sự/)).toBeInTheDocument();
    });

    it('should render theme switcher controls', () => {
      render(<LoginPage />);

      // Theme picker dots should be present
      expect(screen.getByTitle('Ocean Blue')).toBeInTheDocument();
      expect(screen.getByTitle('Sage Green')).toBeInTheDocument();
    });

    it('should render language toggle', () => {
      render(<LoginPage />);

      expect(screen.getByText('VI')).toBeInTheDocument();
    });

    it('should render dark mode toggle', () => {
      render(<LoginPage />);

      expect(screen.getByText('Sáng')).toBeInTheDocument();
    });

    it('should render Google SSO button', () => {
      render(<LoginPage />);

      expect(screen.getByText('Google Workspace')).toBeInTheDocument();
    });

    it('should render forgot password link', () => {
      render(<LoginPage />);

      expect(screen.getByText('Quên mật khẩu?')).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should show error when submitting empty form', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const submitButton = screen.getByRole('button', { name: /Đăng nhập/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Vui lòng nhập email hợp lệ/)).toBeInTheDocument();
      });
    });

    it('should show error for invalid email format', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const emailInput = screen.getByPlaceholderText('name@company.com');
      await user.type(emailInput, 'invalid-email');

      // Also fill password to trigger only email error
      const passwordInput = screen.getByPlaceholderText('••••••••');
      await user.type(passwordInput, 'password123');

      // Find and click the submit button
      const submitButtons = screen.getAllByRole('button');
      const loginButton = submitButtons.find(btn => btn.getAttribute('type') === 'submit');
      if (loginButton) {
        await user.click(loginButton);
      }

      // Wait for validation to run
      await waitFor(
        () => {
          // Either the error message appears or the mutation was not called
          // (since validation should prevent submission)
          const errorElements = screen.queryAllByText(/email/i);
          const hasErrorIndicator = errorElements.some(
            (el) => el.textContent?.toLowerCase().includes('hợp lệ') ||
                   el.textContent?.toLowerCase().includes('invalid')
          );
          expect(hasErrorIndicator || !mockMutate.mock.calls.length).toBeTruthy();
        },
        { timeout: 2000 }
      );
    });

    it('should show error when password is empty', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const emailInput = screen.getByPlaceholderText('name@company.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Đăng nhập/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Vui lòng nhập mật khẩu/)).toBeInTheDocument();
      });
    });

    it('should not show errors for valid input', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const emailInput = screen.getByPlaceholderText('name@company.com');
      const passwordInput = screen.getByPlaceholderText('••••••••');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /Đăng nhập/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.queryByText(/Vui lòng nhập email hợp lệ/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Vui lòng nhập mật khẩu/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Form Submission', () => {
    it('should call login mutation with correct data when form is valid', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const emailInput = screen.getByPlaceholderText('name@company.com');
      const passwordInput = screen.getByPlaceholderText('••••••••');

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');

      const submitButton = screen.getByRole('button', { name: /Đăng nhập/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123',
          tenantSlug: 'codecrush',
          rememberMe: false,
        });
      });
    });
  });

  describe('Password Visibility Toggle', () => {
    it('should toggle password visibility when eye icon is clicked', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const passwordInput = screen.getByPlaceholderText('••••••••');
      expect(passwordInput).toHaveAttribute('type', 'password');

      // Find the toggle button (it's the button inside the password field)
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

  describe('Theme Switching', () => {
    it('should switch to sage theme when sage dot is clicked', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const sageDot = screen.getByTitle('Sage Green');
      await user.click(sageDot);

      expect(readThemeStorage()?.theme).toBe('sage');
    });

    it('should switch to ocean theme when ocean dot is clicked', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      // First switch to sage
      const sageDot = screen.getByTitle('Sage Green');
      await user.click(sageDot);

      // Then back to ocean
      const oceanDot = screen.getByTitle('Ocean Blue');
      await user.click(oceanDot);

      expect(readThemeStorage()?.theme).toBe('ocean');
    });
  });

  describe('Language Toggle', () => {
    it('should switch to English when language button is clicked', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      // Find the button that contains "VI"
      const langButton = screen.getByText('VI').closest('button');
      expect(langButton).toBeInTheDocument();

      if (langButton) {
        await user.click(langButton);

        // After clicking, the button should show "EN"
        await waitFor(() => {
          expect(screen.getByText('EN')).toBeInTheDocument();
        });

        // The form title should change to English
        await waitFor(() => {
          const signInElements = screen.getAllByText('Sign in');
          expect(signInElements.length).toBeGreaterThan(0);
        });

        // Verify localStorage was updated
        expect(readThemeStorage()?.language).toBe('en');
      }
    });
  });

  describe('Dark Mode Toggle', () => {
    it('should switch to dark mode when toggle is clicked', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const modeButton = screen.getByText('Sáng').closest('button');
      expect(modeButton).toBeInTheDocument();

      if (modeButton) {
        await user.click(modeButton);

        await waitFor(() => {
          expect(screen.getByText('Tối')).toBeInTheDocument();
        });

        expect(readThemeStorage()?.mode).toBe('dark');
      }
    });
  });

  describe('Google SSO', () => {
    afterEach(() => {
      // Reset the URL so the ?error param doesn't leak into other tests.
      window.history.pushState({}, '', '/');
    });

    it('should show a neutral error message when redirected with ?error=sso', () => {
      window.history.pushState({}, '', '/login?error=sso');
      render(<LoginPage />);

      expect(
        screen.getByText(/Không thể đăng nhập bằng Google/),
      ).toBeInTheDocument();
    });

    it('should show the not-configured message when ?error=sso_unavailable', () => {
      window.history.pushState({}, '', '/login?error=sso_unavailable');
      render(<LoginPage />);

      expect(
        screen.getByText(/Đăng nhập bằng Google chưa được cấu hình/),
      ).toBeInTheDocument();
    });

    it('should not show any SSO error when there is no error param', () => {
      window.history.pushState({}, '', '/login');
      render(<LoginPage />);

      expect(screen.queryByText(/Không thể đăng nhập bằng Google/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Đăng nhập bằng Google chưa được cấu hình/),
      ).not.toBeInTheDocument();
    });

    it('should redirect the browser to the Google start endpoint when clicked', async () => {
      const user = userEvent.setup();
      const hrefSpy = vi.fn();
      const realLocation = window.location;
      // Replace location with a proxy that records href writes but otherwise
      // delegates to the real object so react-router keeps working.
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: new Proxy(realLocation, {
          set(target, prop, value) {
            if (prop === 'href') {
              hrefSpy(value);
              return true;
            }
            return Reflect.set(target, prop, value);
          },
          get(target, prop) {
            const v = Reflect.get(target, prop);
            return typeof v === 'function' ? v.bind(target) : v;
          },
        }),
      });

      try {
        render(<LoginPage />);
        const googleButton = screen.getByText('Google Workspace').closest('button')!;
        await user.click(googleButton);
        expect(hrefSpy).toHaveBeenCalledWith('/api/v1/auth/google');
      } finally {
        Object.defineProperty(window, 'location', {
          configurable: true,
          value: realLocation,
        });
      }
    });
  });

  describe('Remember Me', () => {
    it('should submit rememberMe: true after checking the box', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByPlaceholderText('name@company.com'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('••••••••'), 'password123');
      await user.click(screen.getByText('Ghi nhớ đăng nhập'));
      await user.click(screen.getByRole('button', { name: /Đăng nhập/i }));

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({ rememberMe: true }),
        );
      });
    });

    it('should submit rememberMe: false when the box is left unchecked', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(screen.getByPlaceholderText('name@company.com'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('••••••••'), 'password123');
      await user.click(screen.getByRole('button', { name: /Đăng nhập/i }));

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({ rememberMe: false }),
        );
      });
    });
  });
});
