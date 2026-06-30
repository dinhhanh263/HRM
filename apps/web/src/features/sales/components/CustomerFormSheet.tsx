import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from '@/components/ui/toast';
import { AlertCircle, Loader2 } from 'lucide-react';
import type {
  CustomerDto,
  CreateCustomerRequest,
  CustomerType,
  LeadSource,
  CustomerDuplicateDetails,
} from '@hrm/shared';
import { CustomerType as TypeEnum, LeadSource as SourceEnum } from '@hrm/shared';
import { isAxiosError } from 'axios';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateCustomer, useUpdateCustomer } from '../hooks/useCustomers';
import { CompanyPicker } from './CompanyPicker';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: CustomerDto | null; // present = edit mode
}

type FormState = {
  type: CustomerType;
  fullName: string;
  title: string;
  email: string;
  phone: string;
  address: string;
  source: LeadSource;
  notes: string;
  companyId: string | null;
};

const EMPTY: FormState = {
  type: 'B2C',
  fullName: '',
  title: '',
  email: '',
  phone: '',
  address: '',
  source: 'OTHER',
  notes: '',
  companyId: null,
};

export function CustomerFormSheet({ open, onOpenChange, customer }: Props) {
  const { t } = useTranslation('sales');
  const isEdit = Boolean(customer);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [dup, setDup] = useState<CustomerDuplicateDetails | null>(null);

  const createMut = useCreateCustomer();
  const updateMut = useUpdateCustomer(customer?.id ?? '');
  const pending = createMut.isPending || updateMut.isPending;

  useEffect(() => {
    if (!open) return;
    setDup(null);
    setForm(
      customer
        ? {
            type: customer.type,
            fullName: customer.fullName,
            title: customer.title ?? '',
            email: customer.email ?? '',
            phone: customer.phone ?? '',
            address: customer.address ?? '',
            source: customer.source,
            notes: customer.notes ?? '',
            companyId: customer.companyId,
          }
        : EMPTY,
    );
  }, [open, customer]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) return;
    setDup(null);
    const payload: CreateCustomerRequest = {
      type: form.type,
      fullName: form.fullName.trim(),
      title: form.title || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      source: form.source,
      notes: form.notes || undefined,
      companyId: form.type === 'B2B' ? form.companyId : null,
    };
    try {
      if (isEdit) {
        await updateMut.mutateAsync(payload);
        toast.success(t('toast.updated'));
      } else {
        await createMut.mutateAsync(payload);
        toast.success(t('toast.created'));
      }
      onOpenChange(false);
    } catch (err) {
      if (isAxiosError(err) && err.response?.data?.error?.code === 'CUSTOMER_DUPLICATE') {
        setDup(err.response.data.error.details as CustomerDuplicateDetails);
        return;
      }
      toast.error(t('toast.error'));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t(isEdit ? 'form.editTitle' : 'form.createTitle')}</SheetTitle>
          <SheetDescription>{t(isEdit ? 'form.editDesc' : 'form.createDesc')}</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cust-type">{t('form.type')}</Label>
            <Select value={form.type} onValueChange={(v) => set('type', v as CustomerType)}>
              <SelectTrigger id="cust-type" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(TypeEnum).map((v) => (
                  <SelectItem key={v} value={v}>
                    {t(`type.${v}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.type === 'B2B' && (
            <div className="space-y-1.5">
              <Label>{t('company.picker.label')}</Label>
              <CompanyPicker value={form.companyId} onChange={(id) => set('companyId', id)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cust-name">
              {t('form.fullName')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cust-name"
              className="h-9"
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              placeholder={t('form.fullNamePlaceholder')}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cust-email">{t('form.email')}</Label>
              <Input
                id="cust-email"
                type="email"
                className="h-9"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-phone">{t('form.phone')}</Label>
              <Input
                id="cust-phone"
                className="h-9"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
            </div>
          </div>

          {dup && (
            <div className="rounded-md border border-warning/40 bg-warning-light/60 p-3 text-sm dark:bg-warning/10">
              <p className="flex items-center gap-1.5 font-medium text-text-primary">
                <AlertCircle size={14} className="text-warning" />
                {t('dedupe.title')}
              </p>
              <p className="mt-1 text-text-secondary">
                {t(dup.matchedField === 'email' ? 'dedupe.byEmail' : 'dedupe.byPhone', {
                  name: dup.existingName,
                })}
              </p>
              <Link
                to={`/sales/customers/${dup.existingId}`}
                onClick={() => onOpenChange(false)}
                className="mt-1.5 inline-block font-medium text-primary hover:underline"
              >
                {t('dedupe.openExisting')} →
              </Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cust-title">{t('form.jobTitle')}</Label>
              <Input
                id="cust-title"
                className="h-9"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-source">{t('form.source')}</Label>
              <Select value={form.source} onValueChange={(v) => set('source', v as LeadSource)}>
                <SelectTrigger id="cust-source" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(SourceEnum).map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(`source.${v}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cust-address">{t('form.address')}</Label>
            <Input
              id="cust-address"
              className="h-9"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cust-notes">{t('form.notes')}</Label>
            <Textarea
              id="cust-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>

          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('form.cancel')}
            </Button>
            <Button type="submit" disabled={pending || !form.fullName.trim()}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t(pending ? 'form.saving' : 'form.save')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
