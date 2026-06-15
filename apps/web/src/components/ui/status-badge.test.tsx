import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('renders the default label for a status', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('Hoạt động')).toBeInTheDocument();
  });

  it('prefers an explicit label over the config default', () => {
    render(<StatusBadge status="pending" label="Custom" />);
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('applies the status colors via inline style', () => {
    render(<StatusBadge status="active" />);
    const badge = screen.getByText('Hoạt động');
    expect(badge).toHaveStyle({ backgroundColor: '#DCFCE7', color: '#15803D' });
  });

  it('merges a custom className', () => {
    render(<StatusBadge status="draft" className="ml-2" />);
    expect(screen.getByText('Nháp')).toHaveClass('ml-2');
  });
});
