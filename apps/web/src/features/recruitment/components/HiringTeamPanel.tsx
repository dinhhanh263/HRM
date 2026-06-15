import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Trash2, Users, X } from 'lucide-react';
import type { HiringTeamMemberDto, HiringTeamRole, JobDto } from '@hrm/shared';
import { HiringTeamRole as HiringTeamRoleEnum } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/toast';
import { getInitials } from '@/lib/utils';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import {
  useAddHiringTeamMember,
  useUpdateHiringTeamMember,
  useRemoveHiringTeamMember,
} from '../hooks/useJobs';

const TEAM_ROLES = Object.values(HiringTeamRoleEnum);

function AddMemberSheet({
  job,
  open,
  onOpenChange,
}: {
  job: JobDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const addMutation = useAddHiringTeamMember(job.id);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [teamRole, setTeamRole] = useState<HiringTeamRole>(HiringTeamRoleEnum.RECRUITER);

  useEffect(() => {
    if (open) {
      setSearchInput('');
      setSearch('');
      setSelectedId(null);
      setTeamRole(HiringTeamRoleEnum.RECRUITER);
    }
  }, [open]);

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const { data, isLoading } = useEmployees({ search, status: 'ACTIVE', limit: 20 });
  const existingIds = useMemo(
    () => new Set(job.hiringTeam.map((m) => m.employeeId)),
    [job.hiringTeam]
  );
  const candidates = (data?.data ?? []).filter((e) => !existingIds.has(e.id));

  function submit() {
    if (!selectedId) return;
    addMutation.mutate(
      { employeeId: selectedId, teamRole },
      {
        onSuccess: () => {
          toast.success(t('job.hiringTeam.toast.added'));
          onOpenChange(false);
        },
        onError: (err) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          toast.error(
            status === 409
              ? t('job.hiringTeam.toast.duplicate')
              : t('job.hiringTeam.toast.error')
          );
        },
      }
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-[420px] sm:w-[480px] sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>{t('job.hiringTeam.form.title')}</SheetTitle>
          <SheetDescription>{t('job.hiringTeam.form.description')}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>{t('job.hiringTeam.form.employeeLabel')}</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-text-muted pointer-events-none" />
              <Input
                placeholder={t('job.hiringTeam.form.employeePlaceholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className={`pl-8 h-9 text-sm ${searchInput ? 'pr-7' : ''}`}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  aria-label={tc('actions.clearSearch')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-1">
              {isLoading ? (
                <p className="px-2 py-6 text-center text-xs text-text-muted">{tc('states.loading')}</p>
              ) : candidates.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-text-muted">
                  {tc('states.noResults')}
                </p>
              ) : (
                candidates.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => setSelectedId(emp.id)}
                    className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors ${
                      selectedId === emp.id ? 'bg-primary/10' : 'hover:bg-surface-alt'
                    }`}
                  >
                    <Avatar style={{ width: 32, height: 32 }}>
                      <AvatarImage src={emp.avatar ?? undefined} alt={emp.fullName} />
                      <AvatarFallback style={{ fontSize: 12 }}>
                        {getInitials(emp.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {emp.fullName}
                      </p>
                      <p className="text-xs text-text-muted truncate">
                        {emp.department?.name ?? t('job.hiringTeam.noDepartment')}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('job.hiringTeam.form.roleLabel')}</Label>
            <Select value={teamRole} onValueChange={(v) => setTeamRole(v as HiringTeamRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAM_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {t(`job.hiringTeam.role.${role}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={!selectedId || addMutation.isPending}>
            {addMutation.isPending ? tc('states.saving') : t('job.hiringTeam.form.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function MemberRow({
  job,
  member,
  canEdit,
}: {
  job: JobDto;
  member: HiringTeamMemberDto;
  canEdit: boolean;
}) {
  const { t } = useTranslation('recruitment');
  const { t: tc } = useTranslation('common');
  const updateMutation = useUpdateHiringTeamMember(job.id);
  const removeMutation = useRemoveHiringTeamMember(job.id);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function changeRole(teamRole: HiringTeamRole) {
    if (teamRole === member.teamRole) return;
    updateMutation.mutate(
      { memberId: member.id, teamRole },
      {
        onSuccess: () => toast.success(t('job.hiringTeam.toast.updated')),
        onError: () => toast.error(t('job.hiringTeam.toast.error')),
      }
    );
  }

  function remove() {
    removeMutation.mutate(member.id, {
      onSuccess: () => {
        toast.success(t('job.hiringTeam.toast.removed'));
        setConfirmOpen(false);
      },
      onError: () => toast.error(t('job.hiringTeam.toast.error')),
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
      <Avatar style={{ width: 32, height: 32 }}>
        <AvatarImage src={member.employee.avatar ?? undefined} alt={member.employee.fullName} />
        <AvatarFallback style={{ fontSize: 12 }}>
          {getInitials(member.employee.fullName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary truncate">
          {member.employee.fullName}
        </p>
        <p className="text-xs text-text-muted truncate">
          {member.employee.department?.name ?? t('job.hiringTeam.noDepartment')}
        </p>
      </div>

      {canEdit ? (
        <>
          <Select value={member.teamRole} onValueChange={(v) => changeRole(v as HiringTeamRole)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEAM_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {t(`job.hiringTeam.role.${role}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            aria-label={t('job.hiringTeam.remove')}
            onClick={() => setConfirmOpen(true)}
            className="text-text-muted hover:text-danger transition-colors"
          >
            <Trash2 size={15} />
          </button>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('job.hiringTeam.removeDialog.title')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('job.hiringTeam.removeDialog.description')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    remove();
                  }}
                  className="bg-danger hover:bg-danger/90"
                  disabled={removeMutation.isPending}
                >
                  {t('job.hiringTeam.remove')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : (
        <span className="text-xs text-text-secondary">
          {t(`job.hiringTeam.role.${member.teamRole}`)}
        </span>
      )}
    </div>
  );
}

export function HiringTeamPanel({ job, canEdit }: { job: JobDto; canEdit: boolean }) {
  const { t } = useTranslation('recruitment');
  const [addOpen, setAddOpen] = useState(false);

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-text-primary">
            <Users size={16} className="text-text-muted" />
            {t('job.hiringTeam.title')}
          </h2>
          <p className="text-xs text-text-muted mt-1 max-w-md">{t('job.hiringTeam.subtitle')}</p>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => setAddOpen(true)}>
            <Plus size={13} className="mr-1.5" />
            {t('job.hiringTeam.add')}
          </Button>
        )}
      </div>

      <div className="p-4">
        {job.hiringTeam.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">{t('job.hiringTeam.empty')}</p>
        ) : (
          <div className="space-y-2">
            {job.hiringTeam.map((member) => (
              <MemberRow key={member.id} job={job} member={member} canEdit={canEdit} />
            ))}
          </div>
        )}
      </div>

      {canEdit && <AddMemberSheet job={job} open={addOpen} onOpenChange={setAddOpen} />}
    </section>
  );
}
