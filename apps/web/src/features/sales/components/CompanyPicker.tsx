import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Check, ChevronsUpDown, Plus, Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useCompanies, useCreateCompany } from '../hooks/useCompanies';

interface Props {
  value: string | null;
  onChange: (companyId: string | null, companyName?: string) => void;
}

/** Combobox to pick an existing company or create one inline (B2B customer form). */
export function CompanyPicker({ value, onChange }: Props) {
  const { t } = useTranslation('sales');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data, isLoading } = useCompanies(search, open);
  const createMut = useCreateCompany();

  const companies = data?.items ?? [];
  const selected = companies.find((c) => c.id === value);
  const canCreate = search.trim() && !companies.some((c) => c.name.toLowerCase() === search.trim().toLowerCase());

  async function createInline() {
    try {
      const created = await createMut.mutateAsync({ name: search.trim() });
      toast.success(t('company.toast.created'));
      onChange(created.id, created.name);
      setOpen(false);
      setSearch('');
    } catch {
      toast.error(t('company.toast.error'));
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className="h-9 w-full justify-between font-normal"
        >
          <span className={cn('flex items-center gap-2 truncate', !selected && 'text-text-muted')}>
            <Building2 size={14} className="shrink-0" />
            {selected ? selected.name : t('company.picker.placeholder')}
          </span>
          <ChevronsUpDown size={14} className="shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2">
          <Input
            autoFocus
            className="h-8 text-sm"
            placeholder={t('company.picker.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-60 overflow-y-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-alt"
          >
            <span className={cn('size-3.5', !value ? 'opacity-100' : 'opacity-0')}>
              <Check size={14} className="text-primary" />
            </span>
            {t('company.picker.none')}
          </button>

          {isLoading && (
            <div className="flex items-center justify-center py-3 text-text-muted">
              <Loader2 size={16} className="animate-spin" />
            </div>
          )}

          {companies.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onChange(c.id, c.name); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-primary hover:bg-surface-alt"
            >
              <span className={cn('size-3.5', value === c.id ? 'opacity-100' : 'opacity-0')}>
                <Check size={14} className="text-primary" />
              </span>
              <span className="truncate">{c.name}</span>
              {c.taxCode && <span className="ml-auto text-xs text-text-muted">{c.taxCode}</span>}
            </button>
          ))}

          {canCreate && (
            <button
              type="button"
              onClick={createInline}
              disabled={createMut.isPending}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-primary hover:bg-primary/10"
            >
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {t('company.picker.create', { name: search.trim() })}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
