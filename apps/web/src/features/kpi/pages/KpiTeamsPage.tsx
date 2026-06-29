import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import type { TeamDto, UpsertTeamInput } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useDepartments } from '@/features/departments/hooks/useDepartments';
import { useEmployees } from '@/features/employees/hooks/useEmployees';
import { useKpiTeams, useKpiTeamMutations } from '../hooks/useKpiConfig';

const NONE = '__none__';

export function KpiTeamsPage() {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const { data: teams, isLoading } = useKpiTeams();
  const { create, update, remove } = useKpiTeamMutations();
  const [sheet, setSheet] = useState<TeamDto | 'new' | null>(null);
  const [confirm, setConfirm] = useState<TeamDto | null>(null);
  const fail = () => toast.error(tc('states.error'));

  return (
    <div className="p-6 space-y-6 max-w-screen-lg">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users size={22} className="text-primary" />{t('teams.title')}
          </h1>
          <p className="text-sm text-text-secondary mt-1">{t('teams.subtitle')}</p>
        </div>
        <Button onClick={() => setSheet('new')}><Plus size={16} className="mr-1.5" />{t('teams.add')}</Button>
      </div>

      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {isLoading ? (
          <p className="p-4 text-sm text-text-muted">{tc('states.loading')}</p>
        ) : (teams ?? []).length === 0 ? (
          <p className="p-6 text-sm text-text-muted text-center">{t('teams.empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {teams!.map((team) => (
              <li key={team.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-alt/40">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{team.name}</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    {team.departmentName ?? t('teams.noDept')}{team.leadName ? ` · ${t('teams.lead')}: ${team.leadName}` : ''}
                  </div>
                </div>
                <Badge variant="outline" className="tabular-nums">{team.memberCount} {t('teams.members')}</Badge>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSheet(team)} aria-label={tc('actions.edit')}><Pencil size={14} /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-danger" onClick={() => setConfirm(team)} aria-label={tc('actions.delete')}><Trash2 size={14} /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <TeamFormSheet
        open={sheet !== null}
        onOpenChange={(o) => !o && setSheet(null)}
        initial={sheet && sheet !== 'new' ? sheet : null}
        isLoading={create.isPending || update.isPending}
        onSubmit={(body) => {
          const done = { onSuccess: () => { toast.success(t('toast.saved')); setSheet(null); }, onError: fail };
          if (sheet === 'new') create.mutate(body, done);
          else if (sheet) update.mutate({ id: sheet.id, body }, done);
        }}
      />

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('config.confirmDeleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('config.confirmDeleteDesc', { name: confirm?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-danger hover:bg-danger/90"
              onClick={() => { if (confirm) remove.mutate(confirm.id, { onSuccess: () => toast.success(t('toast.deleted')), onError: fail }); setConfirm(null); }}>
              {tc('actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface FormProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: TeamDto | null;
  onSubmit: (body: UpsertTeamInput) => void;
  isLoading?: boolean;
}

function TeamFormSheet({ open, onOpenChange, initial, onSubmit, isLoading }: FormProps) {
  const { t } = useTranslation('kpi');
  const { t: tc } = useTranslation('common');
  const { data: departments } = useDepartments();
  const { data: employeePage } = useEmployees({ limit: 200 });
  const employees = employeePage?.data ?? [];

  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState<string>(NONE);
  const [leadId, setLeadId] = useState<string>(NONE);
  const [memberIds, setMemberIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setDepartmentId(initial?.departmentId ?? NONE);
      setLeadId(initial?.leadId ?? NONE);
      setMemberIds(initial?.memberIds ?? []);
    }
  }, [open, initial]);

  function submit() {
    if (!name.trim()) return;
    // Luôn gửi tập member mong muốn (đã prepopulate từ DTO) → tránh xóa nhầm khi sửa.
    onSubmit({
      name: name.trim(),
      departmentId: departmentId === NONE ? null : departmentId,
      leadId: leadId === NONE ? null : leadId,
      memberIds,
    });
  }

  const toggleMember = (id: string) => setMemberIds((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{initial ? t('teams.editTitle') : t('teams.createTitle')}</SheetTitle>
        </SheetHeader>
        <div className="mt-6 flex-1 overflow-y-auto space-y-4">
          <div className="space-y-1.5">
            <Label>{t('teams.name')} <span className="text-danger">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Squad Alpha" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('teams.department')}</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('teams.noDept')}</SelectItem>
                {(departments ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('teams.lead')}</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('teams.noLead')}</SelectItem>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('teams.assignMembers')}</Label>
            <p className="text-xs text-text-muted">{t('teams.membersHint')}</p>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {employees.map((e) => (
                <button key={e.id} type="button" onClick={() => toggleMember(e.id)}
                  className={cn('px-2.5 py-1 rounded-full text-xs border transition-colors',
                    memberIds.includes(e.id) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-surface-alt')}>
                  {e.fullName}
                </button>
              ))}
            </div>
          </div>
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tc('actions.cancel')}</Button>
          <Button onClick={submit} disabled={isLoading}>{tc('actions.save')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
