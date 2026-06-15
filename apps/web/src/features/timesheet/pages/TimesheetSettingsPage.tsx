import { useTranslation } from 'react-i18next';
import { PolicySettings } from '../components/PolicySettings';
import { HolidaySettings } from '../components/HolidaySettings';
import { OvertimeFlowSettings } from '../components/OvertimeFlowSettings';

export function TimesheetSettingsPage() {
  const { t } = useTranslation('timesheet');

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>
        <p className="text-sm text-text-muted mt-1">{t('settings.subtitle')}</p>
      </div>

      <div className="space-y-6">
        <PolicySettings />
        <HolidaySettings />
        <OvertimeFlowSettings />
      </div>
    </div>
  );
}
