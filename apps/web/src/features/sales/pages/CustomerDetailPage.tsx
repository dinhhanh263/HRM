import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Pencil } from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCustomer } from '../hooks/useCustomers';
import { CustomerFormSheet } from '../components/CustomerFormSheet';
import { LifecycleBadge } from '../components/LifecycleBadge';
import { LifecycleMenu } from '../components/LifecycleMenu';
import { ActivityFeed } from '../components/ActivityFeed';
import { CustomerEmailTab } from '../components/CustomerEmailTab';
import { CustomerTaskTab } from '../components/CustomerTaskTab';

const PLACEHOLDER_TABS = ['deals', 'quotes'] as const;

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('sales');
  const { can } = usePermission();
  const { data: customer, isLoading } = useCustomer(id);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-screen-xl">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }
  if (!customer) return null;

  const fields: { label: string; value: string | null }[] = [
    { label: t('detail.fields.email'), value: customer.email },
    { label: t('detail.fields.phone'), value: customer.phone },
    { label: t('detail.fields.address'), value: customer.address },
    { label: t('detail.fields.source'), value: t(`source.${customer.source}`) },
    { label: t('detail.fields.owner'), value: customer.owner?.fullName ?? t('customers.unassigned') },
    { label: t('detail.fields.company'), value: customer.company?.name ?? null },
    { label: t('detail.fields.createdAt'), value: new Date(customer.createdAt).toLocaleDateString('vi-VN') },
    ...(customer.lifecycleStatus === 'DISQUALIFIED' && customer.lostReason
      ? [{ label: t('lifecycleChange.lostReasonField'), value: customer.lostReason }]
      : []),
  ];

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <Link
        to="/sales/customers"
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary transition-colors"
      >
        <ChevronLeft size={14} />
        {t('detail.back')}
      </Link>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{customer.fullName}</h1>
              <LifecycleBadge status={customer.lifecycleStatus} />
            </div>
            <p className="text-sm text-text-secondary mt-1">
              {t(`type.${customer.type}`)}
              {customer.title ? ` · ${customer.title}` : ''}
            </p>
          </div>
        </div>
        {can('sales:customer_update') && (
          <div className="flex items-center gap-2">
            <LifecycleMenu customer={customer} />
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil size={14} className="mr-1.5" />
              {t('form.editTitle')}
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">{t('detail.tabs.info')}</TabsTrigger>
          <TabsTrigger value="activity">{t('detail.tabs.activity')}</TabsTrigger>
          <TabsTrigger value="deals">{t('detail.tabs.deals')}</TabsTrigger>
          <TabsTrigger value="quotes">{t('detail.tabs.quotes')}</TabsTrigger>
          <TabsTrigger value="email">{t('detail.tabs.email')}</TabsTrigger>
          <TabsTrigger value="tasks">{t('detail.tabs.tasks')}</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-4">
          <ActivityFeed customerId={customer.id} canNote={can('sales:customer_update')} />
        </TabsContent>
        <TabsContent value="email" className="mt-4">
          <CustomerEmailTab customerId={customer.id} canSend={can('sales:email_send')} />
        </TabsContent>
        <TabsContent value="tasks" className="mt-4">
          <CustomerTaskTab customerId={customer.id} canManage={can('sales:task_manage')} />
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <div className="rounded-lg border border-border bg-surface p-6">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              {fields.map((f) => (
                <div key={f.label}>
                  <dt className="text-xs font-medium text-text-muted uppercase tracking-wide">{f.label}</dt>
                  <dd className="mt-1 text-sm text-text-primary">{f.value || '—'}</dd>
                </div>
              ))}
            </dl>
            {customer.notes && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{customer.notes}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tabs filled in by later Phase 1–4 slices (Activity/Deal/Quote/Email/Task). */}
        {PLACEHOLDER_TABS.map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-16 text-sm text-text-muted">
              {t('detail.comingSoon')}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <CustomerFormSheet open={editOpen} onOpenChange={setEditOpen} customer={customer} />
    </div>
  );
}
