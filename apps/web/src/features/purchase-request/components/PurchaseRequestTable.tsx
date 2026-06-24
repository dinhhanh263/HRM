import { useTranslation } from 'react-i18next';
import type { PurchaseRequestDto } from '@hrm/shared';
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
import { PurchaseStatusBadge } from './PurchaseStatusBadge';
import { formatPurchaseDate } from '../utils';

interface PurchaseRequestTableProps {
  items: PurchaseRequestDto[];
  showEmployee?: boolean;
  onRowClick: (id: string) => void;
}

export function PurchaseRequestTable({ items, showEmployee, onRowClick }: PurchaseRequestTableProps) {
  const { t } = useTranslation('purchase');

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-alt/50 hover:bg-surface-alt/50">
            <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {t('table.code')}
            </TableHead>
            <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {t('table.title')}
            </TableHead>
            <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {t('table.vendor')}
            </TableHead>
            {showEmployee && (
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('table.employee')}
              </TableHead>
            )}
            <TableHead className="text-right text-xs font-semibold text-text-secondary uppercase tracking-wide">
              {t('table.lineCount')}
            </TableHead>
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
              <TableCell className="font-medium text-text-primary whitespace-nowrap tabular-nums">
                {r.code}
              </TableCell>
              <TableCell className="text-sm text-text-primary max-w-[240px] truncate">
                {r.title}
              </TableCell>
              <TableCell className="text-sm text-text-secondary max-w-[180px] truncate">
                {r.vendorName}
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
              <TableCell className="text-right text-sm tabular-nums text-text-secondary whitespace-nowrap">
                {r.items?.length ?? 0}
              </TableCell>
              <TableCell className="text-right text-sm font-medium tabular-nums text-text-primary whitespace-nowrap">
                {formatVnd(r.totalAmount)} {r.currency === 'VND' ? '₫' : r.currency}
              </TableCell>
              <TableCell>
                <PurchaseStatusBadge status={r.status} />
              </TableCell>
              <TableCell className="text-sm text-text-muted whitespace-nowrap tabular-nums">
                {formatPurchaseDate(r.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
