import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SignaturePad } from './SignaturePad';

interface AcknowledgeHandoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (signature: string) => void;
  isLoading?: boolean;
}

// Người nhận ký xác nhận (IN_APP) một phiếu bàn giao đang chờ ký. Chỉ submit khi
// đã có nét ký — tránh gửi data URL rỗng xuống validator.
export function AcknowledgeHandoverDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: AcknowledgeHandoverDialogProps) {
  const { t } = useTranslation('asset');
  const { t: tc } = useTranslation('common');
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    if (open) setSignature(null);
  }, [open]);

  function submit() {
    if (!signature) return;
    onSubmit(signature);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('asset.handover.ackDialog.title')}</DialogTitle>
          <DialogDescription>{t('asset.handover.ackDialog.description')}</DialogDescription>
        </DialogHeader>

        <SignaturePad onChange={setSignature} disabled={isLoading} />
        {!signature && (
          <p className="text-xs text-text-muted">
            {t('asset.handover.ackDialog.signatureRequired')}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={isLoading || !signature}>
            {isLoading ? tc('states.saving') : t('asset.handover.ackDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
