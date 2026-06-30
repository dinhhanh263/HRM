import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  onConfirm: (reason: string) => void;
}

export function LoseDealDialog({ open, onOpenChange, pending, onConfirm }: Props) {
  const { t } = useTranslation('sales');
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('deal.loseTitle')}</DialogTitle>
          <DialogDescription>{t('deal.loseDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="lose-reason">{t('deal.loseReason')} <span className="text-destructive">*</span></Label>
          <Textarea id="lose-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('deal.loseReasonPlaceholder')} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>{t('deal.form.cancel')}</Button>
          <Button className="bg-destructive hover:bg-destructive/90" disabled={pending || !reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('deal.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
