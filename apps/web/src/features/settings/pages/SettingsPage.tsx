import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  Boxes,
  Building2,
  BellRing,
  CalendarCog,
  ChevronRight,
  ClipboardCheck,
  Globe2,
  History,
  ShieldCheck,
  Lock,
  CreditCard,
} from 'lucide-react';
import type {
  PermissionKey,
  SettingsAuditEntry,
  TenantSettingsDto,
  TenantSettingsSection,
} from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermission } from '@/hooks/usePermission';
import { IssuingEntitiesSection } from '@/features/issuing-entities/components/IssuingEntitiesSection';
import { useSettingsAudit, useTenantSettings, useUpdateSettings } from '../hooks/useSettings';

// SPEC-036 — hub cards link to the existing domain settings areas; each card
// is gated by that area's own view permission (UX only, routes re-check).
const HUB_AREAS: { key: string; permission: PermissionKey; to: string; icon: React.ElementType }[] = [
  { key: 'roles', permission: 'roles:view', to: '/settings/roles', icon: ShieldCheck },
  { key: 'timesheet', permission: 'timesheet:view', to: '/settings/timesheet', icon: CalendarCog },
  { key: 'assets', permission: 'assets:view', to: '/settings/assets', icon: Boxes },
  { key: 'probation', permission: 'probation:configure', to: '/probation', icon: ClipboardCheck },
];

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary m-0 flex items-center gap-2">
          <Icon className="w-[18px] h-[18px] text-text-secondary" />
          {title}
        </h3>
        <p className="text-xs text-text-muted mt-1 m-0">{description}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function SaveButton({ onSave, disabled }: { onSave: () => void; disabled: boolean }) {
  const { t } = useTranslation('settings');
  return (
    <div className="flex justify-end pt-4">
      <Button size="sm" onClick={onSave} disabled={disabled}>
        {disabled ? t('saving') : t('save')}
      </Button>
    </div>
  );
}

type SaveSection = (section: TenantSettingsSection, payload: Record<string, unknown>) => void;

