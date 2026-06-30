import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/toast';
import { Check, ClipboardList } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useMyTasks, useCompleteTask, type TaskDto } from '../hooks/useEngagement';

function startOfTomorrow(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime() + 86400000;
}

export function MyTasksPage() {
  const { t } = useTranslation('sales');
  const { data, isLoading } = useMyTasks('OPEN');
  const completeMut = useCompleteTask();

  const groups = useMemo(() => {
    const now = Date.now();
    const tomorrow = startOfTomorrow();
    const overdue: TaskDto[] = [], today: TaskDto[] = [], upcoming: TaskDto[] = [];
    (data ?? []).forEach((task) => {
      const due = new Date(task.dueAt).getTime();
      if (due < now && new Date(task.dueAt).toDateString() !== new Date().toDateString()) overdue.push(task);
      else if (due < tomorrow) today.push(task);
      else upcoming.push(task);
    });
    return { overdue, today, upcoming };
  }, [data]);

  async function complete(id: string) {
    try { await completeMut.mutateAsync(id); toast.success(t('task.toast.done')); }
    catch { toast.error(t('task.toast.error')); }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('myTasks.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('myTasks.subtitle')}</p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : !data || data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="size-14 rounded-2xl bg-surface-alt flex items-center justify-center mb-4"><ClipboardList size={24} className="text-text-muted" /></div>
          <p className="text-sm text-text-secondary">{t('myTasks.empty')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          <Group title={t('myTasks.overdue')} tasks={groups.overdue} tone="danger" onComplete={complete} t={t} />
          <Group title={t('myTasks.today')} tasks={groups.today} tone="primary" onComplete={complete} t={t} />
          <Group title={t('myTasks.upcoming')} tasks={groups.upcoming} onComplete={complete} t={t} />
        </div>
      )}
    </div>
  );
}

function Group({ title, tasks, tone, onComplete, t }: { title: string; tasks: TaskDto[]; tone?: 'danger' | 'primary'; onComplete: (id: string) => void; t: (k: string) => string }) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <h2 className={cn('mb-2 text-sm font-semibold uppercase tracking-wide', tone === 'danger' ? 'text-danger' : tone === 'primary' ? 'text-primary' : 'text-text-secondary')}>
        {title} ({tasks.length})
      </h2>
      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-3 rounded-md border border-border bg-surface p-3">
            <button onClick={() => onComplete(task.id)} className="flex size-5 items-center justify-center rounded-full border border-border hover:border-primary hover:text-primary" title={t('task.complete')}>
              <Check size={12} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">{task.title}</p>
              {task.customer && (
                <Link to={`/sales/customers/${task.customer.id}`} className="text-xs text-text-muted hover:text-primary">
                  {t('myTasks.forCustomer')}: {task.customer.fullName}
                </Link>
              )}
            </div>
            <span className="text-xs text-text-muted tabular-nums">{new Date(task.dueAt).toLocaleDateString('vi-VN')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
