import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ForbiddenPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('permission');

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-danger-light flex items-center justify-center mb-5">
        <ShieldAlert className="w-7 h-7 text-danger" strokeWidth={1.5} />
      </div>
      <h1 className="text-2xl font-bold text-text-primary">{t('forbidden.title')}</h1>
      <p className="text-sm text-text-secondary mt-2 max-w-md">{t('forbidden.description')}</p>
      <div className="flex items-center gap-2 mt-6">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('forbidden.back')}
        </Button>
        <Button onClick={() => navigate('/')}>
          <Home className="w-4 h-4 mr-2" />
          {t('forbidden.backHome')}
        </Button>
      </div>
    </div>
  );
}
