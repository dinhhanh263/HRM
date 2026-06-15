import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RejectionReason } from '@hrm/shared';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const REJECTION_REASONS: RejectionReason[] = [
  'UNDERQUALIFIED',
  'OVERQUALIFIED',
  'FAILED_ASSESSMENT',
  'CULTURE_FIT',
  'COMP_MISMATCH',
  'POSITION_FILLED',
  'CANDIDATE_WITHDREW',
  'NO_SHOW',
  'OTHER',
];

interface RejectApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  isPending: boolean;
  onConfirm: (input: { rejectionReason: RejectionReason; note?: string }) => void;
}

export function RejectApplicationDialog({
  open,
  onOpenChange,
  candidateName,
  isPending,
  onConfirm,
}: RejectApplicationDialogProps) {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');

  const [reason, setReason] = useState<RejectionReason | ''>('');
  const [note, setNote] = useState('');

  // Reset the form each time the dialog opens so it never carries stale state.
  useEffect(() => {
    if (open) {
      setReason('');
      setNote('');
    }
  }, [open]);

  function handleConfirm() {
    if (!reason) return;
    onConfirm({ rejectionReason: reason, note: note.trim() || undefined });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{t('pipeline.rejectDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('pipeline.rejectDialog.description', { name: candidateName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rejectionReason">
              {t('pipeline.rejectDialog.reasonLabel')} <span className="text-danger">*</span>
            </Label>
            <Select value={reason} onValueChange={(v) => setReason(v as RejectionReason)}>
              <SelectTrigger id="rejectionReason">
                <SelectValue placeholder={t('pipeline.rejectDialog.reasonPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {REJECTION_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`application.rejectionReason.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rejectNote">{t('pipeline.rejectDialog.noteLabel')}</Label>
            <Textarea
              id="rejectNote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={t('pipeline.rejectDialog.notePlaceholder')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleConfirm}
            disabled={!reason || isPending}
          >
            {isPending ? tc('states.saving') : t('pipeline.rejectDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
