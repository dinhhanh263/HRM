import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { type CreateEmployeeRequest, PositionLevel } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateEmployee, useEmployees } from '../hooks/useEmployees';
import { useDepartments } from '../hooks/useDepartments';
import { usePositions } from '../hooks/usePositions';
import { useRoles } from '@/features/roles/hooks/useRoles';
import { useAuthStore } from '@/stores/auth.store';
import { getApiErrorMessage } from '@/lib/api-error';
import { getServerFieldError } from '../utils/server-field-errors';
import {
  ArrowLeft,
  User,
  Mail,
  Lock,
  Phone,
  Calendar,
  Building2,
  Briefcase,
  FileText,
  CreditCard,
  MapPin,
  Users,
  Eye,
  EyeOff,
  AlertCircle,
  Upload,
  Save,
  X,
  Trash2,
} from 'lucide-react';

const createEmployeeSchema = z.object({
  email: z.string().email('form.validation.emailInvalid'),
  password: z
    .string()
    .min(8, 'form.validation.passwordMin')
    .regex(/[A-Z]/, 'form.validation.passwordUppercase')
    .regex(/[a-z]/, 'form.validation.passwordLowercase')
    .regex(/[0-9]/, 'form.validation.passwordNumber'),
  fullName: z.string().min(2, 'form.validation.fullNameMin'),
  phone: z.string().optional(),
  idNumber: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  address: z.string().optional(),
  dependentsCount: z.coerce
    .number({ invalid_type_error: 'form.validation.dependentsCountRange' })
    .int('form.validation.dependentsCountRange')
    .min(0, 'form.validation.dependentsCountRange')
    .max(20, 'form.validation.dependentsCountRange')
    .optional(),
  departmentId: z.string().optional(),
  positionId: z.string().optional(),
  managerId: z.string().optional(),
  joinDate: z.string().optional(),
  probationEndDate: z.string().optional(),
  contractType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'PROBATION']),
  roleId: z.string().optional(),
});

type FormData = z.infer<typeof createEmployeeSchema>;

// Sentinel for the "no manager" Select option — Radix forbids empty-string values.
const NO_MANAGER = '__none__';

