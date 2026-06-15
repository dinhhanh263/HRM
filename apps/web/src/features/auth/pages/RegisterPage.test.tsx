import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { RegisterPage } from './RegisterPage';

const registerMutate = vi.fn();
let registerState = { mutate: registerMutate, isPending: false, error: null as unknown };

vi.mock('../hooks/useAuth', () => ({
  useRegister: () => registerState,
}));

beforeEach(() => {
  vi.clearAllMocks();
  registerState = { mutate: registerMutate, isPending: false, error: null };
});

describe('RegisterPage', () => {
  it('renders the register heading and form fields', () => {
    render(<RegisterPage />);
    expect(screen.getByText('Đăng ký tài khoản')).toBeInTheDocument();
    expect(screen.getByLabelText(/Họ và tên/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('submits the register mutation with valid input', async () => {
    render(<RegisterPage />);
    await userEvent.type(screen.getByLabelText(/Họ và tên/i), 'Nguyen Van A');
    await userEvent.type(screen.getByLabelText('Email'), 'a@codecrush.asia');
    await userEvent.type(screen.getByLabelText(/^Mật khẩu/i), 'Password123');
    await userEvent.type(screen.getByLabelText(/Xác nhận mật khẩu/i), 'Password123');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
    expect(registerMutate).toHaveBeenCalled();
  });
});
