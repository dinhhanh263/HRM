import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { BookOpen, Plus, Pencil, Trash2, Loader2, RefreshCw } from 'lucide-react';
import type { ProbationGuidelineDto } from '@hrm/shared';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { parseGuidelineContent } from '../utils/guideline-content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { Can } from '@/components/auth/Can';
import {
  useProbationGuidelines,
  useCreateProbationGuideline,
  useUpdateProbationGuideline,
  useDeleteProbationGuideline,
} from '../hooks/useProbation';

const CURRENT_YEAR = new Date().getFullYear();

// Form Sheet tạo/sửa guideline — Zod mirror validator BE (year 2000–2100, title ≤200,
// content ≤20.000, order ≥0).
const guidelineFormSchema = z.object({
  title: z.string().trim().min(1).max(200),
  year: z.coerce.number().int().min(2000).max(2100),
  language: z.enum(['vi', 'en']),
  content: z.string().min(1).max(20_000),
  order: z.coerce.number().int().min(0),
});

type GuidelineFormData = z.infer<typeof guidelineFormSchema>;

export function ProbationGuidelines() {
  const { t, i18n } = useTranslation('probation');
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProbationGuidelineDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProbationGuidelineDto | null>(null);

  // Lấy tất cả để build danh sách năm có bài; lọc theo năm chọn ở client —
  // số guideline mỗi tenant nhỏ (vài chục), không cần query lẻ theo năm.
  const { data: guidelines, isLoading, isError, refetch } = useProbationGuidelines();
  const createMutation = useCreateProbationGuideline();
  const updateMutation = useUpdateProbationGuideline(editing?.id ?? '');
  const deleteMutation = useDeleteProbationGuideline();

  // §2c: danh sách hiển thị theo ngôn ngữ UI đang chọn — đổi VI↔EN là đổi nội dung.
  const uiLanguage: 'vi' | 'en' = i18n.language === 'en' ? 'en' : 'vi';

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<GuidelineFormData>({
    resolver: zodResolver(guidelineFormSchema),
    defaultValues: { title: '', year: CURRENT_YEAR, language: uiLanguage, content: '', order: 0 },
  });

  function openCreate() {
    setEditing(null);
    // Mặc định theo năm đang lọc + ngôn ngữ UI đang chọn: HR thường soạn cho
    // đúng ngữ cảnh họ đang xem — đỡ thao tác đổi tay.
    reset({ title: '', year, language: uiLanguage, content: '', order: 0 });
    setFormOpen(true);
  }

  function openEdit(g: ProbationGuidelineDto) {
    setEditing(g);
    reset({
      title: g.title,
      year: g.year,
      language: g.language,
      content: g.content,
      order: g.order,
    });
    setFormOpen(true);
  }

  function submitForm(data: GuidelineFormData) {
    const mutation = editing ? updateMutation : createMutation;
    mutation.mutate(data, {
      onSuccess: () => {
        toast.success(t('guidelines.toast.saved'));
        setFormOpen(false);
        setYear(data.year);
      },
      onError: () =>
        toast.error(t('guidelines.toast.saveError'), { description: t('toast.tryAgain') }),
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('guidelines.toast.deleted'));
        setDeleteTarget(null);
      },
      onError: () => {
        toast.error(t('guidelines.toast.deleteError'), { description: t('toast.tryAgain') });
        setDeleteTarget(null);
      },
    });
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // Năm hiện tại + năm đang chọn luôn có mặt — select không bao giờ rỗng, kể cả
  // ngay sau khi tạo bài cho năm mới (cache chưa kịp refetch).
  const years = useMemo(() => {
    const set = new Set<number>([CURRENT_YEAR, year]);
    (guidelines ?? []).forEach((g) => set.add(g.year));
    return Array.from(set).sort((a, b) => b - a);
  }, [guidelines, year]);

  const visible = useMemo(
    () => (guidelines ?? []).filter((g) => g.year === year && g.language === uiLanguage),
    [guidelines, year, uiLanguage]
  );

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language === 'vi' ? 'vi-VN' : 'en-GB'),
    [i18n.language]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger
              className="h-9 w-32 text-sm tabular-nums"
              aria-label={t('guidelines.yearFilter')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)} className="tabular-nums">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Can permission="probation:configure">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openCreate}>
            <Plus className="size-3.5" />
            {t('guidelines.add')}
          </Button>
        </Can>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border p-5 space-y-3">
              <Skeleton className="h-4 w-1/3 rounded" />
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-2/3 rounded" />
            </div>
          ))}
        </div>
      ) : isError ? (
        // Lỗi tải ≠ danh sách rỗng — không được hiện empty state gây hiểu nhầm.
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <p className="text-sm font-medium text-text-primary mb-1">
            {t('guidelines.error.title')}
          </p>
          <p className="text-xs text-text-muted max-w-xs mb-4">
            {t('guidelines.error.description')}
          </p>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="size-3.5" />
            {t('guidelines.error.retry')}
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="size-12 rounded-2xl bg-surface-alt flex items-center justify-center mb-3">
            <BookOpen className="size-5 text-text-muted" />
          </div>
          <p className="text-sm font-medium text-text-primary mb-1">
            {t('guidelines.empty.title', { year })}
          </p>
          <p className="text-xs text-text-muted max-w-xs">
            {t('guidelines.empty.description')}
          </p>
          <Can permission="probation:configure">
            <Button size="sm" className="h-8 text-xs gap-1.5 mt-4" onClick={openCreate}>
              <Plus className="size-3.5" />
              {t('guidelines.add')}
            </Button>
          </Can>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((g) => (
            <Card key={g.id} className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base font-semibold">{g.title}</CardTitle>
                  <Can permission="probation:configure">
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={t('actions.edit', { ns: 'common' })}
                        onClick={() => openEdit(g)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-text-muted hover:text-danger"
                        aria-label={t('actions.delete', { ns: 'common' })}
                        onClick={() => setDeleteTarget(g)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </Can>
                </div>
                <p className="text-xs text-text-muted">
                  {t('guidelines.meta', {
                    year: g.year,
                    date: dateFormatter.format(new Date(g.updatedAt)),
                  })}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {parseGuidelineContent(g.content).map((block, i) =>
                  block.type === 'paragraph' ? (
                    <p
                      key={i}
                      className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed"
                    >
                      {block.text}
                    </p>
                  ) : (
                    <div key={i} className="rounded-lg border border-border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-surface-alt/50 hover:bg-surface-alt/50">
                            {block.header.map((cell, j) => (
                              <TableHead
                                key={j}
                                className="text-xs font-semibold text-text-secondary uppercase tracking-wide whitespace-nowrap"
                              >
                                {cell}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {block.rows.map((row, j) => (
                            <TableRow key={j} className="hover:bg-surface-alt/30 align-top">
                              {row.map((cell, k) => (
                                <TableCell
                                  key={k}
                                  className="text-sm text-text-primary align-top whitespace-pre-wrap leading-relaxed"
                                >
                                  {cell}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Form tạo guideline — Sheet vì có textarea dài (rule CLAUDE.md). */}
      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-5">
          <SheetHeader>
            <SheetTitle>
              {editing ? t('guidelines.form.editTitle') : t('guidelines.form.createTitle')}
            </SheetTitle>
            <SheetDescription>{t('guidelines.form.description')}</SheetDescription>
          </SheetHeader>
          <form
            onSubmit={handleSubmit(submitForm)}
            className="flex flex-col gap-4 flex-1"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="pg-title" className="text-sm font-medium">
                {t('guidelines.form.title')} <span className="text-danger">*</span>
              </Label>
              <Input id="pg-title" className="h-9 text-sm" maxLength={200} {...register('title')} />
              {errors.title && (
                <p className="text-xs text-danger">{t('guidelines.form.titleRequired')}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pg-year" className="text-sm font-medium">
                  {t('guidelines.form.year')} <span className="text-danger">*</span>
                </Label>
                <Input
                  id="pg-year"
                  type="number"
                  min={2000}
                  max={2100}
                  className="h-9 text-sm tabular-nums"
                  {...register('year')}
                />
                {errors.year && (
                  <p className="text-xs text-danger">{t('guidelines.form.yearInvalid')}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pg-order" className="text-sm font-medium">
                  {t('guidelines.form.order')}
                </Label>
                <Input
                  id="pg-order"
                  type="number"
                  min={0}
                  className="h-9 text-sm tabular-nums"
                  {...register('order')}
                />
                {errors.order && (
                  <p className="text-xs text-danger">{t('guidelines.form.orderInvalid')}</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pg-language" className="text-sm font-medium">
                {t('guidelines.form.language')}
              </Label>
              <Select
                value={watch('language')}
                onValueChange={(v) => setValue('language', v as GuidelineFormData['language'])}
              >
                <SelectTrigger id="pg-language" className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vi">{t('guidelines.form.languages.vi')}</SelectItem>
                  <SelectItem value="en">{t('guidelines.form.languages.en')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 flex-1 flex flex-col">
              <Label htmlFor="pg-content" className="text-sm font-medium">
                {t('guidelines.form.content')} <span className="text-danger">*</span>
              </Label>
              <Textarea
                id="pg-content"
                rows={12}
                maxLength={20_000}
                placeholder={t('guidelines.form.contentPlaceholder')}
                className="text-sm flex-1"
                {...register('content')}
              />
              {errors.content && (
                <p className="text-xs text-danger">{t('guidelines.form.contentRequired')}</p>
              )}
            </div>
            <SheetFooter className="mt-auto gap-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                {t('actions.cancel', { ns: 'common' })}
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSaving
                  ? t('actions.saving', { ns: 'common' })
                  : t('actions.save', { ns: 'common' })}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Xác nhận xóa */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('guidelines.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('guidelines.deleteDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel', { ns: 'common' })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-danger hover:bg-danger/90 text-white"
              disabled={deleteMutation.isPending}
            >
              {t('guidelines.deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
