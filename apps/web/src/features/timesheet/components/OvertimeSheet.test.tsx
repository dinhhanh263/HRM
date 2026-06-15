import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import i18n from '@/i18n';
import { OvertimeSheet } from './OvertimeSheet';
import { currentDateKey } from '../utils';

// The sheet only needs the mutation to be a no-op for these layout/prop tests.
vi.mock('../hooks/useOvertime', () => ({
  useSubmitOvertime: () => ({ mutate: vi.fn(), isPending: false }),
  useResubmitOvertime: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('OvertimeSheet workDate seeding', () => {
  beforeEach(() => i18n.changeLanguage('vi'));

  it('pre-fills workDate from initialDate when provided', () => {
    render(<OvertimeSheet open initialDate="2026-09-02" onOpenChange={() => {}} />);
    expect(screen.getByLabelText(/ngày làm/i)).toHaveValue('2026-09-02');
  });

  it('defaults workDate to today (GMT+7) when no initialDate is given', () => {
    render(<OvertimeSheet open onOpenChange={() => {}} />);
    expect(screen.getByLabelText(/ngày làm/i)).toHaveValue(currentDateKey());
  });
});

describe('OvertimeSheet date validation at the VN day boundary', () => {
  beforeEach(() => i18n.changeLanguage('vi'));
  afterEach(() => {
    vi.useRealTimers();
  });

  // 2026-06-04T18:30Z is 2026-06-05 01:30 in GMT+7: a holiday checked-in on
  // early in the morning. The UTC day (06-04) lags the business day (06-05) by
  // one, so the old UTC clock wrongly flagged today's GMT+7 date as "future"
  // and disabled submit. The form must accept it.
  it('keeps submit enabled for today (GMT+7) during the 00:00–07:00 VN window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-04T18:30:00.000Z'));

    expect(currentDateKey()).toBe('2026-06-05');

    render(<OvertimeSheet open initialDate="2026-06-05" onOpenChange={() => {}} />);
    expect(screen.getByLabelText(/ngày làm/i)).toHaveValue('2026-06-05');

    // A valid hours value is required for canSubmit; date is the field under test.
    fireEvent.change(screen.getByLabelText(/số giờ/i), { target: { value: '4' } });

    expect(screen.getByRole('button', { name: /gửi đơn/i })).toBeEnabled();
  });
});
