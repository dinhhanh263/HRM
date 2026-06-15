import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useSetPassword } from '../hooks/useAuth';
import { AuthShell } from '../components/AuthShell';
import {
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
} from 'lucide-react';

const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'validation.passwordMin')
      .regex(/[A-Z]/, 'validation.passwordUpper')
      .regex(/[a-z]/, 'validation.passwordLower')
      .regex(/[0-9]/, 'validation.passwordDigit'),
    confirmPassword: z.string().min(1, 'validation.password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'validation.passwordMismatch',
    path: ['confirmPassword'],
  });

type SetPasswordFormData = z.infer<typeof setPasswordSchema>;

export function SetPasswordPage() {
  const { t } = useTranslation('auth');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const setPassword = useSetPassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetPasswordFormData>({
    resolver: zodResolver(setPasswordSchema),
  });

  const onSubmit = (data: SetPasswordFormData) => {
    setPassword.mutate({ token, password: data.password });
  };

  // Missing token: the link was malformed or opened without the query param.
  if (!token) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-danger-light flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-danger" />
          </div>
          <div className="text-[22px] font-bold text-text-primary tracking-tight mb-1.5">
            {t('setPassword.missingTokenTitle')}
          </div>
          <div className="text-sm text-text-secondary mb-6">{t('setPassword.missingToken')}</div>
          <Link
            to="/login"
            className="text-[13px] font-medium text-primary no-underline hover:underline"
          >
            {t('setPassword.goToLogin')}
          </Link>
        </div>
      </AuthShell>
    );
  }

  // Success: password set, account activated. The API returns no tokens, so the
  // user must sign in with their new password.
  if (setPassword.isSuccess) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-success-light flex items-center justify-center mb-4">
            <CheckCircle2 className="w-6 h-6 text-success" />
          </div>
          <div className="text-[22px] font-bold text-text-primary tracking-tight mb-1.5">
            {t('setPassword.successTitle')}
          </div>
          <div className="text-sm text-text-secondary mb-6">{t('setPassword.successMessage')}</div>
          <Link
            to="/login"
            className="w-full h-10 bg-primary text-white rounded-lg font-sans text-sm font-semibold cursor-pointer transition-all duration-150 flex items-center justify-center gap-2 no-underline hover:bg-primary-hover hover:-translate-y-px hover:shadow-md"
          >
            <span>{t('setPassword.goToLogin')}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      {/* Header */}
      <div className="mb-8">
        <div className="text-[22px] font-bold text-text-primary tracking-tight mb-1.5">
          {t('setPassword.title')}
        </div>
        <div className="text-sm text-text-secondary">{t('setPassword.subtitle')}</div>
      </div>

      {/* Error alert (invalid / expired token from server) */}
      {setPassword.error && (
        <div className="flex items-start gap-2.5 p-3 px-3.5 bg-danger-light border border-danger/40 rounded-lg mb-5 text-[13px] text-danger">
          <AlertCircle className="w-[15px] h-[15px] shrink-0 mt-0.5" />
          <span>{t('setPassword.errInvalidToken')}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Password field */}
        <div className="mb-[18px]">
          <label className="block text-[13px] font-medium text-text-primary mb-1.5">
            {t('setPassword.password')}
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="new-password"
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
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && (
            <div className="text-xs text-danger mt-1.5 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {t(errors.password.message!)}
            </div>
          )}
        </div>

        {/* Confirm password field */}
        <div className="mb-[18px]">
          <label className="block text-[13px] font-medium text-text-primary mb-1.5">
            {t('setPassword.confirmPassword')}
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <input
              type={showConfirm ? 'text' : 'password'}
              placeholder="••••••••••"
              autoComplete="new-password"
              {...register('confirmPassword')}
              className={`w-full h-10 pl-10 pr-10 border rounded-lg bg-surface text-text-primary font-sans text-sm outline-none transition-all duration-150 ${
                errors.confirmPassword
                  ? 'border-danger shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
                  : 'border-border focus:border-primary focus:shadow-[0_0_0_3px_rgba(74,158,191,0.25)]'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer p-0.5 flex items-center text-text-muted hover:text-text-secondary"
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <div className="text-xs text-danger mt-1.5 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {t(errors.confirmPassword.message!)}
            </div>
          )}
        </div>

        {/* Strength hint */}
        <div className="flex items-start gap-1.5 text-xs text-text-muted mb-6">
          <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{t('setPassword.hint')}</span>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={setPassword.isPending}
          className={`w-full h-10 bg-primary text-white border-none rounded-lg font-sans text-sm font-semibold cursor-pointer transition-all duration-150 flex items-center justify-center gap-2 ${
            setPassword.isPending
              ? 'opacity-80 cursor-not-allowed'
              : 'hover:bg-primary-hover hover:-translate-y-px hover:shadow-md'
          }`}
        >
          {setPassword.isPending ? (
            <div className="w-4 h-4 border-2 border-white/35 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>{t('setPassword.submit')}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
