import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FinanceReportGroup } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatVnd } from '@/lib/utils';
import { Download } from 'lucide-react';
import { useIssuingEntitiesLite } from '../hooks/useFundAccounts';
import { useFinanceReport, useDownloadFinanceReport } from '../hooks/useFinanceReports';

const ALL = '__all__';
const MONTHS = ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'];

export function FinanceReportPage() {
  const { t } = useTranslation('finance');
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [entityId, setEntityId] = useState(ALL);

  const query = { year, issuingEntityId: entityId === ALL ? undefined : entityId };
  const { data, isLoading } = useFinanceReport(query);
  const { data: entities = [] } = useIssuingEntitiesLite();
  const download = useDownloadFinanceReport();

  const years = [thisYear, thisYear - 1, thisYear - 2];

  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('report.title')}</h1>
          <p className="text-sm text-text-secondary mt-1">{t('report.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-9 w-28 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={entityId} onValueChange={setEntityId}>
            <SelectTrigger className="h-9 w-48 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('report.allEntities')}</SelectItem>
              {entities.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => download.mutate(query, { onError: () => toast.error(t('report.exportError')) })} disabled={download.isPending}>
            <Download className="w-4 h-4 mr-2" />{t('report.export')}
          </Button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TotalCard label={t('report.totalIn')} value={data?.totalIn} tone="text-success" loading={isLoading} />
        <TotalCard label={t('report.totalOut')} value={data?.totalOut} tone="text-warning" loading={isLoading} />
        <TotalCard label={t('report.net')} value={data?.net} tone="text-text-primary" loading={isLoading} />
      </div>

      {/* By month */}
      <div className="bg-surface rounded-xl border border-border p-5 shadow-sm overflow-x-auto">
        <h2 className="text-base font-semibold text-text-primary mb-4">{t('report.byMonth')}</h2>
        {isLoading ? (
          <Skeleton className="h-40 w-full rounded" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-muted">
                <th className="text-left font-medium py-1">{t('report.month')}</th>
                <th className="text-right font-medium py-1">{t('report.in')}</th>
                <th className="text-right font-medium py-1">{t('report.out')}</th>
                <th className="text-right font-medium py-1">{t('report.netCol')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.months ?? []).map((m) => (
                <tr key={m.month} className="border-t border-border">
                  <td className="py-1.5 text-text-secondary">{MONTHS[m.month - 1]}</td>
                  <td className="py-1.5 text-right tabular-nums text-success">{formatVnd(m.in)}</td>
                  <td className="py-1.5 text-right tabular-nums text-warning">{formatVnd(m.out)}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium text-text-primary">{formatVnd(m.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* By entity + by category */}
      <div className="grid gap-6 md:grid-cols-2">
        <GroupCard title={t('report.byEntity')} rows={data?.byEntity ?? []} loading={isLoading} />
        <GroupCard title={t('report.byCategory')} rows={data?.byCategory ?? []} loading={isLoading} />
      </div>
    </div>
  );
}

function TotalCard({ label, value, tone, loading }: { label: string; value?: string; tone: string; loading?: boolean }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-4 shadow-sm">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wide">{label}</p>
      {loading ? <Skeleton className="h-7 w-28 mt-2 rounded" /> : <p className={`text-xl font-bold mt-1 tabular-nums ${tone}`}>{formatVnd(value)}</p>}
    </div>
  );
}

function GroupCard({ title, rows, loading }: { title: string; rows: FinanceReportGroup[]; loading?: boolean }) {
  const { t } = useTranslation('finance');
  return (
    <div className="bg-surface rounded-xl border border-border p-5 shadow-sm">
      <h2 className="text-base font-semibold text-text-primary mb-4">{title}</h2>
      {loading ? (
        <Skeleton className="h-32 w-full rounded" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-muted py-6 text-center">{t('report.empty')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-text-muted">
              <th className="text-left font-medium py-1">{title}</th>
              <th className="text-right font-medium py-1">{t('report.in')}</th>
              <th className="text-right font-medium py-1">{t('report.out')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="py-1.5 text-text-secondary truncate max-w-[160px]">{r.label}</td>
                <td className="py-1.5 text-right tabular-nums text-success">{formatVnd(r.in)}</td>
                <td className="py-1.5 text-right tabular-nums text-warning">{formatVnd(r.out)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
