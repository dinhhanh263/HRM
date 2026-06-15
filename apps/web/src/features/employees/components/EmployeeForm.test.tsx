import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/test-utils';
import { EmployeeForm } from './EmployeeForm';
import type { EmployeeDto } from '@hrm/shared';

vi.mock('../hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [{ id: 'd1', name: 'Engineering' }] }),
}));
vi.mock('../hooks/usePositions', () => ({
  usePositions: () => ({ data: [{ id: 'p1', name: 'Developer' }] }),
}));
vi.mock('../hooks/useEmployees', () => ({
  useEmployees: () => ({ data: { data: [] } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EmployeeForm', () => {
  it('shows the account section only when creating', () => {
    const { rerender } = render(
      <EmployeeForm onSubmit={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText('Thông tin tài khoản')).toBeInTheDocument();

    rerender(
      <EmployeeForm
        employee={{ id: 'e1', fullName: 'A', contractType: 'FULL_TIME' } as EmployeeDto}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByText('Thông tin tài khoản')).not.toBeInTheDocument();
  });

  it('blocks creation when email/password are missing even if fullName is set', async () => {
    const onSubmit = vi.fn();
    render(<EmployeeForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Họ và tên/i), 'Nguyen Van A');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhân viên' }));
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });

  it('submits a complete new-employee payload', async () => {
    const onSubmit = vi.fn();
    render(<EmployeeForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Email/i), 'new@company.com');
    await userEvent.type(screen.getByLabelText(/Mật khẩu/i), 'Abcd1234');
    await userEvent.type(screen.getByLabelText(/Họ và tên/i), 'Nguyen Van A');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhân viên' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@company.com',
          password: 'Abcd1234',
          fullName: 'Nguyen Van A',
        })
      )
    );
  });

  it('prefills fullName and shows the update label when editing', () => {
    render(
      <EmployeeForm
        employee={{ id: 'e1', fullName: 'Tran Binh', contractType: 'FULL_TIME' } as EmployeeDto}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue('Tran Binh')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cập nhật' })).toBeInTheDocument();
  });

  it('fires onCancel from the cancel button', async () => {
    const onCancel = vi.fn();
    render(<EmployeeForm onSubmit={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /Hủy/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('submits the entered dependentsCount as a number', async () => {
    const onSubmit = vi.fn();
    render(<EmployeeForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Email/i), 'dep@company.com');
    await userEvent.type(screen.getByLabelText(/Mật khẩu/i), 'Abcd1234');
    await userEvent.type(screen.getByLabelText(/Họ và tên/i), 'Nguyen Van A');
    const depInput = screen.getByLabelText(/Số người phụ thuộc/i);
    await userEvent.clear(depInput);
    await userEvent.type(depInput, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo nhân viên' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ dependentsCount: 3 }))
    );
  });

  it('prefills dependentsCount when editing', () => {
    render(
      <EmployeeForm
        employee={
          { id: 'e1', fullName: 'Tran Binh', contractType: 'FULL_TIME', dependentsCount: 2 } as EmployeeDto
        }
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue('2')).toBeInTheDocument();
  });
});
