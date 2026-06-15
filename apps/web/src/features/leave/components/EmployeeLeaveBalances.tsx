import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import type { LeaveBalanceDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { usePermission } from '@/hooks/usePermission';
import { ChevronLeft, ChevronRight, Loader2, SlidersHorizontal } from 'lucide-react';
import { useLeaveBalances, useSetLeaveBalance } from '../hooks/useLeave';
import { LeaveBalanceCards } from './LeaveBalanceCards';

interface EmployeeLeaveBalancesProps {
  employeeId: string;
}

/**
 * Per-employee leave balance panel for the employee detail page. Everyone with
 * leave:view sees the read-only cards; only HR/Admin (leave:configure) gets the
 * "Adjust" action that opens a sheet to override each leave type's allocation
 * for the selected year. The server is the source of truth — this only surfaces
 * the affordance.
 */
export function EmployeeLeaveBalances({ employeeId }: EmployeeLeaveBalancesProps) {
  const { t } = useTranslation('leave');
  const { can } = usePermission();
  const canConfigure = can('leave:configure');

  const [year, setYear] = useState(() => new Date().getUTCFullYear());
  const [editing, setEditing] = useState(false);

  const { data: balances = [], isLoading } = useLeaveBalances(year, employeeId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-text-primary">
          {t('balances.title', { year })}
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t('allocation.prevYear')}
              onClick={() => setYear((y) => y - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-sm font-medium tabular-nums text-text-primary">{year}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t('allocation.nextYear')}
              onClick={() => setYear((y) => y + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {canConfigure && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
              disabled={isLoading || balances.length === 0}
            >
              <SlidersHorizontal className="mr-1.5 h-4 w-4" />
              {t('allocation.adjust')}
            </Button>
          )}
        </div>
      </div>

      <LeaveBalanceCards balances={balances} isLoading={isLoading} />

      {canConfigure && (
        <AllocationEditorSheet
          open={editing}
          onOpenChange={setEditing}
          employeeId={employeeId}
          year={year}
          balances={balances}
        />
      )}
    </div>
  );
}

interface AllocationEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  year: number;
  balances: LeaveBalanceDto[];
}

function AllocationEditorSheet({
  open,
  onOpenChange,
  employeeId,
  year,
  balances,
}: AllocationEditorSheetProps) {
  const { t } = useTranslation('leave');
  const setBalance = useSetLeaveBalance();

  // Local draft keyed by leaveTypeId; re-seeded whenever the sheet opens so it
  // always reflects the latest server allocations.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = open ? `${employeeId}:${year}:${balances.length}` : null;
  if (open && seedKey !== seededFor) {
    setDraft(Object.fromEntries(balances.map((b) => [b.leaveTypeId, String(b.allocated)])));
    setSeededFor(seedKey);
  }

  async function handleSave() {
    // Only PUT the rows whose allocation actually changed and is a valid number.
    const changed = balances.filter((b) => {
      const raw = draft[b.leaveTypeId];
      if (raw === undefined) return false;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 && n <= 365 && n !== b.allocated;
    });

    if (changed.length === 0) {
      onOpenChange(false);
      return;
    }

    try {
      for (const b of changed) {
        await setBalance.mutateAsync({
          employeeId,
          leaveTypeId: b.leaveTypeId,
          year,
          allocated: Number(draft[b.leaveTypeId]),
        });
      }
      toast.success(t('allocation.saved'));
      onOpenChange(false);
    } catch {
      toast.error(t('allocation.saveError'), { description: t('toast.tryAgain') });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t('allocation.title', { year })}</SheetTitle>
          <SheetDescription>{t('allocation.description')}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {balances.map((b) => {
            const color = b.colorHex || '#4A9EBF';
            return (
              <div key={b.leaveTypeId} className="space-y-1.5">
                <Label htmlFor={`alloc-${b.leaveTypeId}`} className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  {b.leaveTypeName}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`alloc-${b.leaveTypeId}`}
                    type="number"
                    min={0}
                    max={365}
                    step={0.5}
                    className="h-9 w-32 tabular-nums"
                    value={draft[b.leaveTypeId] ?? ''}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [b.leaveTypeId]: e.target.value }))
                    }
                  />
                  <span className="text-sm text-text-muted">{t('balances.days')}</span>
                </div>
              </div>
            );
          })}
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={setBalance.isPending}>
            {t('allocation.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={setBalance.isPending}>
            {setBalance.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('allocation.save')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
