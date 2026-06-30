import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';
import type { SalesCompanyDto, CreateCompanyRequest } from '@hrm/shared';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateCompany, useUpdateCompany } from '../hooks/useCompanies';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: SalesCompanyDto | null;
}

type FormState = CreateCompanyRequest;
const EMPTY: FormState = { name: '', taxCode: '', industry: '', size: '', website: '', address: '' };

export function CompanyFormSheet({ open, onOpenChange, company }: Props) {
  const { t } = useTranslation('sales');
  const isEdit = Boolean(company);
  const [form, setForm] = useState<FormState>(EMPTY);
  const createMut = useCreateCompany();
  const updateMut = useUpdateCompany(company?.id ?? '');
  const pending = createMut.isPending || updateMut.isPending;

  useEffect(() => {
    if (!open) return;
    setForm(
      company
        ? {
            name: company.name,
            taxCode: company.taxCode ?? '',
            industry: company.industry ?? '',
            size: company.size ?? '',
            website: company.website ?? '',
            address: company.address ?? '',
          }
        : EMPTY,
    );
  }, [open, company]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      if (isEdit) {
        await updateMut.mutateAsync(form);
        toast.success(t('company.toast.updated'));
      } else {
        await createMut.mutateAsync(form);
        toast.success(t('company.toast.created'));
      }
      onOpenChange(false);
    } catch {
      toast.error(t('company.toast.error'));
    }
  }

  const fields: { key: keyof FormState; label: string }[] = [
    { key: 'taxCode', label: t('company.form.taxCode') },
    { key: 'industry', label: t('company.form.industry') },
    { key: 'size', label: t('company.form.size') },
    { key: 'website', label: t('company.form.website') },
    { key: 'address', label: t('company.form.address') },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[440px] sm:w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t(isEdit ? 'company.form.editTitle' : 'company.form.createTitle')}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="co-name">
              {t('company.form.name')} <span className="text-destructive">*</span>
            </Label>
            <Input id="co-name" className="h-9" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`co-${f.key}`}>{f.label}</Label>
              <Input id={`co-${f.key}`} className="h-9" value={form[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
            </div>
          ))}
          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('company.form.cancel')}
            </Button>
            <Button type="submit" disabled={pending || !form.name.trim()}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t(pending ? 'company.form.saving' : 'company.form.save')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
