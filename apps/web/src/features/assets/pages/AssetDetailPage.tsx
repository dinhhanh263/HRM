import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  AssignAssetInput,
  ReturnAssetInput,
  CreateMaintenanceInput,
  CompleteMaintenanceInput,
  DisposeAssetInput,
} from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Can } from '@/components/auth/Can';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { formatVnd } from '@/lib/utils';
import { AssetStatusBadge } from '../components/AssetStatusBadge';
import { AssetFormSheet, toAssetPayload, type AssetFormData } from '../components/AssetFormSheet';
import { AssignAssetSheet } from '../components/AssignAssetSheet';
import { ReturnAssetSheet } from '../components/ReturnAssetSheet';
import { MaintenanceSheet } from '../components/MaintenanceSheet';
import { DisposeDialog } from '../components/DisposeDialog';
import { AssetAssignmentHistory } from '../components/AssetAssignmentHistory';
import { AssetMaintenanceHistory } from '../components/AssetMaintenanceHistory';
import {
  useAsset,
  useUpdateAsset,
  useAssignAsset,
  useReturnAsset,
  useStartMaintenance,
  useCompleteMaintenance,
  useDisposeAsset,
} from '../hooks/useAssets';
import {
  ArrowLeft,
  Pencil,
  Package,
  Tag,
  MapPin,
  User,
  X,
  UserPlus,
  Undo2,
  Wrench,
  CheckCircle2,
  Trash2,
} from 'lucide-react';

