import { useTranslation } from 'react-i18next';
import type { FundAccountDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatVnd } from '@/lib/utils';
import { MoreHorizontal, Pencil, Trash2, Wallet, Plus, Landmark, Banknote, Smartphone, Power } from 'lucide-react';

interface FundAccountTableProps {
  accounts: FundAccountDto[];
  onCreate: () => void;
  onEdit: (a: FundAccountDto) => void;
  onToggleActive: (a: FundAccountDto) => void;
  onDelete: (a: FundAccountDto) => void;
}

const TYPE_ICON = { BANK: Landmark, CASH: Banknote, EWALLET: Smartphone } as const;

export function FundAccountTable({ accounts, onCreate, onEdit, onToggleActive, onDelete }: FundAccountTableProps) {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-surface-alt flex items-center justify-center mb-4">
          <Wallet className="w-8 h-8 text-text-muted" />
        </div>
        <p className="text-text-primary font-medium text-base m-0">{t('accounts.empty.title')}</p>
        <p className="text-text-muted text-sm mt-2">{t('accounts.empty.description')}</p>
        <Button className="mt-4" size="sm" onClick={onCreate}>
          <Plus className="w-4 h-4 mr-1.5" />
          {t('accounts.form.create')}
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-border border-b-2 border-border-strong">
          <tr>
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-primary uppercase tracking-wider">
              {t('accounts.table.name')}
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[180px]">
              {t('accounts.table.entity')}
            </th>
            <th className="px-4 py-3.5 text-left text-xs font-bold text-text-primary uppercase tracking-wider w-[120px]">
              {t('accounts.table.type')}
            </th>
            <th className="px-4 py-3.5 text-right text-xs font-bold text-text-primary uppercase tracking-wider w-[180px]">
              {t('accounts.table.balance')}
            </th>
            <th className="px-4 py-3.5 w-[60px]" />
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => {
            const Icon = TYPE_ICON[a.type];
            return (
              <tr
                key={a.id}
                className={`group transition-colors duration-150 hover:bg-surface-alt bg-surface ${a.active ? '' : 'opacity-60'}`}
              >
                <td className="px-4 py-4 align-middle border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary-light text-primary flex items-center justify-center shrink-0">
                      <Icon className="w-[18px] h-[18px]" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-text-primary block truncate">{a.name}</span>
                      {!a.active && (
                        <span className="text-xs text-text-muted">{t('accounts.inactive')}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 align-middle border-b border-border">
                  <span className="inline-flex items-center rounded-md bg-surface-alt px-2 py-0.5 text-xs font-medium text-text-secondary">
                    {a.issuingEntityName}
                  </span>
                </td>
                <td className="px-4 py-4 align-middle border-b border-border text-text-secondary">
                  {t(`accounts.type.${a.type}`)}
                </td>
                <td className="px-4 py-4 align-middle border-b border-border text-right">
                  <span className="font-semibold text-text-primary tabular-nums">{formatVnd(a.currentBalance)}</span>
                </td>
                <td className="px-4 py-4 align-middle border-b border-border">
                  <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-8 h-8 p-0" aria-label={tc('actions.actions')}>
                          <MoreHorizontal className="w-[18px] h-[18px]" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[160px]">
                        <DropdownMenuItem onClick={() => onEdit(a)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          {tc('actions.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onToggleActive(a)}>
                          <Power className="w-4 h-4 mr-2" />
                          {a.active ? t('accounts.deactivate') : t('accounts.activate')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onDelete(a)} className="text-danger">
                          <Trash2 className="w-4 h-4 mr-2" />
                          {tc('actions.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
