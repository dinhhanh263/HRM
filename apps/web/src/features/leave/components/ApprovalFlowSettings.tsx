import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ApprovalFlowDto,
  ApprovalStepInput,
  ApproverType,
  CreateApprovalFlowRequest,
  WatcherInput,
} from '@hrm/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/api-error';
import { Can } from '@/components/auth/Can';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, X, Eye } from 'lucide-react';
import {
  useApprovalFlows,
  useCreateApprovalFlow,
  useUpdateApprovalFlow,
  useDeleteApprovalFlow,
} from '../hooks/useApprovalFlows';
import { useDepartments } from '@/features/departments/hooks/useDepartments';
import { useRoles } from '@/features/roles/hooks/useRoles';
import { useEmployees } from '@/features/employees/hooks/useEmployees';

const APPROVER_TYPES: ApproverType[] = ['MANAGER', 'DEPARTMENT_HEAD', 'ROLE', 'SPECIFIC_USER'];
// SPEC-046: CC/watchers only support ROLE (e.g. HR Manager/Staff) or a specific person.
const WATCHER_TYPES: WatcherInput['watcherType'][] = ['ROLE', 'SPECIFIC_USER'];

interface FlowFormState {
  name: string;
  departmentId: string | null;
  steps: ApprovalStepInput[];
  watchers: WatcherInput[];
}

const EMPTY_FORM: FlowFormState = {
  name: '',
  departmentId: null,
  steps: [{ approverType: 'MANAGER' }],
  watchers: [],
};

