import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeInitializer } from './ThemeInitializer';
import { useThemeStore } from '@/stores/theme.store';

afterEach(() => {
  useThemeStore.setState({ theme: 'ocean', mode: 'light' });
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeInitializer', () => {
  it('applies the data-theme attribute and dark class in dark mode', () => {
    useThemeStore.setState({ theme: 'sage', mode: 'dark' });
    render(<ThemeInitializer />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('sage');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes the dark class in light mode', () => {
    useThemeStore.setState({ theme: 'ocean', mode: 'light' });
    render(<ThemeInitializer />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('ocean');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
