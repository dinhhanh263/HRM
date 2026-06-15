import { useTranslation } from 'react-i18next';
import { Check, Globe, Palette, Sun, Moon, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useThemeStore } from '@/stores/theme.store';

const LANGUAGES = [
  { value: 'vi', label: 'Tiếng Việt', short: 'VI' },
  { value: 'en', label: 'English', short: 'EN' },
] as const;

const THEMES = [
  { value: 'ocean', label: 'Ocean Blue', swatch: 'bg-swatch-ocean' },
  { value: 'sage', label: 'Sage Green', swatch: 'bg-swatch-sage' },
] as const;

const MODES = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
] as const;

interface OptionRowProps {
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}

function OptionRow({ active, onSelect, children }: OptionRowProps) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors duration-100',
        'outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-text-secondary hover:bg-surface-alt hover:text-text-primary'
      )}
    >
      {children}
      <Check
        size={15}
        className={cn('ml-auto shrink-0', active ? 'opacity-100' : 'opacity-0')}
      />
    </button>
  );
}

export function PreferencesMenu() {
  const { t } = useTranslation('nav');
  const { theme, mode, language, setTheme, setMode, setLanguage } = useThemeStore();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label={t('header.preferences')}>
          <SlidersHorizontal size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 p-1.5">
        {/* Language */}
        <DropdownMenuLabel className="flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          <Globe size={13} />
          {t('preferences.language')}
        </DropdownMenuLabel>
        <div className="space-y-0.5 px-0.5 py-1">
          {LANGUAGES.map((l) => (
            <OptionRow
              key={l.value}
              active={language === l.value}
              onSelect={() => setLanguage(l.value)}
            >
              <span className="flex size-5 items-center justify-center rounded bg-surface-alt text-[10px] font-semibold text-text-secondary">
                {l.short}
              </span>
              {l.label}
            </OptionRow>
          ))}
        </div>

        <DropdownMenuSeparator />

        {/* Theme color */}
        <DropdownMenuLabel className="flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          <Palette size={13} />
          {t('preferences.themeColor')}
        </DropdownMenuLabel>
        <div className="space-y-0.5 px-0.5 py-1">
          {THEMES.map((item) => (
            <OptionRow
              key={item.value}
              active={theme === item.value}
              onSelect={() => setTheme(item.value)}
            >
              <span
                className={cn(
                  'size-4 shrink-0 rounded-full ring-1 ring-inset ring-black/10',
                  item.swatch
                )}
              />
              {item.label}
            </OptionRow>
          ))}
        </div>

        <DropdownMenuSeparator />

        {/* Appearance mode */}
        <DropdownMenuLabel className="px-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          {t('preferences.appearance')}
        </DropdownMenuLabel>
        <div className="space-y-0.5 px-0.5 py-1">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <OptionRow key={m.value} active={mode === m.value} onSelect={() => setMode(m.value)}>
                <Icon size={15} className="shrink-0" />
                {t(`preferences.${m.value}`)}
              </OptionRow>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
