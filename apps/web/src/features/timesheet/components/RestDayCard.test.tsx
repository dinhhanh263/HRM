import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import { RestDayCard } from './RestDayCard';

describe('RestDayCard', () => {
  beforeEach(() => i18n.changeLanguage('vi'));

  it('names the holiday and points at the holiday OT rate', () => {
    render(
      <RestDayCard kind="holiday" holidayName="Quốc khánh" hasOvertime={false} onCreateOt={() => {}} />,
    );
    expect(screen.getByText(/Quốc khánh/)).toBeInTheDocument();
    expect(screen.getByText(/≥300%/)).toBeInTheDocument();
  });

  it('renders the weekend variant with the weekend OT rate', () => {
    render(<RestDayCard kind="weekend" hasOvertime={false} onCreateOt={() => {}} />);
    expect(screen.getByText(/Ngày nghỉ cuối tuần/)).toBeInTheDocument();
    expect(screen.getByText(/≥200%/)).toBeInTheDocument();
  });

  it('invokes onCreateOt when the CTA is clicked', async () => {
    const onCreateOt = vi.fn();
    render(<RestDayCard kind="holiday" holidayName="Quốc khánh" hasOvertime={false} onCreateOt={onCreateOt} />);
    await userEvent.click(screen.getByRole('button', { name: /tạo đơn tăng ca/i }));
    expect(onCreateOt).toHaveBeenCalledOnce();
  });

  it('shows a confirmation and hides the CTA once an overtime request exists', () => {
    render(<RestDayCard kind="holiday" holidayName="Quốc khánh" hasOvertime onCreateOt={() => {}} />);
    expect(screen.getByText(/đã có đơn tăng ca/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tạo đơn tăng ca/i })).not.toBeInTheDocument();
  });
});
