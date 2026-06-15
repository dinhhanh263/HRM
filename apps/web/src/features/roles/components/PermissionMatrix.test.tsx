import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import type { PermissionCatalogGroup } from '@hrm/shared';
import { PermissionMatrix } from './PermissionMatrix';

const catalog: PermissionCatalogGroup[] = [
  {
    resource: 'dashboard',
    actions: [{ key: 'dashboard:view', action: 'view' }],
  },
  {
    resource: 'employees',
    actions: [
      { key: 'employees:view', action: 'view' },
      { key: 'employees:create', action: 'create' },
      { key: 'employees:delete', action: 'delete' },
    ],
  },
];

describe('PermissionMatrix', () => {
  it('renders a toggle for every catalog permission', () => {
    render(<PermissionMatrix catalog={catalog} selected={new Set()} onChange={vi.fn()} />);

    // 1 (dashboard) + 3 (employees) = 4 checkboxes
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
  });

  it('reflects the selected set via aria-checked', () => {
    render(
      <PermissionMatrix
        catalog={catalog}
        selected={new Set(['employees:view'])}
        onChange={vi.fn()}
      />
    );

    const viewToggle = screen.getByRole('checkbox', { name: /Nhân viên — Xem/ });
    expect(viewToggle).toHaveAttribute('aria-checked', 'true');

    const createToggle = screen.getByRole('checkbox', { name: /Nhân viên — Tạo mới/ });
    expect(createToggle).toHaveAttribute('aria-checked', 'false');
  });

  it('adds a key when an unchecked toggle is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PermissionMatrix catalog={catalog} selected={new Set()} onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: /Nhân viên — Tạo mới/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as Set<string>;
    expect(next.has('employees:create')).toBe(true);
  });

  it('removes a key when a checked toggle is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PermissionMatrix
        catalog={catalog}
        selected={new Set(['employees:create'])}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole('checkbox', { name: /Nhân viên — Tạo mới/ }));

    const next = onChange.mock.calls[0][0] as Set<string>;
    expect(next.has('employees:create')).toBe(false);
  });

  it('selects all actions of a resource via the row toggle', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PermissionMatrix catalog={catalog} selected={new Set()} onChange={onChange} />);

    // Each resource row has a "Chọn tất cả" button; click the employees one (2nd).
    const selectAllButtons = screen.getAllByText('Chọn tất cả');
    await user.click(selectAllButtons[1]);

    const next = onChange.mock.calls[0][0] as Set<string>;
    expect(next.has('employees:view')).toBe(true);
    expect(next.has('employees:create')).toBe(true);
    expect(next.has('employees:delete')).toBe(true);
  });

  it('disables toggles and hides row select-all when readOnly', () => {
    render(
      <PermissionMatrix catalog={catalog} selected={new Set(['employees:view'])} readOnly />
    );

    screen.getAllByRole('checkbox').forEach((cb) => expect(cb).toBeDisabled());
    expect(screen.queryByText('Chọn tất cả')).not.toBeInTheDocument();
  });
});
