import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  BellRing,
  Globe,
  KeyRound,
  MonitorSmartphone,
  UserRound,
} from 'lucide-react';
import type { MyAccountDto } from '@hrm/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthStore } from '@/stores/auth.store';
import { usePublicSettings } from '@/features/settings/hooks/useSettings';
import {
  useChangePassword,
  useMyAccount,
  useMySessions,
  useRevokeOtherSessions,
  useUpdateMyProfile,
  useUpdateNotificationPrefs,
} from '../hooks/useAccount';

const TAB_KEYS = ['profile', 'security', 'notifications'] as const;
type TabKey = (typeof TAB_KEYS)[number];

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function formatDate(iso: string | null, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return withTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-text-muted m-0">{label}</p>
      <p className="text-sm font-medium text-text-primary m-0 mt-1">{value ?? '—'}</p>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary m-0 flex items-center gap-2">
          <Icon className="w-[18px] h-[18px] text-text-secondary" />
          {title}
        </h3>
        {description && <p className="text-xs text-text-muted mt-1 m-0">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ProfileTab({ account }: { account: MyAccountDto }) {
  const { t } = useTranslation('account');
  const updateProfile = useUpdateMyProfile();
  const [phone, setPhone] = useState(account.employee?.phone ?? '');
  const [avatar, setAvatar] = useState(account.employee?.avatar ?? '');
  useEffect(() => {
    setPhone(account.employee?.phone ?? '');
    setAvatar(account.employee?.avatar ?? '');
  }, [account.employee]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      <SectionCard
        icon={UserRound}
        title={t('profile.title')}
        description={t('profile.managedByHr')}
      >
        <div className="flex items-center gap-4 mb-5">
          <Avatar className="size-14">
            <AvatarImage src={account.employee?.avatar || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
              {getInitials(account.user.fullName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-base font-semibold text-text-primary m-0">{account.user.fullName}</p>
            <p className="text-sm text-text-muted m-0 mt-0.5">{account.user.email}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ReadOnlyField label={t('profile.role')} value={account.user.role} />
          {account.employee ? (
            <>
              <ReadOnlyField label={t('profile.employeeCode')} value={account.employee.employeeCode} />
              <ReadOnlyField label={t('profile.department')} value={account.employee.departmentName} />
              <ReadOnlyField label={t('profile.position')} value={account.employee.positionName} />
              <ReadOnlyField label={t('profile.joinDate')} value={formatDate(account.employee.joinDate)} />
            </>
          ) : (
            <p className="text-sm text-text-muted col-span-2 m-0">{t('profile.noEmployee')}</p>
          )}
        </div>
      </SectionCard>

      {account.employee && (
        <SectionCard icon={UserRound} title={t('profile.editable')}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="account-phone" className="text-sm font-medium">
                {t('profile.phone')}
              </Label>
              <Input
                id="account-phone"
                className="h-9 text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-avatar" className="text-sm font-medium">
                {t('profile.avatar')}
              </Label>
              <Input
                id="account-avatar"
                className="h-9 text-sm"
                placeholder="https://..."
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
              />
              <p className="text-xs text-text-muted m-0">{t('profile.avatarHint')}</p>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={updateProfile.isPending}
                onClick={() => updateProfile.mutate({ phone, avatar }, {})}
              >
                {t('save')}
              </Button>
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function ChangePasswordCard() {
  const { t } = useTranslation('account');
  const changePassword = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mismatch, setMismatch] = useState(false);

  function submit() {
    if (next !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    changePassword.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setConfirm('');
        },
      }
    );
  }

  return (
    <SectionCard icon={KeyRound} title={t('password.title')} description={t('password.description')}>
      <div className="space-y-4 max-w-sm">
        <div className="space-y-1.5">
          <Label htmlFor="pw-current" className="text-sm font-medium">{t('password.current')}</Label>
          <Input id="pw-current" type="password" className="h-9 text-sm" value={current}
            onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw-new" className="text-sm font-medium">{t('password.new')}</Label>
          <Input id="pw-new" type="password" className="h-9 text-sm" value={next}
            onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw-confirm" className="text-sm font-medium">{t('password.confirm')}</Label>
          <Input id="pw-confirm" type="password" className="h-9 text-sm" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} />
          {mismatch && (
            <p className="text-xs text-danger flex items-center gap-1 m-0">
              <AlertCircle className="size-3" />
              {t('password.mismatch')}
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={changePassword.isPending || !current || !next || !confirm}
            onClick={submit}
          >
            {t('password.submit')}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

function SessionsCard() {
  const { t } = useTranslation('account');
  const { data: sessions, isLoading } = useMySessions();
  const revokeOthers = useRevokeOtherSessions();
  const hasOthers = (sessions ?? []).some((s) => !s.current);

  return (
    <SectionCard
      icon={MonitorSmartphone}
      title={t('sessions.title')}
      description={t('sessions.description')}
    >
      {isLoading ? (
        <Skeleton className="h-24 rounded" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="bg-background hover:bg-background">
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  {t('sessions.device')}
                </TableHead>
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  {t('sessions.createdAt')}
                </TableHead>
                <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  {t('sessions.lastUsedAt')}
                </TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sessions ?? []).map((s) => (
                <TableRow key={s.id} className="h-11">
                  <TableCell className="text-sm text-text-primary">
                    {s.device ?? t('sessions.unknownDevice')}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-text-secondary">
                    {formatDate(s.createdAt, true)}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-text-secondary">
                    {formatDate(s.lastUsedAt, true)}
                  </TableCell>
                  <TableCell className="text-right">
                    {s.current && (
                      <Badge variant="outline" className="text-xs font-medium bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                        {t('sessions.current')}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {hasOthers && (
            <div className="flex justify-end pt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="danger" size="sm" disabled={revokeOthers.isPending}>
                    {t('sessions.revokeOthers')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('sessions.revokeConfirmTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('sessions.revokeConfirmBody')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('sessions.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive hover:bg-destructive/90"
                      onClick={() => revokeOthers.mutate()}
                    >
                      {t('sessions.confirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

function GoogleCard({ linkedAt }: { linkedAt: string | null }) {
  const { t } = useTranslation('account');
  return (
    <SectionCard icon={Globe} title={t('google.title')}>
      <p className="text-sm text-text-secondary m-0">
        {linkedAt ? t('google.linked', { date: formatDate(linkedAt) }) : t('google.notLinked')}
      </p>
    </SectionCard>
  );
}

const PREF_KINDS = ['probation_ending', 'contract_expiring'] as const;

function NotificationsTab({ account }: { account: MyAccountDto }) {
  const { t } = useTranslation('account');
  const updatePrefs = useUpdateNotificationPrefs();

  return (
    <SectionCard
      icon={BellRing}
      title={t('notifications.title')}
      description={t('notifications.description')}
    >
      <div className="space-y-4">
        {PREF_KINDS.map((kind) => {
          const enabled = account.notificationPrefs[kind] !== false;
          return (
            <label key={kind} className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--color-primary)]"
                checked={enabled}
                disabled={updatePrefs.isPending}
                onChange={(e) => updatePrefs.mutate({ [kind]: e.target.checked })}
              />
              <span>
                <span className="text-sm font-medium text-text-primary block">
                  {t(`notifications.${kind}`)}
                </span>
                <span className="text-xs text-text-muted block mt-0.5">
                  {t(`notifications.${kind}Hint`)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </SectionCard>
  );
}

// SPEC-037 — "Hồ sơ cá nhân" opens the profile tab, "Cài đặt tài khoản" opens
// security (?tab=security). Tab switches update the URL so both stay linkable.
export function AccountPage() {
  const { t } = useTranslation('account');
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthStore((s) => s.user?.role);
  const { data: publicSettings } = usePublicSettings();
  const { data: account, isLoading, isError } = useMyAccount();

  const rawTab = searchParams.get('tab');
  const tab: TabKey = TAB_KEYS.includes(rawTab as TabKey) ? (rawTab as TabKey) : 'profile';

  // forceSso → mật khẩu vô dụng cho non-SUPER_ADMIN; server cũng chặn endpoint.
  const passwordDisabled = publicSettings?.security.forceSso === true && role !== 'SUPER_ADMIN';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary m-0">{t('title')}</h1>
        <p className="text-sm text-text-secondary mt-1">{t('subtitle')}</p>
      </div>

      {isError ? (
        <div
          role="alert"
          className="bg-danger-light border border-danger/30 text-danger rounded-xl px-5 py-4 text-sm flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {t('errorLoad')}
        </div>
      ) : isLoading || !account ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" aria-busy="true">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}
        >
          <TabsList>
            <TabsTrigger value="profile">{t('tabs.profile')}</TabsTrigger>
            <TabsTrigger value="security">{t('tabs.security')}</TabsTrigger>
            <TabsTrigger value="notifications">{t('tabs.notifications')}</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="mt-5">
            <ProfileTab account={account} />
          </TabsContent>
          <TabsContent value="security" className="mt-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              <div className="flex flex-col gap-5">
                {passwordDisabled ? (
                  <SectionCard icon={KeyRound} title={t('password.title')}>
                    <p className="text-sm text-text-secondary m-0">{t('password.ssoOnly')}</p>
                  </SectionCard>
                ) : (
                  <ChangePasswordCard />
                )}
                <GoogleCard linkedAt={account.googleLinkedAt} />
              </div>
              <SessionsCard />
            </div>
          </TabsContent>
          <TabsContent value="notifications" className="mt-5">
            <div className="max-w-xl">
              <NotificationsTab account={account} />
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
