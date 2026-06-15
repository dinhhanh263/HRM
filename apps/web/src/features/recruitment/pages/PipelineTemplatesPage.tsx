import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PipelineTemplateSettings } from '../components/PipelineTemplateSettings';

export function PipelineTemplatesPage() {
  const { t } = useTranslation('recruitment');

  return (
    <div className="flex flex-col gap-6 max-w-screen-xl">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1 text-text-secondary">
          <Link to="/recruitment">
            <ArrowLeft size={14} className="mr-1.5" />
            {t('job.list.title')}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">{t('page.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('page.subtitle')}</p>
      </div>

      <PipelineTemplateSettings />
    </div>
  );
}
