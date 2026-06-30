import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Plus, Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { useEmailTemplates, useSaveTemplate, type EmailTemplateDto } from '../hooks/useEngagement';

export function EmailTemplatesSection() {
  const { t } = useTranslation('sales');
  const { data, isLoading } = useEmailTemplates();
  const [editing, setEditing] = useState<EmailTemplateDto | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('templates.title')}</h2>
        <Button size="sm" variant="outline" onClick={() => { setEditing(null); setOpen(true); }}><Plus size={14} className="mr-1.5" />{t('templates.add')}</Button>
      </div>
      {isLoading ? null : !data || data.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-6 text-center text-sm text-text-muted">{t('templates.empty')}</p>
      ) : (
        <ul className="rounded-lg border border-border bg-surface divide-y divide-border">
          {data.map((tpl) => (
            <li key={tpl.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{tpl.name}</p><p className="truncate text-xs text-text-muted">{tpl.subject}</p></div>
              {!tpl.isActive && <span className="text-xs text-text-muted">✕</span>}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(tpl); setOpen(true); }}><Pencil size={14} /></Button>
            </li>
          ))}
        </ul>
      )}
      <TemplateSheet open={open} onOpenChange={setOpen} template={editing} />
    </div>
  );
}

function TemplateSheet({ open, onOpenChange, template }: { open: boolean; onOpenChange: (o: boolean) => void; template: EmailTemplateDto | null }) {
  const { t } = useTranslation('sales');
  const save = useSaveTemplate();
  const [form, setForm] = useState({ name: '', subject: '', body: '' });

  useEffect(() => {
    if (open) setForm(template ? { name: template.name, subject: template.subject, body: template.body } : { name: '', subject: '', body: '' });
  }, [open, template]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:w-[560px] overflow-y-auto">
        <SheetHeader><SheetTitle>{template ? t('templates.title') : t('templates.add')}</SheetTitle></SheetHeader>
        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) return;
            try { await save.mutateAsync({ id: template?.id, body: form }); toast.success(t('templates.toast.saved')); onOpenChange(false); }
            catch { toast.error(t('templates.toast.error')); }
          }}
        >
          <div className="space-y-1.5"><Label htmlFor="tpl-name">{t('templates.name')}</Label><Input id="tpl-name" className="h-9" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
          <div className="space-y-1.5"><Label htmlFor="tpl-subject">{t('templates.subject')}</Label><Input id="tpl-subject" className="h-9" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} required /></div>
          <div className="space-y-1.5"><Label htmlFor="tpl-body">{t('templates.body')}</Label><Textarea id="tpl-body" rows={8} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} required /></div>
          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('templates.cancel')}</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('templates.save')}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
