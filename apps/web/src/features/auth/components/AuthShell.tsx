import { useTranslation } from 'react-i18next';
import { Globe, Sun, Moon, Users } from 'lucide-react';
import { useThemeStore } from '@/stores/theme.store';

/**
 * Shared two-panel auth chrome: brand panel on the left and a content panel on
 * the right with theme / language / mode controls. Used by the set-password,
 * forgot-password, and reset-password pages so they stay visually identical to
 * the login screen without duplicating the layout.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('auth');
  const { theme, mode, language, setTheme, toggleMode, setLanguage } = useThemeStore();
  const isDark = mode === 'dark';
  const toggleLang = () => setLanguage(language === 'vi' ? 'en' : 'vi');

  return (
    <div className="flex min-h-screen font-sans">
      {/* Brand Panel */}
      <div className="hidden md:flex flex-col justify-between w-[45%] min-h-screen bg-primary p-12 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/[0.08] rounded-full" />
        <div className="absolute -bottom-15 -left-10 w-60 h-60 bg-white/[0.06] rounded-full" />

        <div className="flex items-center gap-2.5 relative z-10">
          <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div className="text-lg font-bold text-white tracking-tight">
            HRM <span className="font-normal opacity-75">by CodeCrush</span>
          </div>
        </div>

        <div className="relative z-10">
          <div className="text-[28px] font-bold text-white leading-tight tracking-tight mb-4 whitespace-pre-line">
            {t('brand.headline')}
          </div>
          <div className="text-[15px] text-white/75 leading-relaxed max-w-[340px]">
            {t('brand.sub')}
          </div>
        </div>

        <div className="relative z-10 text-[13px] text-white/50">{t('brand.footer')}</div>
      </div>

      {/* Content Panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-12 px-8 bg-background relative">
        {/* Top controls */}
        <div className="absolute top-5 right-5 flex items-center gap-2">
          <div className="flex items-center bg-surface-alt border border-border rounded-full p-[3px] gap-0.5">
            <button
              onClick={() => setTheme('ocean')}
              className={`w-[22px] h-[22px] rounded-full bg-swatch-ocean border-2 cursor-pointer transition-all duration-150 ${
                theme === 'ocean' ? 'border-text-primary scale-110' : 'border-transparent'
              }`}
              title="Ocean Blue"
            />
            <button
              onClick={() => setTheme('sage')}
              className={`w-[22px] h-[22px] rounded-full bg-swatch-sage border-2 cursor-pointer transition-all duration-150 ${
                theme === 'sage' ? 'border-text-primary scale-110' : 'border-transparent'
              }`}
              title="Sage Green"
            />
          </div>

          <button
            onClick={toggleLang}
            className="h-8 px-3 rounded-md border border-border bg-surface text-text-secondary font-sans text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-all duration-150 hover:bg-surface-alt hover:border-border-strong"
          >
            <Globe className="w-[13px] h-[13px]" />
            {language.toUpperCase()}
          </button>

          <button
            onClick={toggleMode}
            className="h-8 px-3 rounded-md border border-border bg-surface text-text-secondary font-sans text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-all duration-150 hover:bg-surface-alt hover:border-border-strong"
          >
            {isDark ? <Moon className="w-[13px] h-[13px]" /> : <Sun className="w-[13px] h-[13px]" />}
            {isDark ? t('preferences.dark', { ns: 'nav' }) : t('preferences.light', { ns: 'nav' })}
          </button>
        </div>

        <div className="w-full max-w-[380px]">{children}</div>
      </div>
    </div>
  );
}
