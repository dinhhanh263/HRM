import { useTranslation } from 'react-i18next';
import { AssetCategorySettings } from '../components/AssetCategorySettings';

export function AssetSettingsPage() {
  const { t } = useTranslation('asset');

  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      <div>
        <h1 className="text-2xl font-bold text-text-primary m-0">{t('category.list.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('category.list.subtitle')}</p>
      </div>

      <AssetCategorySettings />
    </div>
  );
}
