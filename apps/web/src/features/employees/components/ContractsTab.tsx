import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContractDto, ContractType, ContractStatus } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Can } from '@/components/auth/Can';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { Plus, FileText, Pencil, CircleStop, Trash2 } from 'lucide-react';
import {
  useContracts,
  useCreateContract,
  useUpdateContract,
  useEndContract,
  useDeleteContract,
} from '../hooks/useContracts';

const CONTRACT_TYPES: ContractType[] = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'PROBATION',
  'INTERN',
];

const STATUS_CLASS: Record<ContractStatus, string> = {
  ACTIVE:
    'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  EXPIRED:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  TERMINATED:
    'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700',
};

function formatDate(value: string | null, locale: string) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface FormState {
  type: ContractType;
  startDate: string;
  endDate: string;
  signedAt: string;
  note: string;
}

const emptyForm: FormState = {
  type: 'FULL_TIME',
  startDate: '',
  endDate: '',
  signedAt: '',
  note: '',
};

interface ContractsTabProps {
  employeeId: string;
}

export function ContractsTab({ employeeId }: ContractsTabProps) {
  const { t, i18n } = useTranslation('contracts');
  const locale = i18n.language === 'en' ? 'en-US' : 'vi-VN';

  const { data: contracts, isLoading, error } = useContracts(employeeId);
  const createMutation = useCreateContract(employeeId);
  const updateMutation = useUpdateContract(employeeId);
  const endMutation = useEndContract(employeeId);
  const deleteMutation = useDeleteContract(employeeId);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ContractDto | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  const [endTarget, setEndTarget] = useState<ContractDto | null>(null);
  const [endDate, setEndDate] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ContractDto | null>(null);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setSheetOpen(true);
  }

  function openEdit(contract: ContractDto) {
    setEditing(contract);
    setForm({
      type: contract.type,
      startDate: contract.startDate.split('T')[0],
      endDate: contract.endDate?.split('T')[0] ?? '',
      signedAt: contract.signedAt?.split('T')[0] ?? '',
      note: contract.note ?? '',
    });
    setFormError(null);
    setSheetOpen(true);
  }

  function handleSubmit() {
    setFormError(null);
    if (!form.startDate) {
      setFormError(t('validation.startRequired'));
      return;
    }
    if (form.endDate && form.endDate < form.startDate) {
      setFormError(t('validation.endBeforeStart'));
      return;
    }

    const payload = {
      type: form.type,
      startDate: form.startDate,
      endDate: form.endDate || null,
      signedAt: form.signedAt || null,
      note: form.note || null,
    };

    if (editing) {
      updateMutation.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => {
            toast.success(t('toast.updated'));
            setSheetOpen(false);
          },
          onError: () => toast.error(t('toast.error')),
        },
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast.success(t('toast.created'));
          setSheetOpen(false);
        },
        onError: () => toast.error(t('toast.error')),
      });
    }
  }

  function handleEnd() {
    if (!endTarget || !endDate) return;
    endMutation.mutate(
      { id: endTarget.id, endDate },
      {
        onSuccess: () => {
          toast.success(t('toast.ended'));
          setEndTarget(null);
          setEndDate('');
        },
        onError: () => toast.error(t('toast.error')),
      },
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('toast.deleted'));
        setDeleteTarget(null);
      },
      onError: () => toast.error(t('toast.error')),
    });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">{t('title')}</h3>
          <p className="text-sm text-text-muted">{t('subtitle')}</p>
        </div>
        <Can permission="contracts:create">
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1.5" />
            {t('addContract')}
          </Button>
        </Can>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-surface-alt animate-pulse" />
          ))}
        </div>
      )}

      {error && <p className="text-sm text-danger">{t('loadError')}</p>}

      {!isLoading && !error && contracts && contracts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="size-12 rounded-2xl bg-surface-alt flex items-center justify-center mb-3">
            <FileText className="size-5 text-text-muted" />
          </div>
          <p className="font-medium text-text-primary">{t('empty.title')}</p>
          <p className="text-sm text-text-muted mt-1 mb-4">{t('empty.subtitle')}</p>
          <Can permission="contracts:create">
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1.5" />
              {t('empty.cta')}
            </Button>
          </Can>
        </div>
      )}

      {!isLoading && !error && contracts && contracts.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface-alt hover:bg-surface-alt">
                <TableHead>{t('columns.type')}</TableHead>
                <TableHead>{t('columns.startDate')}</TableHead>
                <TableHead>{t('columns.endDate')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead className="text-right">{''}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract) => (
                <TableRow key={contract.id} className="group">
                  <TableCell className="text-sm font-medium text-text-primary">
                    {t(`types.${contract.type}`)}
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary">
                    {formatDate(contract.startDate, locale)}
                  </TableCell>
                  <TableCell className="text-sm text-text-secondary">
                    {formatDate(contract.endDate, locale) ?? (
                      <span className="text-text-muted italic">{t('indefinite')}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[contract.status]}`}
                    >
                      {t(`status.${contract.status}`)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Can permission="contracts:update">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={t('actions.edit')}
                          onClick={() => openEdit(contract)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </Can>
                      {contract.status === 'ACTIVE' && (
                        <Can permission="contracts:update">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={t('actions.end')}
                            onClick={() => {
                              setEndTarget(contract);
                              setEndDate('');
                            }}
                          >
                            <CircleStop className="h-3.5 w-3.5 text-warning" />
                          </Button>
                        </Can>
                      )}
                      <Can permission="contracts:delete">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={t('actions.delete')}
                          onClick={() => setDeleteTarget(contract)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-danger" />
                        </Button>
                      </Can>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[480px] sm:w-[540px] flex flex-col">
          <SheetHeader>
            <SheetTitle>{editing ? t('editContract') : t('addContract')}</SheetTitle>
            <SheetDescription>{t('subtitle')}</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4 flex-1">
            <div className="space-y-1.5">
              <Label htmlFor="contract-type">{t('form.type')}</Label>
              <Select
                value={form.type}
                onValueChange={(value) => setForm((f) => ({ ...f, type: value as ContractType }))}
              >
                <SelectTrigger id="contract-type">
                  <SelectValue placeholder={t('form.selectType')} />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`types.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="contract-start">{t('form.startDate')}</Label>
                <Input
                  id="contract-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contract-end">{t('form.endDate')}</Label>
                <Input
                  id="contract-end"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-xs text-text-muted">{t('form.endDateHint')}</p>

            <div className="space-y-1.5">
              <Label htmlFor="contract-signed">{t('form.signedAt')}</Label>
              <Input
                id="contract-signed"
                type="date"
                value={form.signedAt}
                onChange={(e) => setForm((f) => ({ ...f, signedAt: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contract-note">{t('form.note')}</Label>
              <Textarea
                id="contract-note"
                value={form.note}
                placeholder={t('form.notePlaceholder')}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>

            {formError && <p className="text-sm text-danger">{formError}</p>}
          </div>

          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={isSaving}>
              {t('actions.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {t('actions.save')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* End contract dialog */}
      <AlertDialog open={!!endTarget} onOpenChange={(open) => !open && setEndTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('endDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('endDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="end-date">{t('form.endDate')}</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEnd}
              disabled={!endDate || endMutation.isPending}
            >
              {t('actions.confirmEnd')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-danger hover:bg-danger/90"
            >
              {t('deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
