import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';
import type { ProductDto, ProductStatus } from '@hrm/shared';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateProduct, useUpdateProduct } from '../hooks/useProducts';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product?: ProductDto | null;
}

export function ProductFormSheet({ open, onOpenChange, product }: Props) {
  const { t } = useTranslation('sales');
  const isEdit = Boolean(product);
  const [form, setForm] = useState({ name: '', sku: '', description: '', unitPrice: '0', currency: 'VND', unit: '', status: 'ACTIVE' as ProductStatus });
  const createMut = useCreateProduct();
  const updateMut = useUpdateProduct(product?.id ?? '');
  const pending = createMut.isPending || updateMut.isPending;

  useEffect(() => {
    if (!open) return;
    setForm(product
      ? { name: product.name, sku: product.sku ?? '', description: product.description ?? '', unitPrice: product.unitPrice, currency: product.currency, unit: product.unit ?? '', status: product.status }
      : { name: '', sku: '', description: '', unitPrice: '0', currency: 'VND', unit: '', status: 'ACTIVE' });
  }, [open, product]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const body = { name: form.name.trim(), sku: form.sku || undefined, description: form.description || undefined, unitPrice: Number(form.unitPrice) || 0, currency: form.currency, unit: form.unit || undefined };
    try {
      if (isEdit) { await updateMut.mutateAsync({ ...body, status: form.status }); toast.success(t('product.toast.updated')); }
      else { await createMut.mutateAsync(body); toast.success(t('product.toast.created')); }
      onOpenChange(false);
    } catch { toast.error(t('product.toast.error')); }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[440px] sm:w-[500px] overflow-y-auto">
        <SheetHeader><SheetTitle>{t(isEdit ? 'product.form.editTitle' : 'product.form.createTitle')}</SheetTitle></SheetHeader>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">{t('product.form.name')} <span className="text-destructive">*</span></Label>
            <Input id="p-name" className="h-9" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="p-sku">{t('product.form.sku')}</Label><Input id="p-sku" className="h-9" value={form.sku} onChange={(e) => set('sku', e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="p-unit">{t('product.form.unit')}</Label><Input id="p-unit" className="h-9" value={form.unit} onChange={(e) => set('unit', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="p-price">{t('product.form.unitPrice')}</Label><Input id="p-price" type="number" min={0} className="h-9 tabular-nums" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="p-cur">{t('product.form.currency')}</Label><Input id="p-cur" className="h-9" value={form.currency} onChange={(e) => set('currency', e.target.value)} /></div>
          </div>
          {isEdit && (
            <div className="space-y-1.5">
              <Label>{t('product.form.status')}</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">{t('product.status.ACTIVE')}</SelectItem>
                  <SelectItem value="ARCHIVED">{t('product.status.ARCHIVED')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5"><Label htmlFor="p-desc">{t('product.form.description')}</Label><Textarea id="p-desc" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('product.form.cancel')}</Button>
            <Button type="submit" disabled={pending || !form.name.trim()}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t(pending ? 'product.form.saving' : 'product.form.save')}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
