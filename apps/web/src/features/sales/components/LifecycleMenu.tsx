import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import type { CustomerDto, CustomerLifecycle } from '@hrm/shared';
import { CustomerLifecycle as LifecycleEnum } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useChangeLifecycle } from '../hooks/useCustomers';

export function LifecycleMenu({ customer }: { customer: CustomerDto }) {
  const { t } = useTranslation('sales');
  const mut = useChangeLifecycle();
  const [disqualifyOpen, setDisqualifyOpen] = useState(false);
  const [reason, setReason] = useState('');

  async function change(status: CustomerLifecycle, lostReason?: string) {
    try {
      await mut.mutateAsync({ id: customer.id, lifecycleStatus: status, lostReason });
      toast.success(t('lifecycleChange.toastChanged'));
      setDisqualifyOpen(false);
      setReason('');
    } catch {
      toast.error(t('lifecycleChange.toastError'));
    }
  }

  function onSelect(status: CustomerLifecycle) {
    if (status === customer.lifecycleStatus) return;
    if (status === LifecycleEnum.DISQUALIFIED) {
      setDisqualifyOpen(true);
      return;
    }
    void change(status);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t('lifecycleChange.changeStatus')}
            <ChevronDown size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {Object.values(LifecycleEnum).map((s) => (
            <DropdownMenuItem key={s} onClick={() => onSelect(s)} className="justify-between">
              {t(`lifecycle.${s}`)}
              {s === customer.lifecycleStatus && <Check size={14} className="text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={disqualifyOpen} onOpenChange={(o) => !o && setDisqualifyOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('lifecycleChange.disqualifyTitle')}</DialogTitle>
            <DialogDescription>{t('lifecycleChange.disqualifyDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="lost-reason">
              {t('lifecycleChange.lostReasonLabel')} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="lost-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('lifecycleChange.lostReasonPlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisqualifyOpen(false)} disabled={mut.isPending}>
              {t('lifecycleChange.cancel')}
            </Button>
            <Button
              className={cn('bg-destructive hover:bg-destructive/90')}
              disabled={mut.isPending || !reason.trim()}
              onClick={() => change(LifecycleEnum.DISQUALIFIED, reason.trim())}
            >
              {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('lifecycleChange.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
