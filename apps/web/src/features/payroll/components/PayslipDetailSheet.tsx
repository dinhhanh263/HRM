import { useTranslation } from 'react-i18next';
import { Download, Loader2 } from 'lucide-react';
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
import { cn, formatVnd } from '@/lib/utils';
import { usePayslip, useDownloadPayslipPdf } from '../hooks/usePayslips';

interface PayslipDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payslipId: string | null;
}

function MoneyRow({
  label,
  value,
  variant = 'default',
}: {
  label: string;
  value: string;
  variant?: 'default' | 'subtotal' | 'deduction';
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-1.5 text-sm',
        variant === 'subtotal' && 'font-semibold border-t border-border pt-2 mt-1',
      )}
    >
      <span className={cn('text-text-secondary', variant === 'subtotal' && 'text-text-primary')}>
        {label}
      </span>
      <span className="tabular-nums">
        {variant === 'deduction' && '−'}
        {formatVnd(value)} ₫
      </span>
    </div>
  );
}

export function PayslipDetailSheet({ open, onOpenChange, payslipId }: PayslipDetailSheetProps) {
  const { t } = useTranslation('payroll');
  const { data: slip, isLoading } = usePayslip(open ? payslipId : null);
  const downloadPdf = useDownloadPayslipPdf();

  async function onDownload() {
    if (!payslipId) return;
    try {
      await downloadPdf.mutateAsync(payslipId);
    } catch {
      toast.error(t('payslip.downloadError'));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-[480px] sm:w-[560px]">
        <SheetHeader>
          <SheetTitle>{t('payslip.title')}</SheetTitle>
          <SheetDescription>
            {slip
              ? t('payslip.subtitle', {
                  period: slip.period,
                  name: slip.employee?.fullName ?? '',
                })
              : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 overflow-y-auto pr-1">
          {isLoading || !slip ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <Section title={t('payslip.sections.attendance')}>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <Stat label={t('payslip.attendance.workingDays')} value={slip.workingDays} />
                  <Stat label={t('payslip.attendance.daysPresent')} value={slip.daysPresent} />
                  <Stat label={t('payslip.attendance.paidLeaveDays')} value={slip.paidLeaveDays} />
                  <Stat
                    label={t('payslip.attendance.unpaidLeaveDays')}
                    value={slip.unpaidLeaveDays}
                  />
                  <Stat label={t('payslip.attendance.daysAbsent')} value={slip.daysAbsent} />
                  <Stat label={t('payslip.attendance.holidayCount')} value={slip.holidayCount} />
                </div>
              </Section>

              <Section title={t('payslip.sections.earnings')}>
                <MoneyRow label={t('payslip.earnings.proratedBase')} value={slip.proratedBase} />
                <MoneyRow label={t('payslip.earnings.allowanceTotal')} value={slip.allowanceTotal} />
                {slip.overtime.length > 0 && (
                  <div className="pl-3 border-l border-border ml-1 my-1 space-y-0.5">
                    {slip.overtime.map((ot, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between py-1 text-xs text-text-muted"
                      >
                        <span>
                          {t(`payslip.otCategory.${ot.category}`)}
                          {ot.night ? ` · ${t('payslip.otNight')}` : ''} · {ot.hours}h ×{' '}
                          {ot.multiplier}
                        </span>
                        <span className="tabular-nums">{formatVnd(ot.amount)} ₫</span>
                      </div>
                    ))}
                  </div>
                )}
                <MoneyRow label={t('payslip.earnings.otPay')} value={slip.otPay} />
                <MoneyRow
                  label={t('payslip.earnings.grossPay')}
                  value={slip.grossPay}
                  variant="subtotal"
                />
              </Section>

              <Section title={t('payslip.sections.deductions')}>
                <MoneyRow
                  label={t('payslip.deductions.socialInsurance')}
                  value={slip.socialInsurance}
                  variant="deduction"
                />
                <MoneyRow
                  label={t('payslip.deductions.healthInsurance')}
                  value={slip.healthInsurance}
                  variant="deduction"
                />
                <MoneyRow
                  label={t('payslip.deductions.unemploymentInsurance')}
                  value={slip.unemploymentInsurance}
                  variant="deduction"
                />
                <MoneyRow
                  label={t('payslip.deductions.personalIncomeTax')}
                  value={slip.personalIncomeTax}
                  variant="deduction"
                />
                {slip.unionFee !== '0' && (
                  <MoneyRow
                    label={t('payslip.deductions.unionFee')}
                    value={slip.unionFee}
                    variant="deduction"
                  />
                )}
                {slip.otherDeductions !== '0' && (
                  <MoneyRow
                    label={t('payslip.deductions.otherDeductions')}
                    value={slip.otherDeductions}
                    variant="deduction"
                  />
                )}
                <div className="flex items-center justify-between py-1.5 text-xs text-text-muted">
                  <span>{t('payslip.deductions.taxableIncome')}</span>
                  <span className="tabular-nums">{formatVnd(slip.taxableIncome)} ₫</span>
                </div>
              </Section>

              <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
                <span className="text-sm font-semibold text-text-primary">
                  {t('payslip.netPay')}
                </span>
                <span className="text-lg font-bold text-primary tabular-nums">
                  {formatVnd(slip.netPay)} ₫
                </span>
              </div>
            </div>
          )}
        </div>

        {slip && (
          <div className="mt-4 pt-4 border-t border-border">
            <Button
              variant="outline"
              className="w-full gap-2"
              disabled={downloadPdf.isPending}
              onClick={onDownload}
            >
              {downloadPdf.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {t('payslip.download')}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
