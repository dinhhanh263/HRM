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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSalesOwners } from '../hooks/useCustomers';

const POOL = '__pool__';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many records are being assigned (1 = single, >1 = bulk) — drives the copy. */
  count: number;
  pending?: boolean;
  onConfirm: (ownerId: string | null) => void;
}

export function AssignOwnerDialog({ open, onOpenChange, count, pending, onConfirm }: Props) {
  const { t } = useTranslation('sales');
  const { data: owners, isLoading } = useSalesOwners(open);
  const [value, setValue] = useState<string>(POOL);

  useEffect(() => {
    if (open) setValue(POOL);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('assign.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {count > 1 ? t('assign.bulkDialogDesc', { count }) : t('assign.dialogDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-2">
          <Label htmlFor="assign-owner">{t('assign.ownerLabel')}</Label>
          <Select value={value} onValueChange={setValue} disabled={isLoading}>
            <SelectTrigger id="assign-owner" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={POOL}>{t('assign.leadPoolOption')}</SelectItem>
              {owners?.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.fullName} <span className="text-text-muted">· {o.employeeCode}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('assign.cancel')}
          </Button>
          <Button onClick={() => onConfirm(value === POOL ? null : value)} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('assign.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
