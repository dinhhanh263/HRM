import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { EmployeeStatusBadge } from './EmployeeStatusBadge';

describe('EmployeeStatusBadge', () => {
  it('renders the translated label for ACTIVE', () => {
    render(<EmployeeStatusBadge status="ACTIVE" />);
    expect(screen.getByText('Đang làm việc')).toBeInTheDocument();
  });

  it('applies the status color for each status', () => {
    const { rerender } = render(<EmployeeStatusBadge status="ACTIVE" />);
    expect(screen.getByText('Đang làm việc')).toHaveStyle({ color: '#15803D' });

    rerender(<EmployeeStatusBadge status="TERMINATED" />);
    expect(screen.getByText(/nghỉ việc/i)).toHaveStyle({ color: '#6B7280' });
  });
});
