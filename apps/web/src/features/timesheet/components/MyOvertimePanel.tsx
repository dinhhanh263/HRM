import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMyOvertime } from '../hooks/useOvertime';
import { OvertimeList } from './OvertimeList';
import { OvertimeSheet } from './OvertimeSheet';

interface MyOvertimePanelProps {
  month: string;
}

export function MyOvertimePanel({ month }: MyOvertimePanelProps) {
  const { t } = useTranslation('timesheet');
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data, isLoading } = useMyOvertime({ month });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">{t('overtime.mineTitle')}</h2>
          <p className="text-xs text-text-muted mt-0.5">{t('overtime.mineSubtitle')}</p>
        </div>
        <Button type="button" size="sm" className="gap-1.5" onClick={() => setSheetOpen(true)}>
          <Plus className="size-4" />
          {t('overtime.submitAction')}
        </Button>
      </div>

      <OvertimeList records={data?.data ?? []} isLoading={isLoading} actionMode="mine" />

      <OvertimeSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
