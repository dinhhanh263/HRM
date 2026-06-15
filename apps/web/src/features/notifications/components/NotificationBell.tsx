import { useState } from 'react';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { NotificationDto } from '@hrm/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '../hooks/useNotifications';
import { notificationLink } from '../lib/notification-link';

function kindLabel(kind: string, t: (key: string) => string): string {
  const known = ['probation_ending', 'contract_expiring', 'probation_self_requested'];
  return known.includes(kind) ? t(`kinds.${kind}`) : kind;
}

function NotificationRow({
  item,
  locale,
  kindText,
  onActivate,
}: {
  item: NotificationDto;
  locale: string;
  kindText: string;
  onActivate: (item: NotificationDto) => void;
}) {
  const isUnread = item.readAt === null;
  const dateText = new Date(item.createdAt).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <button
      type="button"
      onClick={() => onActivate(item)}
      className={cn(
        'w-full text-left px-3 py-2.5 flex gap-2.5 transition-colors hover:bg-surface-alt',
        isUnread && 'bg-primary/5'
      )}
    >
      <span
        className={cn(
          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
          isUnread ? 'bg-primary' : 'bg-transparent'
        )}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
            {kindText}
          </span>
          <span className="text-[11px] tabular-nums text-text-muted">{dateText}</span>
        </span>
        <span
          className={cn(
            'mt-0.5 block truncate text-sm',
            isUnread ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'
          )}
        >
          {item.title}
        </span>
        {item.body && (
          <span className="mt-0.5 block text-xs text-text-muted line-clamp-2">{item.body}</span>
        )}
      </span>
    </button>
  );
}

export function NotificationBell() {
  const { t, i18n } = useTranslation('notifications');
  const locale = i18n.language === 'en' ? 'en-US' : 'vi-VN';
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = data?.data ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  function handleActivate(item: NotificationDto) {
    if (item.readAt === null) markRead.mutate(item.id);
    const link = notificationLink(item);
    if (link) {
      setOpen(false);
      navigate(link);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 relative"
          aria-label={
            unreadCount > 0
              ? `${t('ariaLabel')} (${t('unreadCount', { count: unreadCount })})`
              : t('ariaLabel')
          }
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white tabular-nums">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <p className="text-sm font-semibold">{t('title')}</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover transition-colors disabled:opacity-50"
            >
              <CheckCheck size={13} />
              {t('markAllRead')}
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-text-muted">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : isError ? (
            <p className="px-3 py-8 text-center text-sm text-text-muted">{t('loadError')}</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-text-muted">{t('empty')}</p>
          ) : (
            <div className="divide-y divide-border">
              {items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  locale={locale}
                  kindText={kindLabel(item.kind, t)}
                  onActivate={handleActivate}
                />
              ))}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
