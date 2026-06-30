import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Plus, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useCustomerTasks, useCreateTask, useCompleteTask } from '../hooks/useEngagement';

export function CustomerTaskTab({ customerId, canManage }: { customerId: string; canManage: boolean }) {
  const { t } = useTranslation('sales');
  const { data, isLoading } = useCustomerTasks(customerId);
  const createMut = useCreateTask();
  const completeMut = useCompleteTask();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');

  async function add() {
    if (!title.trim() || !due) return;
    try {
      await createMut.mutateAsync({ title: title.trim(), customerId, dueAt: new Date(due).toISOString() });
      toast.success(t('task.toast.created'));
      setTitle(''); setDue(''); setAdding(false);
    } catch { toast.error(t('task.toast.error')); }
  }

  return (
    <div className="space-y-3">
      {canManage && (
        adding ? (
          <div className="flex items-end gap-2 rounded-md border border-border p-2.5">
            <div className="flex-1 space-y-1"><label className="text-xs text-text-muted">{t('task.title')}</label><Input className="h-8" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-1"><label className="text-xs text-text-muted">{t('task.dueAt')}</label><Input className="h-8" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
            <Button size="sm" onClick={add} disabled={createMut.isPending || !title.trim() || !due}>{createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : t('task.save')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>{t('task.cancel')}</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus size={14} className="mr-1.5" />{t('task.add')}</Button>
        )
      )}
      {isLoading ? (
        <Skeleton className="h-20 w-full rounded" />
      ) : !data || data.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">{t('task.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {data.map((task) => {
            const overdue = task.status === 'OPEN' && new Date(task.dueAt) < new Date();
            return (
              <li key={task.id} className="flex items-center gap-2 rounded-md border border-border p-2.5">
                {canManage && task.status === 'OPEN' && (
                  <button onClick={() => completeMut.mutate(task.id)} className="flex size-5 items-center justify-center rounded-full border border-border hover:border-primary hover:text-primary" title={t('task.complete')}>
                    <Check size={12} />
                  </button>
                )}
                <span className={cn('flex-1 text-sm', task.status === 'DONE' && 'line-through text-text-muted')}>{task.title}</span>
                <span className={cn('text-xs tabular-nums', overdue ? 'text-danger font-medium' : 'text-text-muted')}>{new Date(task.dueAt).toLocaleDateString('vi-VN')}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
