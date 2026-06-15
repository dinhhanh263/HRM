import { useTranslation } from 'react-i18next';
import type { LeaveRequestDto } from '@hrm/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Check, X, Ban, CalendarOff, RotateCcw } from 'lucide-react';
import { LeaveStatusBadge } from './LeaveStatusBadge';
import { formatDays, formatLeaveDate } from '../utils';

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

interface LeaveRequestTableProps {
  requests: LeaveRequestDto[];
  /**
   * 'review' shows the employee column + approve/reject actions; 'mine' shows
   * cancel/resubmit; 'all' is a read-only tenant-wide view (HR/Admin).
   */
  mode: 'mine' | 'review' | 'all';
  onCancel?: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (request: LeaveRequestDto) => void;
  onResubmit?: (request: LeaveRequestDto) => void;
  onRowClick?: (request: LeaveRequestDto) => void;
  pendingId?: string | null;
}

export function LeaveRequestTable({
  requests,
  mode,
  onCancel,
  onApprove,
  onReject,
  onResubmit,
  onRowClick,
  pendingId,
}: LeaveRequestTableProps) {
  const { t } = useTranslation('leave');
  const showEmployee = mode === 'review' || mode === 'all';

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="size-12 rounded-full bg-background flex items-center justify-center mb-3">
          <CalendarOff className="size-5 text-text-muted" />
        </div>
        <p className="text-text-primary font-medium">
          {mode === 'mine' ? t('requests.empty') : t('requests.emptyReview')}
        </p>
        {mode === 'mine' && (
          <p className="text-text-muted text-sm mt-1">{t('requests.emptyHint')}</p>
        )}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-background hover:bg-background">
          {showEmployee && (
            <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {t('requests.columns.employee')}
            </TableHead>
          )}
          <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            {t('requests.columns.type')}
          </TableHead>
          <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            {t('requests.columns.period')}
          </TableHead>
          <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide text-right">
            {t('requests.columns.days')}
          </TableHead>
          <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            {t('requests.columns.status')}
          </TableHead>
          <TableHead className="w-28" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((req) => {
          const color = req.leaveType?.colorHex || '#4A9EBF';
          const isBusy = pendingId === req.id;
          return (
            <TableRow
              key={req.id}
              className="group h-14 hover:bg-background cursor-pointer"
              onClick={() => onRowClick?.(req)}
            >
              {showEmployee && (
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarImage src={req.employee?.avatar || undefined} />
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(req.employee?.fullName || '?')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary leading-none truncate">
                        {req.employee?.fullName}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5 truncate">
                        {req.employee?.employeeCode}
                        {req.employee?.departmentName ? ` · ${req.employee.departmentName}` : ''}
                      </p>
                    </div>
                  </div>
                </TableCell>
              )}
              <TableCell>
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <span className="text-sm text-text-primary">{req.leaveType?.name}</span>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm text-text-secondary tabular-nums">
                  {formatLeaveDate(req.startDate)}
                  {req.startDate !== req.endDate && (
                    <> {t('requests.to')} {formatLeaveDate(req.endDate)}</>
                  )}
                </span>
                {req.halfDay && (
                  <span className="ml-1.5 text-[11px] text-text-muted">
                    ({t('requests.halfDay')})
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <span className="text-sm font-medium text-text-primary tabular-nums">
                  {formatDays(req.totalDays)}
                </span>
              </TableCell>
              <TableCell>
                <LeaveStatusBadge status={req.status} />
              </TableCell>
              <TableCell>
                <div
                  className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  {mode === 'review' && req.status === 'PENDING' && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-600 hover:bg-green-50 hover:text-green-700"
                        disabled={isBusy}
                        aria-label={t('actions.approve')}
                        onClick={() => onApprove?.(req.id)}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-danger hover:bg-danger-light"
                        disabled={isBusy}
                        aria-label={t('actions.reject')}
                        onClick={() => onReject?.(req)}
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  )}
                  {mode === 'mine' && req.status === 'RETURNED' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 text-primary hover:text-primary"
                      disabled={isBusy}
                      onClick={() => onResubmit?.(req)}
                    >
                      <RotateCcw className="size-3.5" />
                      {t('actions.resubmit')}
                    </Button>
                  )}
                  {mode === 'mine' &&
                    (req.status === 'PENDING' || req.status === 'APPROVED') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-text-muted hover:text-danger"
                        disabled={isBusy}
                        onClick={() => onCancel?.(req.id)}
                      >
                        <Ban className="size-3.5" />
                        {t('actions.cancel')}
                      </Button>
                    )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
