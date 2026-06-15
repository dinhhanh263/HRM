import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { AssignAssetSheet } from './AssignAssetSheet';

vi.mock('@/features/employees/hooks/useEmployees', () => ({
  useEmployees: () => ({
    data: { data: [{ id: 'e1', fullName: 'Nguyễn Văn A', employeeCode: 'NV001' }] },
    isLoading: false,
    error: null,
  }),
}));

// SignaturePad renders a canvas; jsdom has no 2D backend.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    scale: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

const onSubmit = vi.fn();
const onOpenChange = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AssignAssetSheet signature toggle', () => {
  it('hides the signature pad until sign-on-assign is enabled', async () => {
    render(<AssignAssetSheet open onOpenChange={onOpenChange} onSubmit={onSubmit} />);

    expect(screen.queryByRole('img', { name: /Khu vực ký tên/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /Lấy chữ ký nhận tại chỗ/i }));

    expect(screen.getByRole('img', { name: /Khu vực ký tên/i })).toBeInTheDocument();
  });

  it('removes the pad again when the toggle is switched off', async () => {
    render(<AssignAssetSheet open onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    const toggle = screen.getByRole('checkbox', { name: /Lấy chữ ký nhận tại chỗ/i });

    await userEvent.click(toggle);
    expect(screen.getByRole('img', { name: /Khu vực ký tên/i })).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.queryByRole('img', { name: /Khu vực ký tên/i })).not.toBeInTheDocument();
  });
});