function CompanySection({
  value,
  canEdit,
  onSave,
  isPending,
}: {
  value: TenantSettingsDto['company'];
  canEdit: boolean;
  onSave: SaveSection;
  isPending: boolean;
}) {
  const { t } = useTranslation('settings');
  const [form, setForm] = useState(value);
  useEffect(() => setForm(value), [value]);
  const field = (key: keyof typeof form) => ({
    id: `company-${key}`,
    value: form[key],
    disabled: !canEdit,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <SectionCard icon={Building2} title={t('company.title')} description={t('company.description')}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="company-name" className="text-sm font-medium">{t('company.name')}</Label>
          <Input className="h-9 text-sm" {...field('name')} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="company-address" className="text-sm font-medium">{t('company.address')}</Label>
          <Input className="h-9 text-sm" {...field('address')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company-taxCode" className="text-sm font-medium">{t('company.taxCode')}</Label>
          <Input className="h-9 text-sm" {...field('taxCode')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company-phone" className="text-sm font-medium">{t('company.phone')}</Label>
          <Input className="h-9 text-sm" {...field('phone')} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="company-contactEmail" className="text-sm font-medium">
            {t('company.contactEmail')}
          </Label>
          <Input type="email" className="h-9 text-sm" {...field('contactEmail')} />
        </div>
      </div>
      {canEdit && <SaveButton onSave={() => onSave('company', { ...form })} disabled={isPending} />}
    </SectionCard>
  );
}

function NotificationsSection({
  value,
  canEdit,
  onSave,
  isPending,
}: {
  value: TenantSettingsDto['notifications'];
  canEdit: boolean;
  onSave: SaveSection;
  isPending: boolean;
}) {
  const { t } = useTranslation('settings');
  const [form, setForm] = useState(value);
  useEffect(() => setForm(value), [value]);

  return (
    <SectionCard
      icon={BellRing}
      title={t('notifications.title')}
      description={t('notifications.description')}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="lead-probation" className="text-sm font-medium">
            {t('notifications.probationLeadDays')}
          </Label>
          <Input
            id="lead-probation"
            type="number"
            min={1}
            max={30}
            className="h-9 text-sm"
            value={form.probationLeadDays}
            disabled={!canEdit}
            onChange={(e) => setForm((f) => ({ ...f, probationLeadDays: Number(e.target.value) }))}
          />
          <p className="text-xs text-text-muted m-0">{t('notifications.probationLeadHint')}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-contract" className="text-sm font-medium">
            {t('notifications.contractLeadDays')}
          </Label>
          <Input
            id="lead-contract"
            type="number"
            min={1}
            max={90}
            className="h-9 text-sm"
            value={form.contractLeadDays}
            disabled={!canEdit}
            onChange={(e) => setForm((f) => ({ ...f, contractLeadDays: Number(e.target.value) }))}
          />
          <p className="text-xs text-text-muted m-0">{t('notifications.contractLeadHint')}</p>
        </div>
      </div>
      {canEdit && (
        <SaveButton onSave={() => onSave('notifications', { ...form })} disabled={isPending} />
      )}
    </SectionCard>
  );
}

function RegionalSection({
  value,
  canEdit,
  onSave,
  isPending,
}: {
  value: TenantSettingsDto['regional'];
  canEdit: boolean;
  onSave: SaveSection;
  isPending: boolean;
}) {
  const { t } = useTranslation('settings');
  const [form, setForm] = useState(value);
  useEffect(() => setForm(value), [value]);

  return (
    <SectionCard icon={Globe2} title={t('regional.title')} description={t('regional.description')}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t('regional.defaultLanguage')}</Label>
          <Select
            value={form.defaultLanguage}
            onValueChange={(v) => setForm((f) => ({ ...f, defaultLanguage: v as 'vi' | 'en' }))}
            disabled={!canEdit}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vi">Tiếng Việt</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-text-muted m-0">{t('regional.defaultLanguageHint')}</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">{t('regional.weekStart')}</Label>
          <Select
            value={form.weekStart}
            onValueChange={(v) => setForm((f) => ({ ...f, weekStart: v as 'mon' | 'sun' }))}
            disabled={!canEdit}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mon">{t('regional.monday')}</SelectItem>
              <SelectItem value="sun">{t('regional.sunday')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {canEdit && <SaveButton onSave={() => onSave('regional', { ...form })} disabled={isPending} />}
    </SectionCard>
  );
}

function SecuritySection({
  value,
  canEdit,
  onSave,
  isPending,
}: {
  value: TenantSettingsDto['security'];
  canEdit: boolean;
  onSave: SaveSection;
  isPending: boolean;
}) {
  const { t } = useTranslation('settings');
  const [form, setForm] = useState(value);
  useEffect(() => setForm(value), [value]);

  return (
    <SectionCard icon={Lock} title={t('security.title')} description={t('security.description')}>
      <div className="space-y-4">
        <div className="space-y-1.5 max-w-48">
          <Label htmlFor="security-minlen" className="text-sm font-medium">
            {t('security.passwordMinLength')}
          </Label>
          <Input
            id="security-minlen"
            type="number"
            min={8}
            max={32}
            className="h-9 text-sm"
            value={form.passwordMinLength}
            disabled={!canEdit}
            onChange={(e) => setForm((f) => ({ ...f, passwordMinLength: Number(e.target.value) }))}
          />
        </div>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-primary)]"
            checked={form.forceSso}
            disabled={!canEdit}
            onChange={(e) => setForm((f) => ({ ...f, forceSso: e.target.checked }))}
          />
          <span>
            <span className="text-sm font-medium text-text-primary block">{t('security.forceSso')}</span>
            <span className="text-xs text-text-muted block mt-0.5">{t('security.forceSsoHint')}</span>
          </span>
        </label>
      </div>
      {canEdit && <SaveButton onSave={() => onSave('security', { ...form })} disabled={isPending} />}
    </SectionCard>
  );
}

function PlanSection({ value }: { value: TenantSettingsDto['plan'] }) {
  const { t } = useTranslation('settings');
  return (
    <SectionCard icon={CreditCard} title={t('plan.title')} description={t('plan.description')}>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-text-muted m-0">{t('plan.planName')}</p>
          <p className="text-lg font-semibold text-text-primary m-0 mt-1">{value.name}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted m-0">{t('plan.seats')}</p>
          <p className="text-lg font-semibold text-text-primary m-0 mt-1 tabular-nums">
            {value.seatsUsed}
          </p>
        </div>
        <div>
          <p className="text-xs text-text-muted m-0">{t('plan.seatLimit')}</p>
          <p className="text-lg font-semibold text-text-primary m-0 mt-1 tabular-nums">
            {value.seatLimit ?? t('plan.unlimited')}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

function formatAuditTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AuditSection({ entries }: { entries: SettingsAuditEntry[] }) {
  const { t } = useTranslation('settings');
  return (
    <SectionCard icon={History} title={t('audit.title')} description={t('audit.description')}>
      {entries.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-6 m-0">{t('audit.empty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-background hover:bg-background">
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('audit.columns.time')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('audit.columns.user')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('audit.columns.section')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('audit.columns.changes')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id} className="h-11">
                <TableCell className="text-xs tabular-nums text-text-secondary whitespace-nowrap">
                  {formatAuditTime(entry.createdAt)}
                </TableCell>
                <TableCell className="text-sm text-text-primary">{entry.changedBy.fullName}</TableCell>
                <TableCell className="text-sm text-text-secondary">
                  {t(`audit.sections.${entry.section}`, { defaultValue: entry.section })}
                </TableCell>
                <TableCell className="text-xs text-text-secondary">
                  {Object.entries(entry.changes)
                    .map(([key, c]) => `${key}: ${String(c.from ?? '—')} → ${String(c.to ?? '—')}`)
                    .join(' · ')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}

export function SettingsPage() {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const { can } = usePermission();
  const { data, isLoading, isError } = useTenantSettings();
  const { data: audit } = useSettingsAudit();
  const updateMutation = useUpdateSettings();
  const canEdit = can('settings:update');

  const saveSection: SaveSection = (section, payload) =>
    updateMutation.mutate({ section, payload }, {});

  const hubAreas = HUB_AREAS.filter((area) => can(area.permission));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary m-0">{t('title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('subtitle')}</p>
      </div>

      {hubAreas.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {hubAreas.map((area) => {
            const Icon = area.icon;
            return (
              <button
                key={area.key}
                type="button"
                onClick={() => navigate(area.to)}
                className="bg-surface rounded-xl border border-border shadow-sm p-4 text-left
                  flex items-start gap-3 cursor-pointer transition-all duration-150
                  hover:-translate-y-0.5 hover:shadow-md
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon className="size-4" />
                </div>
                <span className="min-w-0">
                  <span className="text-sm font-semibold text-text-primary flex items-center gap-1">
                    {t(`hub.${area.key}.title`)}
                    <ChevronRight className="size-3.5 text-text-muted" />
                  </span>
                  <span className="text-xs text-text-muted block mt-0.5">
                    {t(`hub.${area.key}.description`)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {isError ? (
        <div
          role="alert"
          className="bg-danger-light border border-danger/30 text-danger rounded-xl px-5 py-4 text-sm flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {t('errorLoad')}
        </div>
      ) : isLoading || !data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <CompanySection
              value={data.company}
              canEdit={canEdit}
              onSave={saveSection}
              isPending={updateMutation.isPending}
            />
            <div className="flex flex-col gap-5">
              <NotificationsSection
                value={data.notifications}
                canEdit={canEdit}
                onSave={saveSection}
                isPending={updateMutation.isPending}
              />
              <RegionalSection
                value={data.regional}
                canEdit={canEdit}
                onSave={saveSection}
                isPending={updateMutation.isPending}
              />
            </div>
            <SecuritySection
              value={data.security}
              canEdit={canEdit}
              onSave={saveSection}
              isPending={updateMutation.isPending}
            />
            <PlanSection value={data.plan} />
          </div>
          <IssuingEntitiesSection canEdit={canEdit} />
          <AuditSection entries={audit ?? []} />
        </>
      )}
    </div>
  );
}
