import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Download, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { usePermission } from '@/hooks/usePermission';
import { formatVnd, getInitials } from '@/lib/utils';
import { useRun, useExportRunPdf } from '../hooks/useRuns';
import { PayrollRunStatusBadge } from './PayrollRunStatusBadge';
import { PayslipDetailSheet } from './PayslipDetailSheet';

interface RunDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string | null;
}

export function RunDetailSheet({ open, onOpenChange, runId }: RunDetailSheetProps) {
  const { t } = useTranslation('payroll');
  const { can } = usePermission();
  const canExport = can('payroll:export');
  const { data: run, isLoading } = useRun(open ? runId : null);
  const exportPdf = useExportRunPdf();
  const [selectedSlipId, setSelectedSlipId] = useState<string | null>(null);

  const payslips = run?.payslips ?? [];

  async function onExport() {
    if (!runId) return;
    try {
      await exportPdf.mutateAsync(runId);
    } catch {
      toast.error(t('runDetail.exportError'));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-[480px] sm:w-[600px]">
        <SheetHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2">
                {t('runDetail.title', { period: run?.period ?? '' })}
                {run && <PayrollRunStatusBadge status={run.status} />}
              </SheetTitle>
              <SheetDescription>{t('runDetail.subtitle')}</SheetDescription>
            </div>
            {canExport && run && payslips.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                disabled={exportPdf.isPending}
                onClick={onExport}
              >
                {exportPdf.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                {t('runDetail.export')}
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="mt-6 flex-1 overflow-y-auto pr-1">
          {isLoading || !run ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : payslips.length === 0 ? (
            <p className="text-sm text-text-muted py-8 text-center">{t('runDetail.empty')}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {payslips.map((slip) => (
                <li key={slip.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedSlipId(slip.id)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-alt/50 transition-colors focus-visible:outline-none focus-visible:bg-surface-alt/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="size-8">
                        <AvatarImage src={slip.employee?.avatar ?? undefined} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {getInitials(slip.employee?.fullName ?? '?')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-none truncate">
                          {slip.employee?.fullName ?? slip.employeeId}
                        </p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {slip.employee?.employeeCode ?? ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatVnd(slip.netPay)} ₫
                      </span>
                      <ChevronRight className="size-4 text-text-muted" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <PayslipDetailSheet
          open={!!selectedSlipId}
          onOpenChange={(o) => !o && setSelectedSlipId(null)}
          payslipId={selectedSlipId}
        />
      </SheetContent>
    </Sheet>
  );
}
