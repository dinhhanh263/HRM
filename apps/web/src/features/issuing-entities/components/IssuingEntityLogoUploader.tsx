import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Trash2, Upload } from 'lucide-react';
import type { IssuingEntityDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { IssuingEntityLogo } from './IssuingEntityLogo';
import {
  useDeleteIssuingEntityLogo,
  useUploadIssuingEntityLogo,
} from '../hooks/useIssuingEntities';

const ACCEPTED = ['image/png', 'image/jpeg'];
const MAX_BYTES = 2 * 1024 * 1024; // 2MB — mirrors the server limit.

interface IssuingEntityLogoUploaderProps {
  entity: IssuingEntityDto;
}

/**
 * Single-image logo uploader for an existing entity: shows the current logo
 * thumbnail, an upload button (PNG/JPEG ≤2MB), and a remove button.
 */
export function IssuingEntityLogoUploader({ entity }: IssuingEntityLogoUploaderProps) {
  const { t } = useTranslation('settings');
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadIssuingEntityLogo();
  const deleteMutation = useDeleteIssuingEntityLogo();

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!ACCEPTED.includes(file.type)) {
      toast.error(t('issuingEntities.logo.errorType'));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t('issuingEntities.logo.errorSize'));
      return;
    }

    uploadMutation.mutate(
      { id: entity.id, file },
      {
        onSuccess: () => toast.success(t('issuingEntities.logo.toastUploaded')),
        onError: () => toast.error(t('issuingEntities.toast.error')),
      },
    );
  }

  function handleRemove() {
    deleteMutation.mutate(entity.id, {
      onSuccess: () => toast.success(t('issuingEntities.logo.toastRemoved')),
      onError: () => toast.error(t('issuingEntities.toast.error')),
    });
  }

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-text-primary">
        {t('issuingEntities.logo.label')}
      </span>
      <div className="flex items-center gap-3">
        <IssuingEntityLogo
          entityId={entity.id}
          cacheKey={entity.updatedAt}
          hasLogo={!!entity.logoUrl}
          alt={t('issuingEntities.logo.alt', { name: entity.name })}
          className="size-14"
        />
        <div className="flex flex-col gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={onPick}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadMutation.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {uploadMutation.isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 size-4" />
              )}
              {entity.logoUrl
                ? t('issuingEntities.logo.replace')
                : t('issuingEntities.logo.upload')}
            </Button>
            {entity.logoUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger hover:text-danger"
                disabled={deleteMutation.isPending}
                onClick={handleRemove}
              >
                <Trash2 className="mr-1.5 size-4" />
                {t('issuingEntities.logo.remove')}
              </Button>
            )}
          </div>
          <p className="text-xs text-text-muted">{t('issuingEntities.logo.hint')}</p>
        </div>
      </div>
    </div>
  );
}
