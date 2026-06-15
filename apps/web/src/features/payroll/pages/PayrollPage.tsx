import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import { PayrollSettings } from '../components/PayrollSettings';
import { SalarySheet } from '../components/SalarySheet';
import { RunsSheet } from '../components/RunsSheet';
import { MyPayslips } from '../components/MyPayslips';

type Tab = 'runs' | 'salaries' | 'settings';

export function PayrollPage() {
  const { t } = useTranslation('payroll');
  const { can } = usePermission();
  // HR (payroll:process) manages runs, salaries and settings. The approver
  // (payroll:approve) needs the runs tab to approve/reject — but not the salary
  // roster or settings. Everyone else (payroll:view only) gets the
  // self-service payslip view — never the roster.
  const canProcess = can('payroll:process');
  const canApprove = can('payroll:approve');
  const canManageRuns = canProcess || canApprove;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'runs', label: t('tabs.runs') },
    ...(canProcess
      ? [
          { key: 'salaries' as Tab, label: t('tabs.salaries') },
          { key: 'settings' as Tab, label: t('tabs.settings') },
        ]
      : []),
  ];
  const [tab, setTab] = useState<Tab>('runs');

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-text-muted mt-1">
            {canManageRuns ? t('subtitle') : t('payslip.mine.subtitle')}
          </p>
        </div>
      </div>

      {canManageRuns ? (
        <>
          <div className="flex items-center gap-1 rounded-md border border-border bg-surface-alt p-0.5 w-fit">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                type="button"
                onClick={() => setTab(tb.key)}
                aria-pressed={tab === tb.key}
                className={cn(
                  'h-8 px-4 rounded text-sm font-medium transition-colors',
                  tab === tb.key
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-primary',
                )}
              >
                {tb.label}
              </button>
            ))}
          </div>

          {tab === 'runs' && <RunsSheet />}
          {tab === 'salaries' && <SalarySheet />}
          {tab === 'settings' && <PayrollSettings />}
        </>
      ) : (
        <MyPayslips />
      )}
    </div>
  );
}
