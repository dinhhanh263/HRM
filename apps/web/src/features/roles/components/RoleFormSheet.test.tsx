import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { RoleFormSheet } from './RoleFormSheet';
import type { PermissionCatalogGroup } from '@hrm/shared';

const catalog: PermissionCatalogGroup[] = [
  {
    resource: 'employees',
    actions: [
      { key: 'employees:view', action: 'view' },
      { key: 'employees:create', action: 'create' },
    ],
  },
];

const onSubmit = vi.fn();
const onOpenChange = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

function renderSheet() {
  return render(
    <RoleFormSheet open onOpenChange={onOpenChange} catalog={catalog} onSubmit={onSubmit} />
  );
}

describe('RoleFormSheet', () => {
  it('renders the create-role form', () => {
    renderSheet();
    expect(screen.getByText('Tạo vai trò mới')).toBeInTheDocument();
    expect(screen.getByLabelText(/Tên vai trò/i)).toBeInTheDocument();
  });

  it('submits the trimmed name and description', async () => {
    renderSheet();
    await userEvent.type(screen.getByLabelText(/Tên vai trò/i), 'Trưởng nhóm');
    await userEvent.type(screen.getByLabelText(/Mô tả/i), 'Quản lý nhóm tuyển dụng');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo vai trò' }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Trưởng nhóm',
      description: 'Quản lý nhóm tuyển dụng',
      permissions: [],
    });
  });

  it('blocks submission and shows an error when the name is empty', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo vai trò' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Vui lòng nhập tên vai trò')).toBeInTheDocument();
  });

  it('closes when cancel is clicked', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