export function CreateEmployeePage() {
  const navigate = useNavigate();
  const { t } = useTranslation('employee');
  const createMutation = useCreateEmployee();
  const { data: departments } = useDepartments();
  const { data: positions } = usePositions();
  // Candidate managers: active employees at Manager level or above.
  const { data: employeesResult } = useEmployees({
    limit: 100,
    status: 'ACTIVE',
    minLevel: PositionLevel.MANAGER,
  });
  const managerOptions = employeesResult?.data ?? [];
  // Only SUPER_ADMIN may assign a role; the backend ignores the `roleId`
  // field for everyone else. Hide the control (UX only — server enforced).
  const canAssignRole = useAuthStore((s) => s.user?.role === 'SUPER_ADMIN');
  // Assignable roles: every tenant role except super_admin (no escalation here).
  // Only fetched for SUPER_ADMIN — listing roles requires roles:view, so other
  // callers would 403.
  const { data: roles } = useRoles({ enabled: canAssignRole });
  const roleOptions = (roles ?? []).filter((r) => r.key !== 'super_admin');

  const [showPassword, setShowPassword] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert(t('form.avatar.invalidType'));
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        alert(t('form.avatar.tooLarge'));
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(createEmployeeSchema),
    mode: 'onChange',
    defaultValues: {
      contractType: 'FULL_TIME',
      dependentsCount: 0,
      joinDate: new Date().toISOString().split('T')[0],
    },
  });

  const fullName = watch('fullName');

  // Server conflicts that map to a single field (duplicate email/ID number)
  // are surfaced inline on that field — focused so the user lands on it.
  const serverFieldError = getServerFieldError(createMutation.error);
  useEffect(() => {
    if (serverFieldError) {
      setError(
        serverFieldError.field,
        { type: 'server', message: serverFieldError.message },
        { shouldFocus: true },
      );
    }
  }, [serverFieldError, setError]);

  const onSubmit = (data: FormData) => {
    const request: CreateEmployeeRequest = {
      email: data.email,
      password: data.password,
      fullName: data.fullName,
      phone: data.phone || undefined,
      departmentId: data.departmentId || undefined,
      positionId: data.positionId || undefined,
      managerId: data.managerId || undefined,
      dateOfBirth: data.dateOfBirth || undefined,
      gender: data.gender || undefined,
      idNumber: data.idNumber || undefined,
      address: data.address || undefined,
      joinDate: data.joinDate || undefined,
      probationEndDate: data.probationEndDate || undefined,
      contractType: data.contractType,
      dependentsCount: data.dependentsCount,
      roleId: data.roleId || undefined,
      // Avatar is stored inline as a base64 data URL (no object storage).
      avatarUrl: avatarPreview || undefined,
    };

    createMutation.mutate(request, {
      onSuccess: () => {
        navigate('/employees');
      },
    });
  };

  const getInitials = (name: string) => {
    if (!name) return 'NV';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="max-w-[900px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          className="inline-flex items-center gap-2 px-3 py-2 mb-4 bg-transparent border-none text-text-secondary text-sm font-medium cursor-pointer rounded-lg transition-all duration-150 hover:bg-surface-alt hover:text-text-primary"
          onClick={() => navigate('/employees')}
        >
          <ArrowLeft className="w-[18px] h-[18px]" />
          {t('create.backToList')}
        </button>
        <h1 className="text-2xl font-bold text-text-primary m-0">{t('create.title')}</h1>
        <p className="text-sm text-text-secondary mt-1">
          {t('create.subtitle')}
        </p>
      </div>

      {/* Error Alert — only for errors that don't map to a specific field */}
      {createMutation.error && !serverFieldError && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-danger-light border border-danger/30 mb-6">
          <AlertCircle className="w-5 h-5 text-danger shrink-0" />
          <div>
            <p className="font-semibold text-danger text-sm m-0">{t('states.error', { ns: 'common' })}</p>
            <p className="text-danger/80 text-[13px] m-0 mt-1">
              {getApiErrorMessage(createMutation.error, t('create.error'))}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
        {/* Section 1: Account Info */}
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-background flex items-center gap-3">
            <div className="w-9 h-9 rounded-[10px] bg-info-light flex items-center justify-center">
              <Lock className="w-[18px] h-[18px] text-info" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary m-0">
                {t('form.sections.account')}
              </h2>
              <p className="text-[13px] text-text-secondary mt-0.5">
                {t('form.sections.accountDescription')}
              </p>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {t('form.email')} <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <Input
                    type="email"
                    placeholder={t('form.placeholders.email')}
                    {...register('email')}
                    error={!!errors.email}
                    className="pl-3 h-[42px]"
                  />
                </div>
                {errors.email && (
                  <span className="text-xs text-danger flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" />
                    {t(errors.email.message!)}
                  </span>
                )}
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  {t('form.password')} <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('form.placeholders.password')}
                    {...register('password')}
                    error={!!errors.password}
                    className="pl-3 pr-10 h-[42px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-text-muted p-1 flex hover:text-text-secondary"
                  >
                    {showPassword ? (
                      <EyeOff className="w-[18px] h-[18px]" />
                    ) : (
                      <Eye className="w-[18px] h-[18px]" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <span className="text-xs text-danger flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" />
                    {t(errors.password.message!)}
                  </span>
                )}
              </div>

              {/* Role — SUPER_ADMIN only (privilege escalation guard). Options are
                  every tenant role except super_admin, by roleId. */}
              {canAssignRole && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {t('form.role')}
                  </label>
                  <Controller
                    name="roleId"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value || ''} onValueChange={field.onChange}>
                        <SelectTrigger className="h-[42px]">
                          <SelectValue placeholder={t('form.placeholders.selectRole')} />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Personal Info */}
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-background flex items-center gap-3">
            <div className="w-9 h-9 rounded-[10px] bg-primary-light flex items-center justify-center">
              <User className="w-[18px] h-[18px] text-primary" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary m-0">
                {t('form.sections.personal')}
              </h2>
              <p className="text-[13px] text-text-secondary mt-0.5">
                {t('form.sections.personalDescription')}
              </p>
            </div>
          </div>

          {/* Avatar Preview */}
          <div className="flex items-center gap-5 px-6 py-5 border-b border-border">
            <div className="w-20 h-20 rounded-full bg-primary-light flex items-center justify-center border-[3px] border-surface shadow-md relative overflow-hidden">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-2xl font-semibold text-primary">
                  {getInitials(fullName || '')}
                </span>
              )}
            </div>
            <div>
              <p className="font-medium text-text-primary m-0 text-sm">{t('form.avatar.title')}</p>
              <p className="text-xs text-text-muted mt-1">{t('form.avatar.hint')}</p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarChange}
                accept="image/png,image/jpeg,image/jpg"
                className="hidden"
              />
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  className="px-3 py-1.5 text-[13px] font-medium text-primary bg-primary-light border-none rounded-md cursor-pointer flex items-center gap-1.5 transition-all duration-150 hover:bg-primary/20"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {avatarPreview ? t('form.avatar.change') : t('form.avatar.upload')}
                </button>
                {avatarPreview && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="px-3 py-1.5 text-[13px] font-medium text-danger bg-danger-light border-none rounded-md cursor-pointer flex items-center gap-1.5 transition-all duration-150 hover:bg-danger/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('form.avatar.remove')}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Full Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  {t('form.fullName')} <span className="text-danger">*</span>
                </label>
                <Input
                  placeholder={t('form.placeholders.fullName')}
                  {...register('fullName')}
                  error={!!errors.fullName}
                  className="h-[42px]"
                />
                {errors.fullName && (
                  <span className="text-xs text-danger flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" />
                    {t(errors.fullName.message!)}
                  </span>
                )}
              </div>

              {/* Phone */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  {t('form.phone')}
                </label>
                <Input
                  placeholder={t('form.placeholders.phone')}
                  {...register('phone')}
                  className="h-[42px]"
                />
              </div>

              {/* Date of Birth */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {t('form.dateOfBirth')}
                </label>
                <Input type="date" {...register('dateOfBirth')} className="h-[42px]" />
              </div>

              {/* Gender */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {t('form.gender')}
                </label>
                <Controller
                  name="gender"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger className="h-[42px]">
                        <SelectValue placeholder={t('form.placeholders.selectGender')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MALE">{t('form.genders.MALE')}</SelectItem>
                        <SelectItem value="FEMALE">{t('form.genders.FEMALE')}</SelectItem>
                        <SelectItem value="OTHER">{t('form.genders.OTHER')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* ID Number */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5" />
                  {t('form.idNumber')}
                </label>
                <Input
                  placeholder={t('form.placeholders.idNumber')}
                  {...register('idNumber')}
                  error={!!errors.idNumber}
                  className="h-[42px]"
                />
                {errors.idNumber && (
                  <span className="text-xs text-danger flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" />
                    {t(errors.idNumber.message!)}
                  </span>
                )}
              </div>

              {/* Address */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {t('form.address')}
                </label>
                <Input
                  placeholder={t('form.placeholders.address')}
                  {...register('address')}
                  className="h-[42px]"
                />
              </div>

              {/* Dependents — drives PIT deduction in payroll; parity with Edit form */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {t('form.dependentsCount')}
                </label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  {...register('dependentsCount')}
                  className="h-[42px]"
                />
                {errors.dependentsCount && (
                  <span className="text-xs text-danger flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3 h-3" />
                    {t(errors.dependentsCount.message ?? 'form.validation.dependentsCountRange')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Work Info */}
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-background flex items-center gap-3">
            <div className="w-9 h-9 rounded-[10px] bg-success-light flex items-center justify-center">
              <Briefcase className="w-[18px] h-[18px] text-success" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary m-0">
                {t('form.sections.work')}
              </h2>
              <p className="text-[13px] text-text-secondary mt-0.5">
                {t('form.sections.workDescription')}
              </p>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Department */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {t('form.department')}
                </label>
                <Controller
                  name="departmentId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger className="h-[42px]">
                        <SelectValue placeholder={t('form.placeholders.selectDepartment')} />
                      </SelectTrigger>
                      <SelectContent>
                        {departments?.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Position */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5" />
                  {t('form.position')}
                </label>
                <Controller
                  name="positionId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger className="h-[42px]">
                        <SelectValue placeholder={t('form.placeholders.selectPosition')} />
                      </SelectTrigger>
                      <SelectContent>
                        {positions?.map((pos) => (
                          <SelectItem key={pos.id} value={pos.id}>
                            {pos.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Direct Manager */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {t('form.manager')}
                </label>
                <Controller
                  name="managerId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || NO_MANAGER}
                      onValueChange={(value) =>
                        field.onChange(value === NO_MANAGER ? undefined : value)
                      }
                    >
                      <SelectTrigger className="h-[42px]">
                        <SelectValue placeholder={t('form.placeholders.selectManager')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_MANAGER}>{t('form.noManager')}</SelectItem>
                        {managerOptions.map((mgr) => (
                          <SelectItem key={mgr.id} value={mgr.id}>
                            {mgr.fullName} · {mgr.employeeCode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Join Date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {t('form.joinDate')}
                </label>
                <Input type="date" {...register('joinDate')} className="h-[42px]" />
              </div>

              {/* Probation End Date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {t('form.probationEndDate')}
                </label>
                <Input type="date" {...register('probationEndDate')} className="h-[42px]" />
              </div>

              {/* Contract Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-text-primary flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  {t('form.contractType')} <span className="text-danger">*</span>
                </label>
                <Controller
                  name="contractType"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-[42px]">
                        <SelectValue placeholder={t('form.placeholders.selectContractType')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FULL_TIME">{t('form.contractTypes.FULL_TIME')}</SelectItem>
                        <SelectItem value="PART_TIME">{t('form.contractTypes.PART_TIME')}</SelectItem>
                        <SelectItem value="CONTRACT">{t('form.contractTypes.CONTRACT')}</SelectItem>
                        <SelectItem value="PROBATION">{t('form.contractTypes.PROBATION')}</SelectItem>
                        <SelectItem value="INTERN">{t('form.contractTypes.INTERN')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/employees')}
            className="min-w-[120px]"
          >
            <X className="w-[18px] h-[18px] mr-2" />
            {t('create.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending}
            className="min-w-[160px]"
          >
            {createMutation.isPending ? (
              <>
                <div className="w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                {t('create.submitting')}
              </>
            ) : (
              <>
                <Save className="w-[18px] h-[18px] mr-2" />
                {t('create.submit')}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
