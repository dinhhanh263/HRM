import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useEmailHistory } from '../hooks/useEngagement';
import { SendEmailSheet } from './SendEmailSheet';

export function CustomerEmailTab({ customerId, canSend }: { customerId: string; canSend: boolean }) {
  const { t } = useTranslation('sales');
  const { data, isLoading } = useEmailHistory(customerId);
  const [sendOpen, setSendOpen] = useState(false);

  const statusClass: Record<string, string> = {
    SENT: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
    QUEUED: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
    FAILED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  };

  return (
    <div className="space-y-3">
      {canSend && <Button size="sm" variant="outline" onClick={() => setSendOpen(true)}><Plus size={14} className="mr-1.5" />{t('email.sendButton')}</Button>}
      {isLoading ? (
        <Skeleton className="h-20 w-full rounded" />
      ) : !data || data.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">{t('email.historyEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {data.map((m) => (
            <li key={m.id} className="rounded-md border border-border p-2.5">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-text-muted shrink-0" />
                <span className="flex-1 truncate text-sm font-medium">{m.subject}</span>
                <Badge variant="outline" className={cn('text-[10px]', statusClass[m.status] ?? '')}>{t(`email.status.${m.status}`)}</Badge>
              </div>
              <p className="mt-1 text-xs text-text-muted">{m.to} · {new Date(m.createdAt).toLocaleString('vi-VN')}</p>
            </li>
          ))}
        </ul>
      )}
      <SendEmailSheet open={sendOpen} onOpenChange={setSendOpen} customerId={customerId} />
    </div>
  );
}
