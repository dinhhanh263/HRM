import { useTranslation } from 'react-i18next';
import type { PaymentRequestDto } from '@hrm/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatVnd, getInitials } from '@/lib/utils';
import { PaymentStatusBadge } from './PaymentStatusBadge';
import { formatPaymentDate } from '../utils';

interface PaymentRequestTableProps {
  items: PaymentRequestDto[];
  showEmployee?: boolean;
  onRowClick: (id: string) => void;
}

export function PaymentRequestTable({ items, showEmployee, onRowClick }: PaymentRequestTableProps) {
  const { t } = useTranslation('payment');

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-alt/50 hover:bg-surface-alt/50">
            <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {t('table.title')}
            </TableHead>
            <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {t('table.type')}
            </TableHead>
            {showEmployee && (
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('table.employee')}
              </TableHead>
            )}
            <TableHead className="text-right text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {t('table.amount')}
            </TableHead>
            <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {t('table.status')}
            </TableHead>
            <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {t('table.createdAt')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((r) => (
            <TableRow
              key={r.id}
              className="h-12 cursor-pointer hover:bg-surface-alt/30"
              onClick={() => onRowClick(r.id)}
            >
              <TableCell className="font-medium text-text-primary max-w-[260px] truncate">
                {r.title}
              </TableCell>
              <TableCell className="text-sm text-text-secondary whitespace-nowrap">
                {t(`type.${r.type}`)}
              </TableCell>
              {showEmployee && (
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-7">
                      {r.employee?.avatar && <AvatarImage src={r.employee.avatar} />}
                      <AvatarFallback className="text-xs bg-primary-light text-primary">
                        {getInitials(r.employee?.fullName ?? '?')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium leading-none text-text-primary">
                        {r.employee?.fullName ?? '—'}
                      </p>
                      <p className="truncate text-xs text-text-muted mt-0.5">
                        {r.employee?.employeeCode ?? ''}
                      </p>
                    </div>
                  </div>
                </TableCell>
              )}
              <TableCell className="text-right text-sm font-medium tabular-nums text-text-primary whitespace-nowrap">
                {formatVnd(r.amount)} {r.currency === 'VND' ? '₫' : r.currency}
              </TableCell>
              <TableCell>
                <PaymentStatusBadge status={r.status} />
              </TableCell>
              <TableCell className="text-sm text-text-muted whitespace-nowrap tabular-nums">
                {formatPaymentDate(r.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
