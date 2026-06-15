import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/test-utils';
import { AssetFormSheet, toAssetPayload, type AssetFormData } from './AssetFormSheet';

vi.mock('../hooks/useAssetCategories', () => ({
  useAssetCategories: () => ({
    data: [{ id: 'c1', name: 'Máy tính xách tay', code: 'LAPTOP', icon: null }],
    isLoading: false,
    error: null,
  }),
}));

const onSubmit = vi.fn();
const onOpenChange = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

function renderSheet() {
  return render(
    <AssetFormSheet open onOpenChange={onOpenChange} onSubmit={onSubmit} />,
  );
}

describe('AssetFormSheet validation', () => {
  it('blocks submit and surfaces required-field errors when empty', async () => {
    renderSheet();
    await userEvent.click(screen.getByRole('button', { name: 'Tạo tài sản' }));

    await waitFor(() => {
      expect(screen.getByText('Vui lòng chọn loại tài sản')).toBeInTheDocument();
    });
    expect(screen.getByText('Vui lòng nhập mã tài sản')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập tên tài sản')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects an asset code with invalid characters', async () => {
    renderSheet();
    await userEvent.type(screen.getByLabelText(/Mã tài sản/i), 'lower case!');
    await userEvent.type(screen.getByLabelText(/Tên tài sản/i), 'MacBook');
    await userEvent.click(screen.getByRole('button', { name: 'Tạo tài sản' }));

    await waitFor(() => {
      expect(
        screen.getByText('Mã chỉ gồm chữ in hoa, số, gạch ngang hoặc gạch dưới'),
      ).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('toAssetPayload', () => {
  const base: AssetFormData = {
    categoryId: 'c1',
    assetCode: 'LP-001',
    name: 'MacBook Pro',
    location: '',
    serialNumber: '',
    brand: '',
    model: '',
    condition: '',
    purchaseDate: '',
    purchaseCost: '',
    warrantyEndDate: '',
    vendor: '',
    note: '',
  };

  it('coerces blank optionals to null and parses cost to a number', () => {
    const payload = toAssetPayload({ ...base, purchaseCost: '45000000', location: '  Tầng 3  ' });
    expect(payload.purchaseCost).toBe(45000000);
    expect(payload.location).toBe('Tầng 3');
    expect(payload.serialNumber).toBeNull();
    expect(payload.condition).toBeNull();
    expect(payload.purchaseDate).toBeNull();
  });

  it('keeps cost null when left blank', () => {
    expect(toAssetPayload(base).purchaseCost).toBeNull();
  });
});
