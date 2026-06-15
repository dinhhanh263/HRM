import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { Can } from '@/components/auth/Can';
import { useLeaveSettings, useUpdateLeaveSettings } from '../hooks/useLeaveSettings';

export function LeaveSettingsCard() {
  const { t } = useTranslation('leave');
  const { data, isLoading } = useLeaveSettings();
  const updateMutation = useUpdateLeaveSettings();

  function handleToggle(next: boolean) {
    updateMutation.mutate(
      { proRataEnabled: next },
      {
        onSuccess: () => toast.success(t('settings.prorata.saved')),
        onError: () =>
          toast.error(t('settings.prorata.saveError'), { description: t('toast.tryAgain') }),
      },
    );
  }

  return (
    <Can permission="leave:configure">
      <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-border bg-background">
          <p className="text-sm font-medium text-text-primary">{t('settings.prorata.title')}</p>
        </div>

        {isLoading ? (
          <div className="px-5 py-4">
            <Skeleton className="h-4 w-2/3 rounded" />
          </div>
        ) : (
          <label className="flex items-start gap-3 px-5 py-4 cursor-pointer">
            <input
              type="checkbox"
              className="size-4 mt-0.5 rounded border-border accent-primary"
              checked={data?.proRataEnabled ?? false}
              disabled={updateMutation.isPending}
              onChange={(e) => handleToggle(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-text-primary">
                {t('settings.prorata.label')}
              </span>
              <span className="block text-xs text-text-muted mt-0.5">
                {t('settings.prorata.help')}
              </span>
            </span>
          </label>
        )}
      </div>
    </Can>
  );
}
