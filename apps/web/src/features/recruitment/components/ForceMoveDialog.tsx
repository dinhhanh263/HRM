import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ForceMoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  stageName: string;
  isPending: boolean;
  // The reason is mandatory — it is recorded in the application's stage history
  // as the audit basis for overriding the gate.
  onConfirm: (note: string) => void;
}

export function ForceMoveDialog({
  open,
  onOpenChange,
  candidateName,
  stageName,
  isPending,
  onConfirm,
}: ForceMoveDialogProps) {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');

  const [note, setNote] = useState('');

  // Reset each time the dialog opens so it never carries a stale reason.
  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  const reason = note.trim();

  function handleConfirm() {
    if (!reason) return;
    onConfirm(reason);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{t('pipeline.forceMoveDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('pipeline.forceMoveDialog.description', { name: candidateName, stage: stageName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning-light px-3 py-2.5">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" strokeWidth={2} />
            <p className="text-xs text-text-secondary">{t('pipeline.forceMoveDialog.warning')}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="forceMoveReason">
              {t('pipeline.forceMoveDialog.reasonLabel')} <span className="text-danger">*</span>
            </Label>
            <Textarea
              id="forceMoveReason"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={t('pipeline.forceMoveDialog.reasonPlaceholder')}
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!reason || isPending}>
            {isPending ? tc('states.saving') : t('pipeline.forceMoveDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
