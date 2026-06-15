import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { AssetsPage } from './AssetsPage';
import { useAuthStore } from '@/stores/auth.store';
import { PERMISSION_KEYS, type UserDto } from '@hrm/shared';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

// Data hooks are stubbed: this test asserts which *view* the page picks by
// permission (adaptive self-service vs management), not data fetching.
const emptyQuery = { data: undefined, isLoading: false, error: null };
vi.mock('../hooks/useAssets', () => ({
  useAssets: () => ({ ...emptyQuery, data: { data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } } }),
  useMyAssets: () => ({ ...emptyQuery, data: [] }),
  useCreateAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAsset: () => ({ mutate: vi.fn(), isPending: false }),
  useExportAssets: () => ({ mutate: vi.fn(), isPending: false }),
  useAcknowledgeHandover: () => ({ mutate: vi.fn(), isPending: false }),
  useDownloadHandoverPdf: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
  useHandoverSignature: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock('../hooks/useAssetCategories', () => ({
  useAssetCategories: () => ({ data: [], isLoading: false, error: null }),
}));

function setUser(permissions: string[]) {
  useAuthStore.setState({
    user: {
      id: 'u1',
      email: 'u1@codecrush.asia',
      fullName: 'User One',
      role: 'EMPLOYEE',
      roleId: 'r1',
      permissions,
      status: 'ACTIVE',
      tenantId: 't1',
    } as unknown as UserDto,
    isAuthenticated: true,
    isLoading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AssetsPage (adaptive)', () => {
  it('renders self-service view for a view-only user (e.g. EMPLOYEE)', () => {
    setUser(['assets:view']);
    render(<AssetsPage />);
    expect(screen.getByRole('heading', { name: 'Tài sản của tôi' })).toBeInTheDocument();
    // No management create button for a view-only user.
    expect(screen.queryByRole('button', { name: /Thêm tài sản/i })).not.toBeInTheDocument();
  });

  it('renders management view when the user holds any management permission', () => {
    setUser(['assets:view', 'assets:create']);
    render(<AssetsPage />);
    expect(screen.getByRole('heading', { name: 'Tài sản' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tài sản của tôi' })).not.toBeInTheDocument();
    // header CTA + empty-state CTA, both Can-gated on assets:create.
    expect(screen.getAllByRole('button', { name: /Thêm tài sản/i }).length).toBeGreaterThan(0);
  });

  it('gives MANAGER/HR the management view via export permission alone', () => {
    setUser(['assets:view', 'assets:export']);
    render(<AssetsPage />);
    expect(screen.getByRole('heading', { name: 'Tài sản' })).toBeInTheDocument();
    // export grants management view but not the create button (no assets:create).
    expect(screen.queryByRole('button', { name: /Thêm tài sản/i })).not.toBeInTheDocument();
  });

  it('shows the create CTA for a full-permission user in management view', () => {
    setUser([...PERMISSION_KEYS]);
    render(<AssetsPage />);
    expect(screen.getByRole('heading', { name: 'Tài sản' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Thêm tài sản/i }).length).toBeGreaterThan(0);
  });
});
