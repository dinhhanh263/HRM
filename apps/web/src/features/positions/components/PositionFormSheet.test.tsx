import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/test-utils';
import { PositionFormSheet } from './PositionFormSheet';
import type { DepartmentDto } from '@hrm/shared';

const departments = [
  { id: 'd1', name: 'Engineering', description: null, employeeCount: 2 },
] as DepartmentDto[];

describe('PositionFormSheet', () => {
  it('does not render fields when closed', () => {
    render(
      <PositionFormSheet
        open={false}
        onOpenChange={vi.fn()}
        departments={departments}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.queryByLabelText(/Tên chức vụ/i)).not.toBeInTheDocument();
  });

  it('prefills the name when editing', () => {
    render(
      <PositionFormSheet
        open
        onOpenChange={vi.fn()}
        departments={departments}
        position={{ id: 'p1', name: 'Tech Lead', level: 4, departmentId: 'd1' } as never}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue('Tech Lead')).toBeInTheDocument();
  });

  it('submits the typed name with default department + level', async () => {
    const onSubmit = vi.fn();
    render(
      <PositionFormSheet
        open
        onOpenChange={vi.fn()}
        departments={departments}
        onSubmit={onSubmit}
      />
    );
    await userEvent.type(screen.getByLabelText(/Tên chức vụ/i), 'Developer');
    await userEvent.click(screen.getByRole('button', { name: /Tạo|Lưu/i }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Developer', departmentId: 'none' }),
        expect.anything()
      )
    );
  });

  it('calls onOpenChange(false) from cancel', async () => {
    const onOpenChange = vi.fn();
    render(
      <PositionFormSheet
        open
        onOpenChange={onOpenChange}
        departments={departments}
        onSubmit={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Hủy/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
