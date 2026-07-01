import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CategoryKind, FinanceCategoryDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreHorizontal, Pencil, Power, Trash2, Check, X, TrendingUp, TrendingDown } from 'lucide-react';
import {
  useFinanceCategories,
  useCreateFinanceCategory,
  useUpdateFinanceCategory,
  useDeleteFinanceCategory,
} from '../hooks/useFinanceCategories';

function CategoryColumn({ kind }: { kind: CategoryKind }) {
  const { t } = useTranslation('finance');
  const { data, isLoading } = useFinanceCategories();
  const createMutation = useCreateFinanceCategory();
  const updateMutation = useUpdateFinanceCategory();
  const deleteMutation = useDeleteFinanceCategory();

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const items = useMemo(
    () => (data ?? []).filter((c) => c.kind === kind).sort((a, b) => a.name.localeCompare(b.name)),
    [data, kind],
  );

  const isIncome = kind === 'INCOME';

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    createMutation.mutate(
      { kind, name },
      {
        onSuccess: () => {
          setNewName('');
          toast.success(t('categories.toast.created'));
        },
        onError: () => toast.error(t('categories.toast.saveError')),
      },
    );
  }

  function handleRename(c: FinanceCategoryDto) {
    const name = editValue.trim();
    if (!name || name === c.name) {
      setEditingId(null);
      return;
    }
    updateMutation.mutate(
      { id: c.id, name },
      {
        onSuccess: () => {
          setEditingId(null);
          toast.success(t('categories.toast.updated'));
        },
        onError: () => toast.error(t('categories.toast.saveError')),
      },
    );
  }

  function handleToggle(c: FinanceCategoryDto) {
    updateMutation.mutate(
      { id: c.id, active: !c.active },
      { onError: () => toast.error(t('categories.toast.saveError')) },
    );
  }

  function handleDelete(c: FinanceCategoryDto) {
    deleteMutation.mutate(c.id, {
      onSuccess: () => toast.success(t('categories.toast.deleted')),
      onError: (err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        toast.error(status === 409 ? t('categories.toast.inUse') : t('categories.toast.deleteError'));
      },
    });
  }

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background">
        <div
          className={`size-7 rounded-lg flex items-center justify-center ${
            isIncome ? 'bg-success-light text-success' : 'bg-warning-light text-warning'
          }`}
        >
          {isIncome ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
        </div>
        <h2 className="text-sm font-semibold text-text-primary">
          {isIncome ? t('categories.income') : t('categories.expense')}
        </h2>
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={t('categories.addPlaceholder')}
          className="h-8 text-sm"
        />
        <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || createMutation.isPending}>
          <Plus className="size-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-text-muted">{t('categories.empty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((c) => (
            <li
              key={c.id}
              className={`group flex items-center gap-2 px-4 py-2.5 hover:bg-surface-alt ${c.active ? '' : 'opacity-55'}`}
            >
              {editingId === c.id ? (
                <>
                  <Input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(c);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="h-7 text-sm"
                  />
                  <Button size="sm" variant="ghost" className="size-7 p-0" onClick={() => handleRename(c)}>
                    <Check className="size-4 text-success" />
                  </Button>
                  <Button size="sm" variant="ghost" className="size-7 p-0" onClick={() => setEditingId(null)}>
                    <X className="size-4 text-text-muted" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-text-primary truncate">{c.name}</span>
                  {!c.active && (
                    <span className="text-xs text-text-muted">{t('categories.inactive')}</span>
                  )}
                  <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="size-7 p-0" aria-label="actions">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[160px]">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingId(c.id);
                            setEditValue(c.name);
                          }}
                        >
                          <Pencil className="size-4 mr-2" />
                          {t('categories.rename')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggle(c)}>
                          <Power className="size-4 mr-2" />
                          {c.active ? t('categories.deactivate') : t('categories.activate')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleDelete(c)} className="text-danger">
                          <Trash2 className="size-4 mr-2" />
                          {t('categories.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FinanceCategoriesPage() {
  const { t } = useTranslation('finance');
  return (
    <div className="flex flex-col gap-6 max-w-full overflow-hidden">
      <div>
        <h1 className="text-2xl font-bold text-text-primary m-0">{t('categories.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('categories.subtitle')}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <CategoryColumn kind="EXPENSE" />
        <CategoryColumn kind="INCOME" />
      </div>
    </div>
  );
}
