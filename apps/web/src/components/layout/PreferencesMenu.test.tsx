import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/test-utils';
import { PreferencesMenu } from './PreferencesMenu';
import { useThemeStore } from '@/stores/theme.store';
import i18n from '@/i18n';

beforeEach(() => {
  useThemeStore.setState({ theme: 'ocean', mode: 'light', language: 'vi' });
});
afterEach(async () => {
  useThemeStore.setState({ theme: 'ocean', mode: 'light', language: 'vi' });
  // setLanguage() flips the shared i18n instance — restore it so the Vietnamese
  // aria-label used by other tests doesn't leak to English.
  await i18n.changeLanguage('vi');
});

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: /Tùy chọn hiển thị/i }));
}

describe('PreferencesMenu', () => {
  it('opens the menu and shows language, theme, and appearance options', async () => {
    render(<PreferencesMenu />);
    await openMenu();
    expect(await screen.findByText('Tiếng Việt')).toBeInTheDocument();
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('Ocean Blue')).toBeInTheDocument();
    expect(screen.getByText('Sage Green')).toBeInTheDocument();
  });

  it('changes the language when an option is selected', async () => {
    render(<PreferencesMenu />);
    await openMenu();
    await userEvent.click(await screen.findByText('English'));
    expect(useThemeStore.getState().language).toBe('en');
  });

  it('changes the theme color when an option is selected', async () => {
    render(<PreferencesMenu />);
    await openMenu();
    await userEvent.click(await screen.findByText('Sage Green'));
    expect(useThemeStore.getState().theme).toBe('sage');
  });

  it('switches to dark mode when the dark option is selected', async () => {
    render(<PreferencesMenu />);
    await openMenu();
    await userEvent.click(await screen.findByText('Tối'));
    expect(useThemeStore.getState().mode).toBe('dark');
  });
});
