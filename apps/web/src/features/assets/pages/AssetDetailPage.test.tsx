import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { AssetDetailPage } from './AssetDetailPage';
import type { AssetDetailDto } from '@hrm/shared';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate, useParams: () => ({ id: 'a1' }) };
});

const asset = {
  id: 'a1',
  assetCode: 'LAPTOP-001',
  name: 'MacBook Pro 14"',
  status: 'AVAILABLE',
  brand: 'Apple',
  model: 'A2779',
  serialNumber: 'SN-12345',
  condition: 'NEW',
  purchaseCost: 45000000,
  purchaseDate: '2026-01-15',
  warrantyEndDate: '2028-01-15',
  vendor: 'TGDD',
  location: 'Tầng 3',
  note: null,
  category: { id: 'c1', name: 'Máy tính xách tay', code: 'LAPTOP', icon: null },
  currentAssignment: null,
  assignments: [],
  maintenances: [],
} as unknown as AssetDetailDto;

const updateMutate = vi.fn();
let detailState = {
  data: asset as AssetDetailDto | undefined,
  isLoading: false,
  error: null as unknown,
};

vi.mock('../hooks/useAssets', () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useAsset: () => detailState,
    useUpdateAsset: () => ({ mutate: updateMutate, isPending: false }),
    useAssignAsset: mutation,
    useReturnAsset: mutation,
    useStartMaintenance: mutation,
    useCompleteMaintenance: mutation,
    useDisposeAsset: mutation,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  detailState = { data: asset, isLoading: false, error: null };
});

describe('AssetDetailPage', () => {
  it('renders the asset profile and detail fields', () => {
    render(<AssetDetailPage />);
    expect(screen.getByRole('heading', { name: 'MacBook Pro 14"' })).toBeInTheDocument();
    expect(screen.getByText('LAPTOP-001')).toBeInTheDocument();
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('SN-12345')).toBeInTheDocument();
    expect(screen.getByText('Máy tính xách tay')).toBeInTheDocument();
    // purchaseCost rendered grouped with vi-VN separators
    expect(screen.getByText('45.000.000')).toBeInTheDocument();
  });

  it('shows a loading state while fetching', () => {
    detailState = { data: undefined, isLoading: true, error: null };
    render(<AssetDetailPage />);
    expect(screen.getByText('Đang tải dữ liệu...')).toBeInTheDocument();
  });

  it('shows a not-found state on error', () => {
    detailState = { data: undefined, isLoading: false, error: new Error('boom') };
    render(<AssetDetailPage />);
    expect(screen.getByText('Không tìm thấy tài sản')).toBeInTheDocument();
  });

  it('navigates back to the asset list', async () => {
    render(<AssetDetailPage />);
    await userEvent.click(screen.getByRole('button', { name: /Quay lại/i }));
    expect(navigate).toHaveBeenCalledWith('/assets');
  });
});
