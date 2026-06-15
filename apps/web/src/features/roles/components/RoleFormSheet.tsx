import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PermissionCatalogGroup } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { PermissionMatrix } from './PermissionMatrix';

export interface RoleFormData {
  name: string;
  description: string;
  permissions: string[];
}

interface RoleFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: PermissionCatalogGroup[];
  onSubmit: (data: RoleFormData) => void;
  isLoading?: boolean;
}

export function RoleFormSheet({
  open,
  onOpenChange,
  catalog,
  onSubmit,
  isLoading,
}: RoleFormSheetProps) {
  const { t } = useTranslation('role');
  const { t: tc } = useTranslation('common');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setSelected(new Set());
      setTouched(false);
    }
  }, [open]);

  const nameInvalid = touched && name.trim().length === 0;

  function handleSubmit() {
    setTouched(true);
    if (name.trim().length === 0) return;
    onSubmit({ name: name.trim(), description, permissions: Array.from(selected) });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{t('form.createTitle')}</SheetTitle>
          <SheetDescription>{t('form.createDescription')}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">
              {t('form.nameLabel')} <span className="text-danger">*</span>
            </Label>
            <Input
              id="role-name"
              placeholder={t('form.namePlaceholder')}
              value={name}
              error={nameInvalid}
              onChange={(e) => setName(e.target.value)}
            />
            {nameInvalid && <p className="text-xs text-danger">{t('form.nameRequired')}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role-description">{t('form.descriptionLabel')}</Label>
            <Textarea
              id="role-description"
              placeholder={t('form.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('form.permissionsLabel')}</Label>
            <PermissionMatrix catalog={catalog} selected={selected} onChange={setSelected} />
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? tc('states.saving') : t('form.submitCreate')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
