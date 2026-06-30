import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Phone, Mail, Users, StickyNote, ArrowRightLeft, UserCog, Activity as ActIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useActivities, useAddNote, type ActivityDto } from '../hooks/useEngagement';

const ICONS: Record<string, React.ElementType> = {
  CALL: Phone, EMAIL: Mail, MEETING: Users, NOTE: StickyNote,
  STAGE_CHANGED: ArrowRightLeft, OWNER_CHANGED: UserCog, STATUS_CHANGED: ActIcon, LIFECYCLE_CHANGED: ActIcon,
};

export function ActivityFeed({ customerId, canNote }: { customerId: string; canNote: boolean }) {
  const { t } = useTranslation('sales');
  const { data, isLoading } = useActivities(customerId);
  const addNote = useAddNote(customerId);
  const [note, setNote] = useState('');

  async function submit() {
    if (!note.trim()) return;
    try { await addNote.mutateAsync(note.trim()); setNote(''); }
    catch { toast.error(t('deal.toast.error')); }
  }

  return (
    <div className="space-y-4">
      {canNote && (
        <div className="space-y-2">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('activity.notePlaceholder')} />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={addNote.isPending || !note.trim()}>
              {addNote.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('activity.addNote')}
            </Button>
          </div>
        </div>
      )}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
      ) : !data || data.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">{t('activity.empty')}</p>
      ) : (
        <ol className="space-y-3">
          {data.map((a: ActivityDto) => {
            const Icon = ICONS[a.type] ?? ActIcon;
            return (
              <li key={a.id} className="flex gap-3">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-alt">
                  <Icon size={13} className="text-text-secondary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">
                    <span className="font-medium">{t(`activity.type.${a.type}`, a.type)}</span>
                    {a.body && <span className="text-text-secondary"> · {a.body}</span>}
                  </p>
                  <p className="text-xs text-text-muted">
                    {a.author?.fullName ?? t('activity.system')} · {new Date(a.occurredAt).toLocaleString('vi-VN')}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
