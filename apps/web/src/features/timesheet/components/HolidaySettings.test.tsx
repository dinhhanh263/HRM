import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import i18n from '@/i18n';
import { HolidaySettings } from './HolidaySettings';

// Mutable auth state so each test picks the permission set under test.
const authState: { user: { permissions: string[] } } = { user: { permissions: [] } };
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector?: (s: typeof authState) => unknown) =>
    selector ? selector(authState) : authState,
}));

// This component test is about RBAC affordances, not fetching/mutations.
vi.mock('../hooks/useHolidays', () => ({
  useHolidays: () => ({ data: [], isLoading: false }),
  useCreateHoliday: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateHoliday: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteHoliday: () => ({ mutate: vi.fn(), isPending: false }),
  useSeedHolidays: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('HolidaySettings seed button RBAC', () => {
  beforeEach(() => {
    authState.user.permissions = [];
    i18n.changeLanguage('en');
  });

  it('shows the seed button to a user with timesheet:configure', () => {
    authState.user.permissions = ['timesheet:view', 'timesheet:configure'];
    render(<HolidaySettings />);

    const year = new Date().getUTCFullYear();
    expect(
      screen.getByRole('button', { name: `Load VN holidays for ${year}` }),
    ).toBeInTheDocument();
  });

  it('hides the seed button from a user without timesheet:configure', () => {
    authState.user.permissions = ['timesheet:view'];
    render(<HolidaySettings />);

    const year = new Date().getUTCFullYear();
    expect(
      screen.queryByRole('button', { name: `Load VN holidays for ${year}` }),
    ).not.toBeInTheDocument();
  });
});