export function ApprovalFlowSettings() {
  const { t } = useTranslation('leave');

  // Surface the API's specific reason (e.g. a duplicate default flow) instead of
  // a generic "try again" — falls back to the server message, then the generic.
  function describeFlowError(error: unknown): string {
    const code = getApiErrorCode(error);
    if (code) {
      const translated = t(`toast.flowErrors.${code}`, { defaultValue: '' });
      if (translated) return translated;
    }
    return getApiErrorMessage(error, t('toast.tryAgain'));
  }
  const { data: flows, isLoading } = useApprovalFlows();
  const { data: departments } = useDepartments();
  const { data: roles } = useRoles();
  const { data: employeesPage } = useEmployees({ limit: 100, status: 'ACTIVE' });
  const employees = employeesPage?.data ?? [];

  const createMutation = useCreateApprovalFlow();
  const [editing, setEditing] = useState<ApprovalFlowDto | null>(null);
  const updateMutation = useUpdateApprovalFlow(editing?.id ?? '');
  const deleteMutation = useDeleteApprovalFlow();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FlowFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<ApprovalFlowDto | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(flow: ApprovalFlowDto) {
    setEditing(flow);
    setForm({
      name: flow.name,
      departmentId: flow.departmentId,
      steps: flow.steps.map((s) => ({
        approverType: s.approverType,
        roleKey: s.roleKey,
        approverId: s.approverId,
      })),
      watchers: flow.watchers.map((w) => ({
        watcherType: w.watcherType,
        roleKey: w.roleKey,
        watcherId: w.watcherId,
      })),
    });
    setFormOpen(true);
  }

  // ---- steps editor ----
  function addStep() {
    setForm((f) => ({ ...f, steps: [...f.steps, { approverType: 'MANAGER' }] }));
  }
  function removeStep(idx: number) {
    setForm((f) => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }));
  }
  function moveStep(idx: number, dir: -1 | 1) {
    setForm((f) => {
      const next = [...f.steps];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return f;
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...f, steps: next };
    });
  }
  function updateStep(idx: number, patch: Partial<ApprovalStepInput>) {
    setForm((f) => ({
      ...f,
      steps: f.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }

  // ---- watchers (CC) editor ----
  function addWatcher() {
    setForm((f) => ({ ...f, watchers: [...f.watchers, { watcherType: 'ROLE' }] }));
  }
  function removeWatcher(idx: number) {
    setForm((f) => ({ ...f, watchers: f.watchers.filter((_, i) => i !== idx) }));
  }
  function updateWatcher(idx: number, patch: Partial<WatcherInput>) {
    setForm((f) => ({
      ...f,
      watchers: f.watchers.map((w, i) => (i === idx ? { ...w, ...patch } : w)),
    }));
  }

  function isFormValid(): boolean {
    if (!form.name.trim() || form.steps.length === 0) return false;
    const stepsOk = form.steps.every((s) => {
      if (s.approverType === 'ROLE') return !!s.roleKey;
      if (s.approverType === 'SPECIFIC_USER') return !!s.approverId;
      return true;
    });
    if (!stepsOk) return false;
    // Watchers are optional, but each present row must be complete.
    return form.watchers.every((w) => {
      if (w.watcherType === 'ROLE') return !!w.roleKey;
      return !!w.watcherId;
    });
  }

  function submit() {
    // Normalize: only keep the field relevant to each approver type.
    const steps: ApprovalStepInput[] = form.steps.map((s) => ({
      approverType: s.approverType,
      roleKey: s.approverType === 'ROLE' ? s.roleKey : null,
      approverId: s.approverType === 'SPECIFIC_USER' ? s.approverId : null,
    }));

    // Normalize CC/watchers: keep only the field relevant to each type.
    const watchers: WatcherInput[] = form.watchers.map((w) => ({
      watcherType: w.watcherType,
      roleKey: w.watcherType === 'ROLE' ? w.roleKey : null,
      watcherId: w.watcherType === 'SPECIFIC_USER' ? w.watcherId : null,
    }));

    if (editing) {
      updateMutation.mutate(
        { name: form.name, steps, watchers },
        {
          onSuccess: () => {
            toast.success(t('toast.flowSaved'));
            setFormOpen(false);
          },
          onError: (error) => toast.error(t('toast.flowSaveError'), { description: describeFlowError(error) }),
        }
      );
    } else {
      const payload: CreateApprovalFlowRequest = {
        name: form.name,
        departmentId: form.departmentId,
        steps,
        watchers,
      };
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast.success(t('toast.flowSaved'));
          setFormOpen(false);
        },
        onError: (error) => toast.error(t('toast.flowSaveError'), { description: describeFlowError(error) }),
      });
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('toast.flowDeleted'));
        setDeleteTarget(null);
      },
      onError: () => {
        toast.error(t('toast.flowDeleteError'), { description: t('toast.tryAgain') });
        setDeleteTarget(null);
      },
    });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
        <div>
          <p className="text-sm font-medium text-text-primary">{t('flows.title')}</p>
          <p className="text-xs text-text-muted mt-0.5">{t('flows.subtitle')}</p>
        </div>
        <Can permission="leave:configure">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openCreate}>
            <Plus className="size-3.5" />
            {t('flows.add')}
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-5 py-4">
              <Skeleton className="h-4 w-1/3 rounded" />
            </div>
          ))}
        </div>
      ) : !flows || flows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-text-primary font-medium">{t('flows.empty')}</p>
          <p className="text-text-muted text-sm mt-1">{t('flows.emptyHint')}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-background hover:bg-background">
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('flows.columns.name')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('flows.columns.department')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                {t('flows.columns.steps')}
              </TableHead>
              <TableHead className="text-xs font-semibold text-text-secondary uppercase tracking-wide text-center">
                {t('flows.columns.status')}
              </TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {flows.map((flow) => (
              <TableRow key={flow.id} className="group h-12 hover:bg-background">
                <TableCell className="text-sm font-medium text-text-primary">{flow.name}</TableCell>
                <TableCell>
                  {flow.departmentId ? (
                    <span className="text-sm text-text-secondary">{flow.departmentName}</span>
                  ) : (
                    <span className="text-xs text-text-muted italic">{t('flows.default')}</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 flex-wrap">
                    {flow.steps.map((s, i) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 text-[11px] rounded-md bg-surface-alt px-1.5 py-0.5 text-text-secondary"
                      >
                        <span className="text-text-muted tabular-nums">{i + 1}.</span>
                        {s.approverType === 'ROLE' && s.roleKey
                          ? `${t('approverType.ROLE')} · ${s.roleKey}`
                          : t(`approverType.${s.approverType}`)}
                      </span>
                    ))}
                    {flow.watchers.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] rounded-md bg-info-light px-1.5 py-0.5 text-info dark:bg-info/15"
                        title={t('flows.form.watchers.label')}
                      >
                        <Eye className="size-3" />
                        {t('flows.watchersCount', { count: flow.watchers.length })}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span
                    className={
                      flow.active ? 'text-xs text-green-700 dark:text-green-400' : 'text-xs text-text-muted'
                    }
                  >
                    {flow.active ? t('flows.active') : t('flows.inactive')}
                  </span>
                </TableCell>
                <TableCell>
                  <Can permission="leave:configure">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={t('actions.save', { ns: 'common' })}
                        onClick={() => openEdit(flow)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-text-muted hover:text-danger"
                        aria-label={t('actions.delete', { ns: 'common' })}
                        onClick={() => setDeleteTarget(flow)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </Can>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('flows.form.editTitle') : t('flows.form.createTitle')}
            </DialogTitle>
            <DialogDescription>{t('flows.form.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="flow-name" className="text-sm font-medium">
                {t('flows.form.name')} <span className="text-danger">*</span>
              </Label>
              <Input
                id="flow-name"
                className="h-9 text-sm"
                value={form.name}
                placeholder={t('flows.form.namePlaceholder')}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Department (immutable on edit) */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('flows.form.department')}</Label>
              <Select
                value={form.departmentId ?? 'default'}
                disabled={!!editing}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, departmentId: v === 'default' ? null : v }))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t('flows.form.departmentDefault')}</SelectItem>
                  {departments?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editing && <p className="text-[11px] text-text-muted">{t('flows.form.departmentHint')}</p>}
            </div>

            {/* Steps */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('flows.form.steps')}</Label>
              <div className="space-y-2">
                {form.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 rounded-lg border border-border bg-background p-2.5"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums mt-1">
                      {idx + 1}
                    </span>
                    <div className="flex-1 space-y-2 min-w-0">
                      <Select
                        value={step.approverType}
                        onValueChange={(v) =>
                          updateStep(idx, {
                            approverType: v as ApproverType,
                            roleKey: null,
                            approverId: null,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {APPROVER_TYPES.map((tp) => (
                            <SelectItem key={tp} value={tp}>
                              {t(`approverType.${tp}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {step.approverType === 'ROLE' && (
                        <Select
                          value={step.roleKey ?? ''}
                          onValueChange={(v) => updateStep(idx, { roleKey: v })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder={t('flows.form.rolePlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {roles?.map((r) => (
                              <SelectItem key={r.id} value={r.key}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {step.approverType === 'SPECIFIC_USER' && (
                        <Select
                          value={step.approverId ?? ''}
                          onValueChange={(v) => updateStep(idx, { approverId: v })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder={t('flows.form.userPlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {employees.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.fullName} · {e.employeeCode}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={idx === 0}
                        aria-label={t('flows.form.moveUp')}
                        onClick={() => moveStep(idx, -1)}
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={idx === form.steps.length - 1}
                        aria-label={t('flows.form.moveDown')}
                        onClick={() => moveStep(idx, 1)}
                      >
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-text-muted hover:text-danger"
                        disabled={form.steps.length === 1}
                        aria-label={t('flows.form.removeStep')}
                        onClick={() => removeStep(idx)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 w-full"
                onClick={addStep}
              >
                <Plus className="size-3.5" />
                {t('flows.form.addStep')}
              </Button>
            </div>

            {/* CC / watchers (view-only, SPEC-046) */}
            <div className="space-y-2">
              <div>
                <Label className="flex items-center gap-1.5 text-sm font-medium">
                  <Eye className="size-3.5 text-text-muted" />
                  {t('flows.form.watchers.label')}
                </Label>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {t('flows.form.watchers.hint')}
                </p>
              </div>
              <div className="space-y-2">
                {form.watchers.map((watcher, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 rounded-lg border border-border bg-background p-2.5"
                  >
                    <div className="flex-1 space-y-2 min-w-0">
                      <Select
                        value={watcher.watcherType}
                        onValueChange={(v) =>
                          updateWatcher(idx, {
                            watcherType: v as WatcherInput['watcherType'],
                            roleKey: null,
                            watcherId: null,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WATCHER_TYPES.map((tp) => (
                            <SelectItem key={tp} value={tp}>
                              {t(`approverType.${tp}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {watcher.watcherType === 'ROLE' && (
                        <Select
                          value={watcher.roleKey ?? ''}
                          onValueChange={(v) => updateWatcher(idx, { roleKey: v })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder={t('flows.form.rolePlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {roles?.map((r) => (
                              <SelectItem key={r.id} value={r.key}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {watcher.watcherType === 'SPECIFIC_USER' && (
                        <Select
                          value={watcher.watcherId ?? ''}
                          onValueChange={(v) => updateWatcher(idx, { watcherId: v })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder={t('flows.form.userPlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {employees.map((e) => (
                              <SelectItem key={e.id} value={e.id}>
                                {e.fullName} · {e.employeeCode}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-text-muted hover:text-danger shrink-0"
                      aria-label={t('flows.form.watchers.remove')}
                      onClick={() => removeWatcher(idx)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 w-full"
                onClick={addWatcher}
              >
                <Plus className="size-3.5" />
                {t('flows.form.watchers.add')}
              </Button>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              {t('actions.cancel', { ns: 'common' })}
            </Button>
            <Button type="button" disabled={isSaving || !isFormValid()} onClick={submit}>
              {t('actions.save', { ns: 'common' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('flows.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('flows.deleteDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-danger hover:bg-danger/90 text-white"
              disabled={deleteMutation.isPending}
            >
              {t('flows.deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
