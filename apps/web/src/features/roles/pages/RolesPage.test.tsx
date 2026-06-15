import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import type { PermissionCatalogGroup, RoleDto, RoleListItemDto } from '@hrm/shared';
import i18n from '@/i18n';
import { RolesPage } from './RolesPage';

const catalog: PermissionCatalogGroup[] = [
  {
    resource: 'employees',
    actions: [
      { key: 'employees:view', action: 'view' },
      { key: 'employees:create', action: 'create' },
    ],
  },
];

const roleList: RoleListItemDto[] = [
  {
    id: 'r-sys',
    key: 'super_admin',
    name: 'Super Admin',
    description: null,
    isSystem: true,
    permissionCount: 2,
    userCount: 1,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'r-custom',
    key: 'qa_lead',
    name: 'QA Lead',
    description: 'Quản lý QA',
    isSystem: false,
    permissionCount: 1,
    userCount: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'r-used',
    key: 'with_users',
    name: 'Role With Users',
    description: null,
    isSystem: false,
    permissionCount: 1,
    userCount: 3,
    createdAt: '',
    updatedAt: '',
  },
];

const detailById: Record<string, RoleDto> = {
  'r-sys': {
    id: 'r-sys',
    tenantId: 't1',
    key: 'super_admin',
    name: 'Super Admin',
    description: null,
    isSystem: true,
    permissions: ['employees:view', 'employees:create'],
    createdAt: '',
    updatedAt: '',
  },
  'r-custom': {
    id: 'r-custom',
    tenantId: 't1',
    key: 'qa_lead',
    name: 'QA Lead',
    description: 'Quản lý QA',
    isSystem: false,
    permissions: ['employees:view'],
    createdAt: '',
    updatedAt: '',
  },
  'r-used': {
    id: 'r-used',
    tenantId: 't1',
    key: 'with_users',
    name: 'Role With Users',
    description: null,
    isSystem: false,
    permissions: ['employees:view'],
    createdAt: '',
    updatedAt: '',
  },
};

const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ can: () => true, canAny: () => true, canAll: () => true }),
}));

vi.mock('../hooks/useRoles', () => ({
  useRoles: () => ({ data: roleList, isLoading: false, error: null }),
  useRole: (id?: string) => ({ data: id ? detailById[id] : undefined }),
  usePermissionsCatalog: () => ({ data: catalog }),
  useCreateRole: () => ({ mutate: createMutate, isPending: false }),
  useUpdateRole: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteRole: () => ({ mutate: deleteMutate, isPending: false }),
}));

describe('RolesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists all roles with a lock marker on system roles', () => {
    render(<RolesPage />);

    // System role name is shown localized (vi) from its key, not the DB value.
    // Appears in both the list and the default-selected detail header.
    expect(screen.getAllByText('Quản trị hệ thống').length).toBeGreaterThan(0);
    expect(screen.getByText('QA Lead')).toBeInTheDocument();
    expect(screen.getByText('Role With Users')).toBeInTheDocument();
  });

  it('lets a system role edit permissions but locks its name and deletion', () => {
    render(<RolesPage />);

    // System role is selected by default (first in list).
    expect(screen.getByText('Vai trò hệ thống')).toBeInTheDocument();
    expect(screen.getByText(/không thể đổi tên hoặc xóa/i)).toBeInTheDocument();

    // Permission matrix is editable and the Save button is shown...
    screen.getAllByRole('checkbox').forEach((cb) => expect(cb).not.toBeDisabled());
    expect(screen.getByText('Lưu thay đổi')).toBeInTheDocument();

    // ...but the name field is locked and there's no Delete button.
    expect(screen.getByLabelText('Tên vai trò')).toBeDisabled();
    expect(screen.queryByText('Xóa')).not.toBeInTheDocument();
  });

  it('makes the matrix editable with a Save button for a custom role', async () => {
    const user = userEvent.setup();
    render(<RolesPage />);

    await user.click(screen.getByText('QA Lead'));

    await waitFor(() => {
      expect(screen.getByText('Lưu thay đổi')).toBeInTheDocument();
    });
    screen.getAllByRole('checkbox').forEach((cb) => expect(cb).not.toBeDisabled());
  });

  it('enables Save only after a change is made', async () => {
    const user = userEvent.setup();
    render(<RolesPage />);

    await user.click(screen.getByText('QA Lead'));

    const saveButton = await screen.findByText('Lưu thay đổi');
    expect(saveButton.closest('button')).toBeDisabled();

    // Toggle a permission → becomes dirty → Save enabled.
    await user.click(screen.getByRole('checkbox', { name: /Nhân viên — Tạo mới/ }));
    expect(saveButton.closest('button')).not.toBeDisabled();
  });

  it('blocks deletion when the role still has users assigned', async () => {
    const user = userEvent.setup();
    render(<RolesPage />);

    await user.click(screen.getByText('Role With Users'));
    await user.click(await screen.findByText('Xóa'));

    // Confirmation dialog explains the block; the confirm action is disabled.
    const confirm = await screen.findByText('Xóa vai trò?');
    expect(confirm).toBeInTheDocument();
    expect(screen.getByText(/đang có 3 người dùng/i)).toBeInTheDocument();
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it('opens the create sheet when the create button is clicked', async () => {
    const user = userEvent.setup();
    render(<RolesPage />);

    await user.click(screen.getByText('Thêm vai trò'));

    expect(await screen.findByText('Tạo vai trò mới')).toBeInTheDocument();
  });

  it('localizes a system role name and description from its key', () => {
    render(<RolesPage />);

    // System role is selected by default. Its DB name is "Super Admin" and its
    // DB description is null, yet the screen shows the localized (vi) strings.
    expect(screen.getAllByText('Quản trị hệ thống').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Mô tả')).toHaveValue(
      'Toàn quyền cấu hình hệ thống và phân quyền'
    );
  });

  it('keeps a custom role name exactly as entered (never translated)', async () => {
    const user = userEvent.setup();
    render(<RolesPage />);

    await user.click(screen.getByText('QA Lead'));

    // Custom role: name field reflects the DB value verbatim.
    expect(await screen.findByLabelText('Tên vai trò')).toHaveValue('QA Lead');
    expect(screen.getByLabelText('Mô tả')).toHaveValue('Quản lý QA');
  });

  it('saves a system role permission change without renaming it', async () => {
    const user = userEvent.setup();
    render(<RolesPage />);

    // System role selected by default; toggle a permission to make it dirty.
    await user.click(screen.getByRole('checkbox', { name: /Nhân viên — Tạo mới/ }));
    await user.click(screen.getByText('Lưu thay đổi'));

    // The payload must carry the original DB name (not the localized label),
    // otherwise the backend rejects the save as an illegal system-role rename.
    expect(updateMutate).toHaveBeenCalledTimes(1);
    const payload = updateMutate.mock.calls[0][0];
    expect(payload.name).toBe('Super Admin');
    expect(payload.description).toBeNull();
  });

  describe('in English', () => {
    beforeEach(async () => {
      await i18n.changeLanguage('en');
    });
    afterEach(async () => {
      await i18n.changeLanguage('vi');
    });

    it('shows the English system role name and description', () => {
      render(<RolesPage />);

      expect(screen.getAllByText('Super Admin').length).toBeGreaterThan(0);
      expect(screen.queryByText('Quản trị hệ thống')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Description')).toHaveValue(
        'Full control over system configuration and permissions'
      );
    });
  });
});
