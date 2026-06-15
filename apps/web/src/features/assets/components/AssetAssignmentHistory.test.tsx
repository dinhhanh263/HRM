import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import type { AssetAssignmentDto } from '@hrm/shared';
import { AssetAssignmentHistory } from './AssetAssignmentHistory';

const mutate = vi.fn();

vi.mock('../hooks/useAssets', () => ({
  useDownloadHandoverPdf: () => ({ mutate, isPending: false, variables: undefined }),
  useHandoverSignature: () => ({ data: undefined, isLoading: false, isError: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function assignment(overrides: Partial<AssetAssignmentDto> = {}): AssetAssignmentDto {
  return {
    id: 'as1',
    assetId: 'a1',
    employeeId: 'e1',
    status: 'ACTIVE',
    assignedAt: '2026-06-01T00:00:00.000Z',
    assignedById: 'hr1',
    conditionOut: 'GOOD',
    returnedAt: null,
    returnedById: null,
    conditionIn: null,
    note: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    employee: { id: 'e1', fullName: 'Nguyễn Văn A', employeeCode: 'EMP-001', avatar: null },
    assignedBy: { id: 'hr1', fullName: 'HR Manager', employeeCode: 'HR-001', avatar: null },
    returnedBy: null,
    ackStatus: 'PENDING',
    ackMethod: null,
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    hasSignature: false,
    ...overrides,
  };
}

describe('AssetAssignmentHistory ack status', () => {
  it('shows an "awaiting signature" badge for a PENDING handover', () => {
    render(<AssetAssignmentHistory assignments={[assignment()]} assetCode="LP-001" />);

    // "Chờ ký" appears both in the ack badge and the footer status line.
    expect(screen.getAllByText(/Chờ ký/i).length).toBeGreaterThan(0);
  });

  it('shows the signed badge with method and timestamp for a SIGNED handover', () => {
    render(
      <AssetAssignmentHistory
        assignments={[
          assignment({
            ackStatus: 'SIGNED',
            ackMethod: 'IN_APP',
            acknowledgedAt: '2026-06-02T08:30:00.000Z',
            hasSignature: true,
          }),
        ]}
        assetCode="LP-001"
      />,
    );

    // "Đã ký" appears in the ack badge; "Đã ký lúc …" in the footer line.
    expect(screen.getAllByText(/Đã ký/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Ký trên ứng dụng/i)).toBeInTheDocument();
  });

  it('downloads the handover PDF with the assignment id and asset code', async () => {
    const user = userEvent.setup();
    render(<AssetAssignmentHistory assignments={[assignment()]} assetCode="LP-001" />);

    await user.click(screen.getByRole('button', { name: /Xuất biên bản/i }));

    expect(mutate).toHaveBeenCalledWith(
      { assignmentId: 'as1', assetCode: 'LP-001' },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });
});
