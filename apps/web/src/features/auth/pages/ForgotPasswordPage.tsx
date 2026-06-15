import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useForgotPassword } from '../hooks/useAuth';
import { AuthShell } from '../components/AuthShell';
import { Mail, AlertCircle, ArrowRight, ArrowLeft, MailCheck } from 'lucide-react';

const forgotPasswordSchema = z.object({
  email: z.string().email('validation.email'),
  tenantSlug: z.string(),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  // Remember the address the user submitted so the success panel can echo it
  // back — this lets them spot a typo without us revealing whether it exists.
  const [submittedEmail, setSubmittedEmail] = useState('');

  const forgotPassword = useForgotPassword();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      tenantSlug: 'codecrush',
    },
  });

  const onSubmit = (data: ForgotPasswordFormData) => {
    setSubmittedEmail(data.email);
    forgotPassword.mutate(data);
  };

  // Return to the form to try a different address. We never told the user
  // whether the previous one existed, so this is purely a typo-recovery path.
  const handleTryAnother = () => {
    forgotPassword.reset();
    reset({ email: '', tenantSlug: 'codecrush' });
  };

  // Success: the request was accepted. We never reveal whether the email exists
  // (no account enumeration), so the copy stays strictly conditional — it does
  // NOT claim an email was actually sent. We echo the submitted address so the
  // user can catch a typo themselves.
  if (forgotPassword.isSuccess) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-success-light flex items-center justify-center mb-4">
            <MailCheck className="w-6 h-6 text-success" />
          </div>
          <div className="text-[22px] font-bold text-text-primary tracking-tight mb-1.5">
            {t('forgotPassword.sentTitle')}
          </div>
          <div className="text-sm text-text-secondary mb-3">
            {t('forgotPassword.sentMessage')}
          </div>

          {/* Echo the submitted address so the user can verify it themselves. */}
          {submittedEmail && (
            <div className="w-full px-3 py-2.5 mb-4 rounded-lg bg-surface-alt border border-border flex items-center justify-center gap-2 text-sm font-medium text-text-primary break-all">
              <Mail className="w-4 h-4 text-text-muted shrink-0" />
              <span>{submittedEmail}</span>
            </div>
          )}

          <div className="text-xs text-text-muted mb-6 leading-relaxed">
            {t('forgotPassword.sentSpamHint')}
          </div>

          <button
            type="button"
            onClick={handleTryAnother}
            className="w-full h-10 bg-surface border border-border rounded-lg font-sans text-sm font-medium text-text-primary cursor-pointer transition-all duration-150 flex items-center justify-center gap-2 hover:bg-surface-alt hover:border-border-strong mb-4"
          >
            {t('forgotPassword.tryAnotherEmail')}
          </button>

          <Link
            to="/login"
            className="text-[13px] font-medium text-text-secondary no-underline hover:text-text-primary inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('forgotPassword.backToLogin')}
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
          {t('forgotPassword.title')}
        </div>
        <div className="text-sm text-text-secondary">{t('forgotPassword.subtitle')}</div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Email field */}
        <div className="mb-6">
          <label className="block text-[13px] font-medium text-text-primary mb-1.5">
            {t('forgotPassword.email')}
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

        {/* Submit button */}
        <button
          type="submit"
          disabled={forgotPassword.isPending}
          className={`w-full h-10 bg-primary text-white border-none rounded-lg font-sans text-sm font-semibold cursor-pointer transition-all duration-150 flex items-center justify-center gap-2 ${
            forgotPassword.isPending
              ? 'opacity-80 cursor-not-allowed'
              : 'hover:bg-primary-hover hover:-translate-y-px hover:shadow-md'
          }`}
        >
          {forgotPassword.isPending ? (
            <div className="w-4 h-4 border-2 border-white/35 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>{t('forgotPassword.submit')}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Back to login */}
      <div className="text-center mt-6">
        <Link
          to="/login"
          className="text-[13px] font-medium text-text-secondary no-underline hover:text-text-primary inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('forgotPassword.backToLogin')}
        </Link>
      </div>
    </AuthShell>
  );
}
