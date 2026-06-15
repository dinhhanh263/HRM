import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { MyAssetsView } from './MyAssetsView';

const mutate = vi.fn();

vi.mock('../hooks/useAssets', () => ({
  useMyAssets: () => mockMyAssets(),
  useAcknowledgeHandover: () => ({ mutate, isPending: false }),
  useHandoverSignature: () => ({ data: undefined, isLoading: false, isError: false }),
}));

let mockMyAssets: () => { data: unknown; isLoading: boolean; error: unknown };

function assetWithAck(ackStatus: 'PENDING' | 'SIGNED') {
  return {
    id: 'a1',
    assetCode: 'TS001',
    name: 'MacBook Pro',
    status: 'ASSIGNED',
    location: 'HCM',
    category: { id: 'c1', name: 'Laptop' },
    currentAssignment: {
      id: 'as1',
      assignedAt: '2026-06-01T00:00:00.000Z',
      ackStatus,
      hasSignature: ackStatus === 'SIGNED',
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MyAssetsView pending handover', () => {
  it('shows the sign button when the current assignment is PENDING', () => {
    mockMyAssets = () => ({ data: [assetWithAck('PENDING')], isLoading: false, error: null });
    render(<MyAssetsView />);

    expect(screen.getByText(/Phiếu bàn giao chờ ký/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ký xác nhận/i })).toBeInTheDocument();
  });

  it('hides the sign button when the assignment is already SIGNED', () => {
    mockMyAssets = () => ({ data: [assetWithAck('SIGNED')], isLoading: false, error: null });
    render(<MyAssetsView />);

    expect(screen.queryByText(/Phiếu bàn giao chờ ký/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ký xác nhận/i })).not.toBeInTheDocument();
  });
});
