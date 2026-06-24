import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PaymentRequestAttachmentDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { getApiErrorCode } from '@/lib/api-error';
import { FileText, ImageIcon, Download, Trash2, Upload, Loader2 } from 'lucide-react';
import {
  useUploadPaymentAttachment,
  useDeletePaymentAttachment,
  downloadPaymentAttachment,
} from '../hooks/usePaymentRequests';

interface PaymentAttachmentUploaderProps {
  requestId: string;
  attachments: PaymentRequestAttachmentDto[];
  editable: boolean;
  maxFiles?: number;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PaymentAttachmentUploader({
  requestId,
  attachments,
  editable,
  maxFiles = 10,
}: PaymentAttachmentUploaderProps) {
  const { t } = useTranslation('payment');
  const inputRef = useRef<HTMLInputElement>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const uploadMutation = useUploadPaymentAttachment();
  const deleteMutation = useDeletePaymentAttachment();

  const atLimit = attachments.length >= maxFiles;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    uploadMutation.mutate(
      { id: requestId, file },
      {
        onSuccess: () => toast.success(t('toast.uploaded')),
        onError: (err) => {
          const code = getApiErrorCode(err);
          toast.error(
            (code && t(`toast.errors.${code}`, { defaultValue: '' })) || t('toast.tryAgain'),
          );
        },
      },
    );
  }

  async function handleDownload(att: PaymentRequestAttachmentDto) {
    setDownloadingId(att.id);
    try {
      await downloadPaymentAttachment(requestId, att);
    } catch {
      toast.error(t('toast.tryAgain'));
    } finally {
      setDownloadingId(null);
    }
  }

  function handleDelete(att: PaymentRequestAttachmentDto) {
    deleteMutation.mutate(
      { id: requestId, attId: att.id },
      {
        onSuccess: () => toast.success(t('toast.deleted')),
        onError: () => toast.error(t('toast.tryAgain')),
      },
    );
  }

  return (
    <div className="space-y-3">
      {attachments.length === 0 ? (
        <p className="text-sm text-text-muted">{t('detail.noAttachments')}</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((att) => {
            const isImage = att.mimeType.startsWith('image/');
            const Icon = isImage ? ImageIcon : FileText;
            return (
              <li
                key={att.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
              >
                <Icon className="size-4 shrink-0 text-text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text-primary">{att.fileName}</p>
                  <p className="text-xs text-text-muted tabular-nums">{humanSize(att.size)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t('attachments.download')}
                  disabled={downloadingId === att.id}
                  onClick={() => handleDownload(att)}
                >
                  {downloadingId === att.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                </Button>
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-danger hover:text-danger"
                    aria-label={t('attachments.remove')}
                    disabled={deleteMutation.isPending}
                    onClick={() => handleDelete(att)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={onPick}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={atLimit || uploadMutation.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                {t('attachments.uploading')}
              </>
            ) : (
              <>
                <Upload className="mr-1.5 size-4" />
                {t('attachments.add')}
              </>
            )}
          </Button>
          <p className="mt-1.5 text-xs text-text-muted">
            {t('attachments.dropHint')} · {t('attachments.maxFiles', { n: maxFiles })}
          </p>
        </div>
      )}
    </div>
  );
}
