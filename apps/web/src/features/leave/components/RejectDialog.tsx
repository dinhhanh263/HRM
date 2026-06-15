import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface RejectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note: string) => void;
  isSubmitting?: boolean;
}

export function RejectDialog({ open, onOpenChange, onConfirm, isSubmitting }: RejectDialogProps) {
  const { t } = useTranslation('leave');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('review.rejectTitle')}</DialogTitle>
          <DialogDescription>{t('review.rejectDescription')}</DialogDescription>
        </DialogHeader>
        <Textarea
          rows={3}
          placeholder={t('review.notePlaceholder')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel', { ns: 'common' })}
          </Button>
          <Button
            className="bg-danger hover:bg-danger/90 text-white"
            disabled={isSubmitting}
            onClick={() => onConfirm(note)}
          >
            {t('review.confirmReject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
