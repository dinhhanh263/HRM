import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { LeaveStatusBadge } from './LeaveStatusBadge';

describe('LeaveStatusBadge', () => {
  it('renders the Vietnamese label for PENDING', () => {
    render(<LeaveStatusBadge status="PENDING" />);
    expect(screen.getByText('Chờ duyệt')).toBeInTheDocument();
  });

  it('renders the Vietnamese label for APPROVED', () => {
    render(<LeaveStatusBadge status="APPROVED" />);
    expect(screen.getByText('Đã duyệt')).toBeInTheDocument();
  });

  it('maps CANCELLED to a neutral badge label', () => {
    render(<LeaveStatusBadge status="CANCELLED" />);
    expect(screen.getByText('Đã hủy')).toBeInTheDocument();
  });
});
