import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FundAccountDto, FundAccountType } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { groupThousands } from '@/lib/utils';
import { useIssuingEntitiesLite } from '../hooks/useFundAccounts';

export interface FundAccountFormData {
  issuingEntityId: string;
  name: string;
  type: FundAccountType;
  openingBalance: number;
}

interface FundAccountFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: FundAccountDto | null;
  onSubmit: (data: FundAccountFormData) => void;
  isLoading?: boolean;
}

const TYPES: FundAccountType[] = ['BANK', 'CASH', 'EWALLET'];

export function FundAccountFormSheet({
  open,
  onOpenChange,
  account,
  onSubmit,
  isLoading,
}: FundAccountFormSheetProps) {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const isEditing = !!account;
  const { data: entities = [] } = useIssuingEntitiesLite();

  const [entityId, setEntityId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<FundAccountType>('BANK');
  const [opening, setOpening] = useState(''); // grouped string for the input
  const [nameError, setNameError] = useState(false);

  useEffect(() => {
    if (open) {
      setEntityId(account?.issuingEntityId ?? '');
      setName(account?.name ?? '');
      setType(account?.type ?? 'BANK');
      setOpening(account ? groupThousands(account.openingBalance) : '');
      setNameError(false);
    }
  }, [open, account]);

  function handleSubmit() {
    if (!name.trim() || !entityId) {
      setNameError(!name.trim());
      return;
    }
    onSubmit({
      issuingEntityId: entityId,
      name: name.trim(),
      type,
      openingBalance: Number(opening.replace(/\D/g, '')) || 0,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEditing ? t('accounts.form.edit') : t('accounts.form.create')}</SheetTitle>
          <SheetDescription>{t('accounts.form.description')}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fa-entity">
              {t('accounts.form.entityLabel')} <span className="text-danger">*</span>
            </Label>
            <Select value={entityId} onValueChange={setEntityId} disabled={isEditing}>
              <SelectTrigger id="fa-entity">
                <SelectValue placeholder={t('accounts.form.entityPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fa-name">
              {t('accounts.form.nameLabel')} <span className="text-danger">*</span>
            </Label>
            <Input
              id="fa-name"
              placeholder={t('accounts.form.namePlaceholder')}
              value={name}
              error={nameError}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(false);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fa-type">{t('accounts.form.typeLabel')}</Label>
            <Select value={type} onValueChange={(v) => setType(v as FundAccountType)}>
              <SelectTrigger id="fa-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((tp) => (
                  <SelectItem key={tp} value={tp}>
                    {t(`accounts.type.${tp}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fa-opening">{t('accounts.form.openingLabel')}</Label>
            <div className="flex">
              <Input
                id="fa-opening"
                inputMode="numeric"
                className="rounded-r-none tabular-nums"
                placeholder="0"
                value={opening}
                onChange={(e) => setOpening(groupThousands(e.target.value))}
              />
              <span className="flex items-center px-3 border border-l-0 rounded-r-md bg-surface-alt text-text-muted text-sm">
                VND
              </span>
            </div>
            <p className="text-xs text-text-muted">{t('accounts.form.openingHint')}</p>
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isLoading || !entityId}>
            {isLoading
              ? tc('states.saving')
              : isEditing
                ? tc('actions.saveChanges')
                : t('accounts.form.submitCreate')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
