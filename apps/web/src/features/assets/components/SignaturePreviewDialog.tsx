import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import { useHandoverSignature } from '../hooks/useAssets';

interface SignaturePreviewDialogProps {
  assignmentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Xem ảnh chữ ký của một biên bản bàn giao. Ảnh tải qua endpoint có phân quyền
// (Blob) — tạo objectURL để hiển thị và huỷ khi blob đổi / dialog đóng.
export function SignaturePreviewDialog({
  assignmentId,
  open,
  onOpenChange,
}: SignaturePreviewDialogProps) {
  const { t } = useTranslation('asset');
  const { data: blob, isLoading, isError } = useHandoverSignature(assignmentId, open);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('asset.handover.signaturePreview.title')}</DialogTitle>
          <DialogDescription>
            {t('asset.handover.signaturePreview.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex min-h-40 items-center justify-center rounded-lg border border-border bg-surface-alt p-4">
          {isLoading ? (
            <Skeleton className="h-32 w-full rounded" />
          ) : isError ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <AlertTriangle className="size-5 text-danger" />
              <p className="m-0 text-sm text-text-secondary">
                {t('asset.handover.signaturePreview.loadError')}
              </p>
            </div>
          ) : url ? (
            <img
              src={url}
              alt={t('asset.handover.signaturePreview.imageAlt')}
              className="max-h-64 w-auto rounded bg-white object-contain"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
