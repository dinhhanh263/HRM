import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { DepartmentTable } from './DepartmentTable';
import type { DepartmentDto } from '@hrm/shared';

const dept = (over: Partial<DepartmentDto> = {}): DepartmentDto =>
  ({ id: 'd1', name: 'Engineering', description: 'Builds things', employeeCount: 7, ...over }) as DepartmentDto;

describe('DepartmentTable', () => {
  it('shows the empty state and fires onCreate from its CTA', async () => {
    const onCreate = vi.fn();
    render(
      <DepartmentTable departments={[]} onCreate={onCreate} onEdit={vi.fn()} onDelete={vi.fn()} />
    );
    const cta = screen.getByRole('button');
    await userEvent.click(cta);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('renders a row per department with name, description, and count', () => {
    render(
      <DepartmentTable
        departments={[dept(), dept({ id: 'd2', name: 'Sales', description: null, employeeCount: 0 })]}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Builds things')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
  });

  it('invokes onEdit and onDelete from the row menu', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <DepartmentTable
        departments={[dept()]}
        onCreate={vi.fn()}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(await screen.findByText('Chỉnh sửa'));
    expect(onEdit).toHaveBeenCalledWith(dept());

    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(await screen.findByText('Xóa'));
    expect(onDelete).toHaveBeenCalledWith(dept());
  });
});
