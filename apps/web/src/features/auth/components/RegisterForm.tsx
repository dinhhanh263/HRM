import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { registerSchema, type RegisterFormData } from '@/lib/validations';
import { useRegister } from '../hooks/useAuth';

export function RegisterForm() {
  const { t } = useTranslation('auth');
  const registerMutation = useRegister();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      tenantSlug: 'codecrush',
    },
  });

  const onSubmit = (data: RegisterFormData) => {
    registerMutation.mutate({
      email: data.email,
      password: data.password,
      fullName: data.fullName,
      tenantSlug: data.tenantSlug,
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tenantSlug">{t('register.organization')}</Label>
        <Input
          id="tenantSlug"
          placeholder="codecrush"
          {...register('tenantSlug')}
          error={!!errors.tenantSlug}
        />
        {errors.tenantSlug && (
          <p className="text-xs text-danger">{t(errors.tenantSlug.message!)}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">{t('register.fullName')}</Label>
        <Input
          id="fullName"
          placeholder={t('register.fullNamePlaceholder')}
          {...register('fullName')}
          error={!!errors.fullName}
        />
        {errors.fullName && <p className="text-xs text-danger">{t(errors.fullName.message!)}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t('register.email')}</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          {...register('email')}
          error={!!errors.email}
        />
        {errors.email && <p className="text-xs text-danger">{t(errors.email.message!)}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t('register.password')}</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          {...register('password')}
          error={!!errors.password}
        />
        {errors.password && <p className="text-xs text-danger">{t(errors.password.message!)}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t('register.confirmPassword')}</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="••••••••"
          {...register('confirmPassword')}
          error={!!errors.confirmPassword}
        />
        {errors.confirmPassword && (
          <p className="text-xs text-danger">{t(errors.confirmPassword.message!)}</p>
        )}
      </div>

      {registerMutation.error && (
        <p className="text-sm text-danger">{t('register.errRegister')}</p>
      )}

      <Button type="submit" className="w-full" isLoading={registerMutation.isPending}>
        {t('register.submit')}
      </Button>

      <p className="text-center text-sm text-text-secondary">
        {t('register.hasAccount')}
        <Link to="/login" className="text-primary hover:underline">
          {t('register.signIn')}
        </Link>
      </p>
    </form>
  );
}
