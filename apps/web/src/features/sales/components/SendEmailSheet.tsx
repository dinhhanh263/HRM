import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEmailTemplates, useSendEmail } from '../hooks/useEngagement';

const NONE = '__none__';

export function SendEmailSheet({ open, onOpenChange, customerId }: { open: boolean; onOpenChange: (o: boolean) => void; customerId: string }) {
  const { t } = useTranslation('sales');
  const { data: templates } = useEmailTemplates(open);
  const sendMut = useSendEmail();
  const [templateId, setTemplateId] = useState(NONE);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => { if (open) { setTemplateId(NONE); setSubject(''); setBody(''); } }, [open]);

  function pickTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates?.find((x) => x.id === id);
    if (tpl) { setSubject(tpl.subject); setBody(tpl.body); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    try {
      await sendMut.mutateAsync({ customerId, templateId: templateId === NONE ? null : templateId, subject, body });
      toast.success(t('email.toast.sent'));
      onOpenChange(false);
    } catch { toast.error(t('email.toast.error')); }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:w-[560px] overflow-y-auto">
        <SheetHeader><SheetTitle>{t('email.sendTitle')}</SheetTitle></SheetHeader>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label>{t('email.template')}</Label>
            <Select value={templateId} onValueChange={pickTemplate}>
              <SelectTrigger className="h-9"><SelectValue placeholder={t('email.noTemplate')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('email.noTemplate')}</SelectItem>
                {templates?.filter((x) => x.isActive).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em-subject">{t('email.subject')} <span className="text-destructive">*</span></Label>
            <Input id="em-subject" className="h-9" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em-body">{t('email.body')} <span className="text-destructive">*</span></Label>
            <Textarea id="em-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} required />
            <p className="text-xs text-text-muted">{t('email.varsHint')}</p>
          </div>
          <SheetFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('email.cancel')}</Button>
            <Button type="submit" disabled={sendMut.isPending || !subject.trim() || !body.trim()}>
              {sendMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('email.send')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
