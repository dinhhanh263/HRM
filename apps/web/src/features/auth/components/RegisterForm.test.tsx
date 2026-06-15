import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/test-utils';
import { RegisterForm } from './RegisterForm';

const mutate = vi.fn();
let mutationState = { mutate, isPending: false, error: null as unknown };

vi.mock('../hooks/useAuth', () => ({
  useRegister: () => mutationState,
}));

beforeEach(() => {
  mutate.mockClear();
  mutationState = { mutate, isPending: false, error: null };
});

describe('RegisterForm', () => {
  it('renders all the registration fields', () => {
    render(<RegisterForm />);
    expect(screen.getByLabelText('Tổ chức')).toBeInTheDocument();
    expect(screen.getByLabelText('Họ và tên')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Mật khẩu')).toBeInTheDocument();
    expect(screen.getByLabelText('Xác nhận mật khẩu')).toBeInTheDocument();
  });

  it('does not submit and surfaces validation errors for empty/invalid input', async () => {
    render(<RegisterForm />);
    await userEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
    await waitFor(() => expect(mutate).not.toHaveBeenCalled());
  });

  it('submits the payload when the form is valid', async () => {
    render(<RegisterForm />);
    await userEvent.type(screen.getByLabelText('Họ và tên'), 'Nguyen Van A');
    await userEvent.type(screen.getByLabelText('Email'), 'user@company.com');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'Abcd1234');
    await userEvent.type(screen.getByLabelText('Xác nhận mật khẩu'), 'Abcd1234');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({
        email: 'user@company.com',
        password: 'Abcd1234',
        fullName: 'Nguyen Van A',
        tenantSlug: 'codecrush',
      })
    );
  });

  it('shows an error message when the mutation fails', () => {
    mutationState = { mutate, isPending: false, error: new Error('boom') };
    render(<RegisterForm />);
    expect(screen.getByText(/đăng ký/i, { selector: 'p' })).toBeInTheDocument();
  });
});
