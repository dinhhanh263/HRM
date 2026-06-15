import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import type { AttendanceRecordDto } from '@hrm/shared';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatTime } from '../utils';

interface AttendanceListProps {
  records: AttendanceRecordDto[];
}

export function AttendanceList({ records }: AttendanceListProps) {
  const { t, i18n } = useTranslation('timesheet');

  if (records.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-border shadow-sm">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="size-12 rounded-2xl bg-surface-alt flex items-center justify-center mb-3">
            <CalendarClock className="size-5 text-text-muted" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary mb-1">{t('list.empty.title')}</h3>
          <p className="text-xs text-text-muted max-w-xs">{t('list.empty.desc')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-alt border-b border-border">
            <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {t('list.col.date')}
            </th>
            <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {t('list.col.checkIn')}
            </th>
            <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {t('list.col.checkOut')}
            </th>
            <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {t('list.col.hours')}
            </th>
            <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {t('list.col.note')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {records.map((r) => (
            <tr key={r.id} className="hover:bg-surface-alt/50 transition-colors">
              <td className="px-4 py-2.5 font-medium text-text-primary tabular-nums">
                {formatDate(r.workDate, i18n.language)}
              </td>
              <td className="px-4 py-2.5 tabular-nums text-text-secondary">
                {formatTime(r.checkInAt, i18n.language)}
              </td>
              <td className="px-4 py-2.5 tabular-nums text-text-secondary">
                {formatTime(r.checkOutAt, i18n.language)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
                {r.workedHours != null ? `${r.workedHours}h` : '—'}
              </td>
              <td className="px-4 py-2.5 text-text-muted">
                <div className="flex items-center gap-2">
                  {r.source === 'MANUAL_ADJUST' && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {t('list.adjusted')}
                    </Badge>
                  )}
                  <span className="truncate max-w-xs">{r.note ?? '—'}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
