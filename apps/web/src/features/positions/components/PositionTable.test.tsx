import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { PositionLevel } from '@hrm/shared';
import { render, screen } from '@/test/test-utils';
import { PositionTable } from './PositionTable';
import type { PositionDto } from '@hrm/shared';

const pos = (over: Partial<PositionDto> = {}): PositionDto =>
  ({
    id: 'p1',
    name: 'Backend Engineer',
    level: PositionLevel.SENIOR,
    department: { id: 'd1', name: 'Engineering' },
    employeeCount: 4,
    ...over,
  }) as PositionDto;

describe('PositionTable', () => {
  it('shows the empty state and fires onCreate', async () => {
    const onCreate = vi.fn();
    render(
      <PositionTable positions={[]} onCreate={onCreate} onEdit={vi.fn()} onDelete={vi.fn()} />
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('renders name, department, level label, and count', () => {
    render(
      <PositionTable positions={[pos()]} onCreate={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Senior')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('falls back to the no-department placeholder', () => {
    render(
      <PositionTable
        positions={[pos({ department: null })]}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('Backend Engineer')).toBeInTheDocument();
  });

  it('invokes onEdit and onDelete from the row menu', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <PositionTable positions={[pos()]} onCreate={vi.fn()} onEdit={onEdit} onDelete={onDelete} />
    );
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(await screen.findByText('Chỉnh sửa'));
    expect(onEdit).toHaveBeenCalledWith(pos());

    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(await screen.findByText('Xóa'));
    expect(onDelete).toHaveBeenCalledWith(pos());
  });
});
