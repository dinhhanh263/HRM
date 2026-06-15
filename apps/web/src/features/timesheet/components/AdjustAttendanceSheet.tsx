import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { AttendanceRecordDto } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import { useAdjustAttendance } from '../hooks/useAttendance';
import { formatDate } from '../utils';

interface AdjustAttendanceSheetProps {
  record: AttendanceRecordDto | null;
  onOpenChange: (open: boolean) => void;
}

/** Business timezone offset: GMT+7 (Asia/Ho_Chi_Minh — no DST). */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Extract the HH:mm portion of an ISO instant as GMT+7 wall-clock time. */
function isoToTime(iso: string | null): string {
  if (!iso) return '';
  const vn = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
  return `${String(vn.getUTCHours()).padStart(2, '0')}:${String(vn.getUTCMinutes()).padStart(2, '0')}`;
}

/** Compose a YYYY-MM-DD work day + a GMT+7 HH:mm into a UTC ISO instant. */
function timeToIso(workDate: string, time: string): string | null {
  if (!time) return null;
  const [y, mo, da] = workDate.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, da, hh, mm) - VN_OFFSET_MS).toISOString();
}

export function AdjustAttendanceSheet({ record, onOpenChange }: AdjustAttendanceSheetProps) {
  const { t, i18n } = useTranslation('timesheet');
  const adjust = useAdjustAttendance();
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (record) {
      setCheckIn(isoToTime(record.checkInAt));
      setCheckOut(isoToTime(record.checkOutAt));
      setNote(record.note ?? '');
    }
  }, [record]);

  function submit() {
    if (!record) return;
    const checkInAt = timeToIso(record.workDate, checkIn);
    const checkOutAt = timeToIso(record.workDate, checkOut);
    if (checkInAt && checkOutAt && checkOutAt <= checkInAt) {
      toast.error(t('adjust.toast.error'), { description: t('adjust.invalidRange') });
      return;
    }
    adjust.mutate(
      {
        employeeId: record.employeeId,
        workDate: record.workDate,
        checkInAt,
        checkOutAt,
        note: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(t('adjust.toast.saved'));
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(t('adjust.toast.error'), {
            description: getApiErrorMessage(err, t('toast.tryAgain')),
          });
        },
      },
    );
  }

  return (
    <Sheet open={!!record} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:w-[460px]">
        <SheetHeader>
          <SheetTitle>{t('adjust.title')}</SheetTitle>
          <SheetDescription>
            {record?.employee?.fullName}
            {record && ` · ${formatDate(record.workDate, i18n.language)}`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adjust-checkin" className="text-sm font-medium">
                {t('adjust.checkIn')}
              </Label>
              <Input
                id="adjust-checkin"
                type="time"
                className="h-9 text-sm tabular-nums"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adjust-checkout" className="text-sm font-medium">
                {t('adjust.checkOut')}
              </Label>
              <Input
                id="adjust-checkout"
                type="time"
                className="h-9 text-sm tabular-nums"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adjust-note" className="text-sm font-medium">
              {t('adjust.note')}
            </Label>
            <Input
              id="adjust-note"
              type="text"
              maxLength={500}
              placeholder={t('adjust.notePlaceholder')}
              className="h-9 text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <p className="text-xs text-text-muted">{t('adjust.hint')}</p>
        </div>

        <SheetFooter className="mt-6">
          <SheetClose asChild>
            <Button type="button" variant="outline">
              {t('actions.cancel', { ns: 'common' })}
            </Button>
          </SheetClose>
          <Button type="button" onClick={submit} disabled={adjust.isPending} className="gap-1.5">
            {adjust.isPending && <Loader2 className="size-4 animate-spin" />}
            {t('actions.save', { ns: 'common' })}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
