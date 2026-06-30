import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useLogin } from '../hooks/useAuth';
import { useThemeStore } from '@/stores/theme.store';
import { CORE_MODULE_COUNT } from '@/config/nav';
import logoUrl from '@/assets/logo.svg';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  Globe,
  Sun,
  Moon,
  Check,
} from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('validation.email'),
  password: z.string().min(1, 'validation.password'),
  tenantSlug: z.string(),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { t } = useTranslation('auth');
  const { theme, mode, language, setTheme, toggleMode, setLanguage } = useThemeStore();
  const isDark = mode === 'dark';
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const login = useLogin();

  // A failed Google SSO attempt redirects back here with ?error=... We show a
  // single neutral message (never revealing which step failed) and a distinct
  // hint when SSO simply isn't configured on this deployment.
  const [searchParams] = useSearchParams();
  const ssoError = searchParams.get('error');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      tenantSlug: 'codecrush',
    },
  });

  const onSubmit = (data: LoginFormData) => {
    login.mutate({ ...data, rememberMe });
  };

  const toggleLang = () => setLanguage(language === 'vi' ? 'en' : 'vi');

  return (
    <div className="flex min-h-screen font-sans">
      {/* Brand Panel */}
      <div className="hidden md:flex flex-col justify-between w-[45%] min-h-screen bg-primary p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/[0.08] rounded-full" />
        <div className="absolute -bottom-15 -left-10 w-60 h-60 bg-white/[0.06] rounded-full" />

        {/* Logo */}
        <div className="flex items-center gap-2.5 relative z-10">
          <div className="w-9 h-9 bg-brand rounded-lg flex items-center justify-center">
            <img src={logoUrl} alt="" aria-hidden="true" className="w-6 h-6" />
          </div>
          <div className="text-lg font-bold text-white tracking-tight">
            HRM <span className="font-normal opacity-75">by CodeCrush</span>
          </div>
        </div>

        {/* Main copy */}
        <div className="relative z-10">
          <div className="text-[28px] font-bold text-white leading-tight tracking-tight mb-4 whitespace-pre-line">
            {t('brand.headline')}
          </div>
          <div className="text-[15px] text-white/75 leading-relaxed max-w-[340px]">
            {t('brand.sub')}
          </div>

          {/* Stats */}
          <div className="flex gap-8 mt-10">
            <div>
              <div className="text-[22px] font-bold text-white">{CORE_MODULE_COUNT}</div>
              <div className="text-[13px] text-white/65 mt-0.5">{t('brand.modules')}</div>
            </div>
            <div>
              <div className="text-[22px] font-bold text-white">VI/EN</div>
              <div className="text-[13px] text-white/65 mt-0.5">{t('brand.bilingual')}</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-[13px] text-white/50">
          {t('brand.footer')}
        </div>
      </div>

      {/* Form Panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-12 px-8 bg-background relative">
        {/* Top controls */}
        <div className="absolute top-5 right-5 flex items-center gap-2">
          {/* Theme picker */}
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

          {/* Language toggle */}
          <button
            onClick={toggleLang}
            className="h-8 px-3 rounded-md border border-border bg-surface text-text-secondary font-sans text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-all duration-150 hover:bg-surface-alt hover:border-border-strong"
          >
            <Globe className="w-[13px] h-[13px]" />
            {language.toUpperCase()}
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={toggleMode}
            className="h-8 px-3 rounded-md border border-border bg-surface text-text-secondary font-sans text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-all duration-150 hover:bg-surface-alt hover:border-border-strong"
          >
            {isDark ? (
              <Moon className="w-[13px] h-[13px]" />
            ) : (
              <Sun className="w-[13px] h-[13px]" />
            )}
            {isDark ? t('preferences.dark', { ns: 'nav' }) : t('preferences.light', { ns: 'nav' })}
          </button>
        </div>

        {/* Login Form */}
        <div className="w-full max-w-[380px]">
          {/* Header */}
          <div className="mb-8">
            <div className="text-[22px] font-bold text-text-primary tracking-tight mb-1.5">
              {t('login.title')}
            </div>
            <div className="text-sm text-text-secondary">{t('login.subtitle')}</div>
          </div>

          {/* Error alert */}
          {login.error && (
            <div className="flex items-start gap-2.5 p-3 px-3.5 bg-danger-light border border-danger/40 rounded-lg mb-5 text-[13px] text-danger">
              <AlertCircle className="w-[15px] h-[15px] shrink-0 mt-0.5" />
              <span>{t('login.errLogin')}</span>
            </div>
          )}

          {/* Google SSO error (neutral — no account/tenant enumeration) */}
          {ssoError && (
            <div className="flex items-start gap-2.5 p-3 px-3.5 bg-danger-light border border-danger/40 rounded-lg mb-5 text-[13px] text-danger">
              <AlertCircle className="w-[15px] h-[15px] shrink-0 mt-0.5" />
              <span>
                {ssoError === 'sso_unavailable' ? t('login.ssoUnavailable') : t('login.ssoError')}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Email field */}
            <div className="mb-[18px]">
              <label className="block text-[13px] font-medium text-text-primary mb-1.5">
                {t('login.email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <input
                  type="email"
                  placeholder="name@company.com"
                  autoComplete="email"
                  {...register('email')}
                  className={`w-full h-10 pl-10 pr-4 border rounded-lg bg-surface text-text-primary font-sans text-sm outline-none transition-all duration-150 ${
                    errors.email
                      ? 'border-danger shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
                      : 'border-border focus:border-primary focus:shadow-[0_0_0_3px_rgba(74,158,191,0.25)]'
                  }`}
                />
              </div>
              {errors.email && (
                <div className="text-xs text-danger mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {t(errors.email.message!)}
                </div>
              )}
            </div>

            {/* Password field */}
            <div className="mb-[18px]">
              <label className="block text-[13px] font-medium text-text-primary mb-1.5">
                {t('login.password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register('password')}
                  className={`w-full h-10 pl-10 pr-10 border rounded-lg bg-surface text-text-primary font-sans text-sm outline-none transition-all duration-150 ${
                    errors.password
                      ? 'border-danger shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
                      : 'border-border focus:border-primary focus:shadow-[0_0_0_3px_rgba(74,158,191,0.25)]'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer p-0.5 flex items-center text-text-muted hover:text-text-secondary"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <div className="text-xs text-danger mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {t(errors.password.message!)}
                </div>
              )}
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between mb-6">
              <label
                className="flex items-center gap-[7px] cursor-pointer"
                onClick={() => setRememberMe(!rememberMe)}
              >
                <div
                  className={`w-4 h-4 border-[1.5px] rounded flex items-center justify-center transition-all duration-150 shrink-0 ${
                    rememberMe
                      ? 'border-primary bg-primary'
                      : 'border-border-strong bg-surface'
                  }`}
                >
                  {rememberMe && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="text-[13px] text-text-secondary select-none">
                  {t('login.remember')}
                </span>
              </label>
              <Link
                to="/forgot-password"
                className="text-[13px] font-medium text-primary no-underline hover:underline"
              >
                {t('login.forgot')}
              </Link>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={login.isPending}
              className={`w-full h-10 bg-primary text-white border-none rounded-lg font-sans text-sm font-semibold cursor-pointer transition-all duration-150 flex items-center justify-center gap-2 ${
                login.isPending
                  ? 'opacity-80 cursor-not-allowed'
                  : 'hover:bg-primary-hover hover:-translate-y-px hover:shadow-md'
              }`}
            >
              {login.isPending ? (
                <div className="w-4 h-4 border-2 border-white/35 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{t('login.submit')}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" />
            <div className="text-xs text-text-muted whitespace-nowrap">{t('login.or')}</div>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* SSO Button — full-page redirect to the backend OAuth start route
              (proxied by Vite to the API). The callback sets the refresh cookie
              and bounces to /auth/google/success. */}
          <button
            type="button"
            onClick={() => {
              window.location.href = '/api/v1/auth/google';
            }}
            className="w-full h-10 bg-surface border border-border rounded-lg font-sans text-sm font-medium text-text-primary cursor-pointer flex items-center justify-center gap-2 transition-all duration-150 hover:bg-surface-alt hover:border-border-strong"
          >
            {/* Google icon */}
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {t('login.google')}
          </button>

          {/* Footer */}
          <div className="text-center mt-7 text-xs text-text-muted">
            {t('login.contact')}
            <a
              href="mailto:support@codecrush.asia"
              className="text-text-secondary no-underline font-medium hover:underline"
            >
              support@codecrush.asia
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
