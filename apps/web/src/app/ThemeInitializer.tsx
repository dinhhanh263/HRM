import { useEffect } from 'react';
import { useThemeStore } from '@/stores/theme.store';

export function ThemeInitializer() {
  const theme = useThemeStore((s) => s.theme);
  const mode = useThemeStore((s) => s.mode);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', mode === 'dark');
  }, [theme, mode]);

  return null;
}
