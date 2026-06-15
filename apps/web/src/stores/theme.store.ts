import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '@/i18n';

type Theme = 'ocean' | 'sage';
type Mode = 'light' | 'dark';
type Language = 'vi' | 'en';

interface ThemeState {
  theme: Theme;
  mode: Mode;
  language: Language;
  // SPEC-036: true khi user TỰ chọn ngôn ngữ — tenant default không được ghi
  // đè lựa chọn cá nhân nữa.
  languageExplicit: boolean;
  setTheme: (theme: Theme) => void;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
  setLanguage: (language: Language) => void;
  /** Áp ngôn ngữ mặc định của tenant — chỉ khi user chưa tự chọn. */
  applyTenantDefaultLanguage: (language: Language) => void;
}

function applyLanguage(language: Language) {
  document.documentElement.lang = language;
  i18n.changeLanguage(language);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'ocean',
      mode: 'light',
      language: 'vi',
      languageExplicit: false,
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      },
      setMode: (mode) => {
        document.documentElement.classList.toggle('dark', mode === 'dark');
        set({ mode });
      },
      toggleMode: () => {
        const newMode = get().mode === 'light' ? 'dark' : 'light';
        document.documentElement.classList.toggle('dark', newMode === 'dark');
        set({ mode: newMode });
      },
      setLanguage: (language) => {
        applyLanguage(language);
        set({ language, languageExplicit: true });
      },
      applyTenantDefaultLanguage: (language) => {
        if (get().languageExplicit || get().language === language) return;
        applyLanguage(language);
        set({ language });
      },
    }),
    {
      name: 'hrm-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.setAttribute('data-theme', state.theme);
          document.documentElement.classList.toggle('dark', state.mode === 'dark');
          document.documentElement.lang = state.language;
        }
      },
    }
  )
);
