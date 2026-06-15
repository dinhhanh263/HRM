import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/test-utils';
import { DepartmentFormSheet } from './DepartmentFormSheet';

vi.mock('@/features/employees/hooks/useEmployees', () => ({
  useEmployees: () => ({ data: { data: [] } }),
}));

describe('DepartmentFormSheet', () => {
  it('does not render its fields when closed', () => {
    render(
      <DepartmentFormSheet open={false} onOpenChange={vi.fn()} onSubmit={vi.fn()} />
    );
    expect(screen.queryByLabelText(/Tên/i)).not.toBeInTheDocument();
  });

  it('prefills the name when editing an existing department', () => {
    render(
      <DepartmentFormSheet
        open
        onOpenChange={vi.fn()}
        department={{ id: 'd1', name: 'Engineering', description: 'Builds', employeeCount: 3 } as never}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue('Engineering')).toBeInTheDocument();
  });

  it('blocks submit and shows a validation error when the name is empty', async () => {
    const onSubmit = vi.fn();
    render(<DepartmentFormSheet open onOpenChange={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: /Tạo|Lưu/i }));
    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });

  it('submits the typed values', async () => {
    const onSubmit = vi.fn();
    render(<DepartmentFormSheet open onOpenChange={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/Tên/i), 'Sales');
    await userEvent.click(screen.getByRole('button', { name: /Tạo|Lưu/i }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Sales' }),
        expect.anything()
      )
    );
  });

  it('calls onOpenChange(false) from the cancel button', async () => {
    const onOpenChange = vi.fn();
    render(<DepartmentFormSheet open onOpenChange={onOpenChange} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Hủy/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