function formatDate(value: string | null, locale: string) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('asset');
  const locale = i18n.language === 'en' ? 'en-US' : 'vi-VN';
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [startMaintOpen, setStartMaintOpen] = useState(false);
  const [completeMaintOpen, setCompleteMaintOpen] = useState(false);
  const [disposeOpen, setDisposeOpen] = useState(false);

  const { data: asset, isLoading, error } = useAsset(id!);
  const updateMutation = useUpdateAsset(id!);
  const assignMutation = useAssignAsset(id!);
  const returnMutation = useReturnAsset(id!);
  const startMaintMutation = useStartMaintenance(id!);
  const completeMaintMutation = useCompleteMaintenance(id!);
  const disposeMutation = useDisposeAsset(id!);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" role="status" aria-busy="true">
        <span className="sr-only">{t('asset.detail.loading')}</span>
        {/* Header bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-20 rounded-md" />
            <Skeleton className="h-7 w-48 rounded" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </div>
        {/* Two-column body: profile card + detail sections */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <div className="space-y-6">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 mb-3 rounded-full bg-danger-light flex items-center justify-center">
          <X className="w-6 h-6 text-danger" />
        </div>
        <p className="text-text-primary font-medium">{t('asset.detail.notFoundTitle')}</p>
        <p className="text-text-muted text-sm mt-1">{t('asset.detail.notFoundSubtitle')}</p>
        <Button variant="secondary" onClick={() => navigate('/assets')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('asset.detail.back')}
        </Button>
      </div>
    );
  }

  const holder = asset.currentAssignment?.employee;

  function handleEditSubmit(formData: AssetFormData) {
    updateMutation.mutate(toAssetPayload(formData), {
      onSuccess: () => {
        toast.success(t('asset.toast.updated'));
        setEditOpen(false);
      },
      onError: () =>
        toast.error(t('asset.toast.updateError'), {
          description: t('asset.toast.codeTakenHint'),
        }),
    });
  }

  function handleAssignSubmit(data: AssignAssetInput) {
    assignMutation.mutate(data, {
      onSuccess: () => {
        toast.success(t('asset.assign.toast.success'));
        setAssignOpen(false);
      },
      onError: () =>
        toast.error(t('asset.assign.toast.error'), {
          description: t('asset.assign.toast.errorHint'),
        }),
    });
  }

  function handleReturnSubmit(data: ReturnAssetInput) {
    returnMutation.mutate(data, {
      onSuccess: () => {
        toast.success(t('asset.return.toast.success'));
        setReturnOpen(false);
      },
      onError: () =>
        toast.error(t('asset.return.toast.error'), {
          description: t('asset.return.toast.errorHint'),
        }),
    });
  }

  function handleStartMaintenance(data: CreateMaintenanceInput) {
    startMaintMutation.mutate(data, {
      onSuccess: () => {
        toast.success(t('asset.maintenance.toast.started'));
        setStartMaintOpen(false);
      },
      onError: () =>
        toast.error(t('asset.maintenance.toast.startError'), {
          description: t('asset.maintenance.toast.startErrorHint'),
        }),
    });
  }

  function handleCompleteMaintenance(data: CompleteMaintenanceInput) {
    completeMaintMutation.mutate(data, {
      onSuccess: () => {
        toast.success(t('asset.maintenance.toast.completed'));
        setCompleteMaintOpen(false);
      },
      onError: () =>
        toast.error(t('asset.maintenance.toast.completeError'), {
          description: t('asset.maintenance.toast.completeErrorHint'),
        }),
    });
  }

  function handleDispose(data: DisposeAssetInput) {
    disposeMutation.mutate(data, {
      onSuccess: () => {
        toast.success(t('asset.dispose.toast.success'));
        setDisposeOpen(false);
      },
      onError: () =>
        toast.error(t('asset.dispose.toast.error'), {
          description: t('asset.dispose.toast.errorHint'),
        }),
    });
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/assets')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('asset.detail.back')}
          </Button>
          <h1 className="text-2xl font-bold text-text-primary m-0">{t('asset.detail.title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          {asset.status === 'AVAILABLE' && (
            <Can permission="assets:assign">
              <Button variant="secondary" onClick={() => setAssignOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                {t('asset.assign.action')}
              </Button>
            </Can>
          )}
          {asset.status === 'ASSIGNED' && (
            <Can permission="assets:assign">
              <Button variant="secondary" onClick={() => setReturnOpen(true)}>
                <Undo2 className="h-4 w-4 mr-2" />
                {t('asset.return.action')}
              </Button>
            </Can>
          )}
          {asset.status === 'AVAILABLE' && (
            <Can permission="assets:maintain">
              <Button variant="secondary" onClick={() => setStartMaintOpen(true)}>
                <Wrench className="h-4 w-4 mr-2" />
                {t('asset.maintenance.startAction')}
              </Button>
            </Can>
          )}
          {asset.status === 'UNDER_MAINTENANCE' && (
            <Can permission="assets:maintain">
              <Button variant="secondary" onClick={() => setCompleteMaintOpen(true)}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {t('asset.maintenance.completeAction')}
              </Button>
            </Can>
          )}
          {(asset.status === 'AVAILABLE' || asset.status === 'UNDER_MAINTENANCE') && (
            <Can permission="assets:dispose">
              <Button
                variant="outline"
                className="text-danger border-danger/30 hover:bg-danger/10"
                onClick={() => setDisposeOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('asset.dispose.action')}
              </Button>
            </Can>
          )}
          <Can permission="assets:update">
            <Button onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              {t('asset.detail.edit')}
            </Button>
          </Can>
        </div>
      </div>

      <Tabs defaultValue="info" className="space-y-6">
        <TabsList>
          <TabsTrigger value="info">{t('asset.detail.tabs.info')}</TabsTrigger>
          <TabsTrigger value="history">{t('asset.detail.tabs.history')}</TabsTrigger>
          <TabsTrigger value="maintenance">{t('asset.detail.tabs.maintenance')}</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-6 mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Profile Card */}
            <Card className="lg:col-span-1">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-2xl bg-primary-light text-primary flex items-center justify-center mb-4">
                    <Package className="w-9 h-9" />
                  </div>
                  <h2 className="text-xl font-semibold text-text-primary">{asset.name}</h2>
                  <code className="text-text-muted font-mono text-sm mt-1">{asset.assetCode}</code>
                  <div className="mt-3">
                    <AssetStatusBadge status={asset.status} />
                  </div>

                  <Separator className="my-6" />

                  <div className="w-full space-y-4 text-left">
                    <div className="flex items-center gap-3 text-sm">
                      <Tag className="h-4 w-4 text-text-muted shrink-0" />
                      <span className="text-text-secondary">
                        {asset.category?.name ?? t('asset.detail.fields.category')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <MapPin className="h-4 w-4 text-text-muted shrink-0" />
                      <span className={asset.location ? 'text-text-secondary' : 'text-text-muted'}>
                        {asset.location || '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <User className="h-4 w-4 text-text-muted shrink-0" />
                      <span className={holder ? 'text-text-secondary' : 'text-text-muted'}>
                        {holder ? holder.fullName : t('asset.detail.unassigned')}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detail Cards */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-text-primary">
                    {t('asset.detail.sections.general')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-text-muted">{t('asset.detail.fields.brand')}</dt>
                      <dd className="text-sm font-medium text-text-primary mt-1">
                        {asset.brand || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-text-muted">{t('asset.detail.fields.model')}</dt>
                      <dd className="text-sm font-medium text-text-primary mt-1">
                        {asset.model || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-text-muted">
                        {t('asset.detail.fields.serialNumber')}
                      </dt>
                      <dd className="text-sm font-medium text-text-primary mt-1">
                        {asset.serialNumber || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-text-muted">
                        {t('asset.detail.fields.condition')}
                      </dt>
                      <dd className="text-sm font-medium text-text-primary mt-1">
                        {asset.condition ? t(`condition.${asset.condition}`) : '—'}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-text-primary">
                    {t('asset.detail.sections.purchase')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-text-muted">
                        {t('asset.detail.fields.purchaseDate')}
                      </dt>
                      <dd className="text-sm font-medium text-text-primary mt-1">
                        {formatDate(asset.purchaseDate, locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-text-muted">
                        {t('asset.detail.fields.purchaseCost')}
                      </dt>
                      <dd className="text-sm font-medium text-text-primary mt-1 tabular-nums">
                        {formatVnd(asset.purchaseCost)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-text-muted">
                        {t('asset.detail.fields.warrantyEndDate')}
                      </dt>
                      <dd className="text-sm font-medium text-text-primary mt-1">
                        {formatDate(asset.warrantyEndDate, locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-text-muted">{t('asset.detail.fields.vendor')}</dt>
                      <dd className="text-sm font-medium text-text-primary mt-1">
                        {asset.vendor || '—'}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              {asset.note && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold text-text-primary">
                      {t('asset.detail.sections.note')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-text-secondary whitespace-pre-wrap m-0">
                      {asset.note}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-0">
          <AssetAssignmentHistory assignments={asset.assignments} assetCode={asset.assetCode} />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-0">
          <AssetMaintenanceHistory maintenances={asset.maintenances} />
        </TabsContent>
      </Tabs>

      {/* Edit Sheet */}
      <AssetFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        asset={asset}
        onSubmit={handleEditSubmit}
        isLoading={updateMutation.isPending}
      />

      {/* Assign Sheet */}
      <AssignAssetSheet
        open={assignOpen}
        onOpenChange={setAssignOpen}
        onSubmit={handleAssignSubmit}
        isLoading={assignMutation.isPending}
      />

      {/* Return Sheet */}
      <ReturnAssetSheet
        open={returnOpen}
        onOpenChange={setReturnOpen}
        holderName={holder?.fullName}
        onSubmit={handleReturnSubmit}
        isLoading={returnMutation.isPending}
      />

      {/* Start Maintenance Sheet */}
      <MaintenanceSheet
        open={startMaintOpen}
        onOpenChange={setStartMaintOpen}
        mode="start"
        onStart={handleStartMaintenance}
        isLoading={startMaintMutation.isPending}
      />

      {/* Complete Maintenance Sheet */}
      <MaintenanceSheet
        open={completeMaintOpen}
        onOpenChange={setCompleteMaintOpen}
        mode="complete"
        onComplete={handleCompleteMaintenance}
        isLoading={completeMaintMutation.isPending}
      />

      {/* Dispose Dialog */}
      <DisposeDialog
        open={disposeOpen}
        onOpenChange={setDisposeOpen}
        onSubmit={handleDispose}
        isLoading={disposeMutation.isPending}
      />
    </div>
  );
}
