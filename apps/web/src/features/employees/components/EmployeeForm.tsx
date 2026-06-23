import { useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Upload, Trash2 } from 'lucide-react';
import { type EmployeeDto, PositionLevel } from '@hrm/shared';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDepartments } from '../hooks/useDepartments';
import { usePositions } from '../hooks/usePositions';
import { useEmployees } from '../hooks/useEmployees';
import { useRoles } from '@/features/roles/hooks/useRoles';
import { useAuthStore } from '@/stores/auth.store';
import { getServerFieldError } from '../utils/server-field-errors';

// Sentinel for the "no manager" Select option — Radix forbids empty-string values.
const NO_MANAGER = '__none__';

const employeeFormSchema = z.object({
  email: z.string().email('form.validation.emailInvalid').optional(),
  password: z.string().min(8, 'form.validation.passwordMin').optional(),
  fullName: z.string().min(1, 'form.validation.fullNameRequired'),
  phone: z.string().optional(),
  idNumber: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  departmentId: z.string().optional(),
  positionId: z.string().optional(),
  managerId: z.string().optional(),
  joinDate: z.string().optional(),
  probationEndDate: z.string().optional(),
  contractType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'PROBATION']).optional(),
  // Base64 data URL (or existing http(s) URL); empty string means "no avatar".
  avatarUrl: z.string().optional(),
  dependentsCount: z.coerce
    .number({ invalid_type_error: 'form.validation.dependentsCountRange' })
    .int('form.validation.dependentsCountRange')
    .min(0, 'form.validation.dependentsCountRange')
    .max(20, 'form.validation.dependentsCountRange')
    .optional(),
  roleId: z.string().optional(),
  // Extended profile fields (SPEC-040) — all optional free text.
  placeOfBirth: z.string().optional(),
  idIssueDate: z.string().optional(),
  idIssuePlace: z.string().optional(),
  personalEmail: z.union([z.string().email('form.validation.emailInvalid'), z.literal('')]).optional(),
  education: z.string().optional(),
  maritalStatus: z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'OTHER']).optional(),
  permanentAddress: z.string().optional(),
  currentAddress: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankName: z.string().optional(),
  bankBranch: z.string().optional(),
  taxCode: z.string().optional(),
  socialInsuranceNumber: z.string().optional(),
  healthcareFacility: z.string().optional(),
  motorbikeRegistration: z.string().optional(),
});

type FormData = z.infer<typeof employeeFormSchema>;

interface EmployeeFormProps {
  employee?: EmployeeDto;
  onSubmit: (data: FormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  // Mutation error from the page owning the request; conflicts that map to a
  // single field (duplicate email/ID number) are highlighted inline.
  serverError?: unknown;
}

export function EmployeeForm({
  employee,
  onSubmit,
  onCancel,
  isLoading,
  serverError,
}: EmployeeFormProps) {
  const isEditing = !!employee;
  const { t } = useTranslation('employee');
  // Assigning a system role is a privilege grant; the backend only honors the
  // `role` field for SUPER_ADMIN callers. Hide the control for everyone else
  // (UX only — server enforcement lives in employeeService).
  const canAssignRole = useAuthStore((s) => s.user?.role === 'SUPER_ADMIN');
  const { data: departments } = useDepartments();
  const { data: positions } = usePositions();
  // Assignable roles: every tenant role except super_admin (no escalation via
  // this form). Only fetched when the role control is shown — listing roles
  // requires roles:view (SUPER_ADMIN only), so other callers would 403.
  const { data: roles } = useRoles({ enabled: canAssignRole });
  const roleOptions = (roles ?? []).filter((r) => r.key !== 'super_admin');
  // Candidate managers: active employees at Manager level or above, excluding the
  // one being edited (no self-manage).
  const { data: employeesResult } = useEmployees({
    limit: 100,
    status: 'ACTIVE',
    minLevel: PositionLevel.MANAGER,
  });
  const managerOptions = (employeesResult?.data ?? []).filter((e) => e.id !== employee?.id);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: employee
      ? {
          fullName: employee.fullName,
          phone: employee.phone || '',
          idNumber: employee.idNumber || '',
          dateOfBirth: employee.dateOfBirth?.split('T')[0] || '',
          gender: employee.gender || undefined,
          departmentId: employee.departmentId || '',
          positionId: employee.positionId || '',
          managerId: employee.managerId || '',
          joinDate: employee.joinDate?.split('T')[0] || '',
          probationEndDate: employee.probationEndDate?.split('T')[0] || '',
          contractType: employee.contractType,
          dependentsCount: employee.dependentsCount,
          roleId: employee.user?.roleId || undefined,
          avatarUrl: employee.avatar || '',
          placeOfBirth: employee.placeOfBirth || '',
          idIssueDate: employee.idIssueDate?.split('T')[0] || '',
          idIssuePlace: employee.idIssuePlace || '',
          personalEmail: employee.personalEmail || '',
          education: employee.education || '',
          maritalStatus: employee.maritalStatus || undefined,
          permanentAddress: employee.permanentAddress || '',
          currentAddress: employee.currentAddress || '',
          emergencyContactName: employee.emergencyContactName || '',
          emergencyContactRelationship: employee.emergencyContactRelationship || '',
          emergencyContactPhone: employee.emergencyContactPhone || '',
          bankAccountNumber: employee.bankAccountNumber || '',
          bankName: employee.bankName || '',
          bankBranch: employee.bankBranch || '',
          taxCode: employee.taxCode || '',
          socialInsuranceNumber: employee.socialInsuranceNumber || '',
          healthcareFacility: employee.healthcareFacility || '',
          motorbikeRegistration: employee.motorbikeRegistration || '',
        }
      : {
          contractType: 'FULL_TIME',
          dependentsCount: 0,
          avatarUrl: '',
        },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarPreview = watch('avatarUrl');

  // Surface field-mappable server conflicts inline, focused on the field.
  const serverFieldError = getServerFieldError(serverError);
  useEffect(() => {
    // employeeCode is fixed after creation, so the edit form has no such field
    // to map a conflict onto — narrow it out.
    if (serverFieldError && serverFieldError.field !== 'employeeCode') {
      setError(
        serverFieldError.field,
        { type: 'server', message: serverFieldError.message },
        { shouldFocus: true },
      );
    }
  }, [serverFieldError, setError]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      setValue('avatarUrl', reader.result as string, { shouldDirty: true });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setValue('avatarUrl', '', { shouldDirty: true });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getInitials = (name: string) =>
    name
      ? name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : 'NV';

  const handleFormSubmit = (data: FormData) => {
    if (!isEditing) {
      if (!data.email || !data.password) {
        return;
      }
    }
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {!isEditing && (
        <Card>
          <CardHeader>
            <CardTitle>{t('form.sections.account')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('form.email')} *</Label>
                <Input
                  id="email"
                  type="email"
                  {...register('email')}
                  error={!!errors.email}
                  placeholder={t('form.placeholders.email')}
                />
                {errors.email && (
                  <p className="text-sm text-danger">{t(errors.email.message!)}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('form.password')} *</Label>
                <Input
                  id="password"
                  type="password"
                  {...register('password')}
                  error={!!errors.password}
                  placeholder={t('form.placeholders.password')}
                />
                {errors.password && (
                  <p className="text-sm text-danger">{t(errors.password.message!)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('form.sections.personal')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-primary-light flex items-center justify-center border-[3px] border-surface shadow-md overflow-hidden">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-semibold text-primary">
                  {getInitials(watch('fullName') || '')}
                </span>
              )}
            </div>
            <div>
              <p className="font-medium text-text-primary text-sm">{t('form.avatar.title')}</p>
              <p className="text-xs text-text-muted mt-1">{t('form.avatar.hint')}</p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarChange}
                accept="image/png,image/jpeg,image/jpg"
                className="hidden"
              />
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  {avatarPreview ? t('form.avatar.change') : t('form.avatar.upload')}
                </Button>
                {avatarPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveAvatar}
                    className="text-danger hover:text-danger"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    {t('form.avatar.remove')}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Employee code is assigned at creation and fixed afterwards — show it
              read-only so HR can see it on the edit screen without being able to
              change it (would break references in contracts, payroll, etc.). */}
          {isEditing && employee && (
            <div className="space-y-2">
              <Label htmlFor="employeeCode">{t('form.employeeCode')}</Label>
              <Input
                id="employeeCode"
                value={employee.employeeCode}
                disabled
                readOnly
                className="font-mono"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t('form.fullName')} *</Label>
              <Input
                id="fullName"
                {...register('fullName')}
                error={!!errors.fullName}
                placeholder={t('form.placeholders.fullName')}
              />
              {errors.fullName && (
                <p className="text-sm text-danger">{t(errors.fullName.message!)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t('form.phone')}</Label>
              <Input id="phone" {...register('phone')} placeholder={t('form.placeholders.phone')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">{t('form.dateOfBirth')}</Label>
              <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">{t('form.gender')}</Label>
              <Select
                value={watch('gender') || ''}
                onValueChange={(value) =>
                  setValue('gender', value as 'MALE' | 'FEMALE' | 'OTHER')
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('form.placeholders.selectGender')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">{t('form.genders.MALE')}</SelectItem>
                  <SelectItem value="FEMALE">{t('form.genders.FEMALE')}</SelectItem>
                  <SelectItem value="OTHER">{t('form.genders.OTHER')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="idNumber">{t('form.idNumber')}</Label>
              <Input
                id="idNumber"
                {...register('idNumber')}
                error={!!errors.idNumber}
                placeholder={t('form.placeholders.idNumber')}
              />
              {errors.idNumber && (
                <p className="text-sm text-danger">{t(errors.idNumber.message!)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="dependentsCount">{t('form.dependentsCount')}</Label>
              <Input
                id="dependentsCount"
                type="number"
                min={0}
                max={20}
                {...register('dependentsCount')}
              />
              {errors.dependentsCount && (
                <p className="text-sm text-danger">
                  {t(errors.dependentsCount.message ?? 'form.validation.dependentsCountRange')}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="placeOfBirth">{t('form.placeOfBirth')}</Label>
              <Input id="placeOfBirth" {...register('placeOfBirth')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maritalStatus">{t('form.maritalStatus')}</Label>
              <Select
                value={watch('maritalStatus') || ''}
                onValueChange={(value) =>
                  setValue(
                    'maritalStatus',
                    value as 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED' | 'OTHER',
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('form.placeholders.selectMaritalStatus')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SINGLE">{t('form.maritalStatuses.SINGLE')}</SelectItem>
                  <SelectItem value="MARRIED">{t('form.maritalStatuses.MARRIED')}</SelectItem>
                  <SelectItem value="DIVORCED">{t('form.maritalStatuses.DIVORCED')}</SelectItem>
                  <SelectItem value="WIDOWED">{t('form.maritalStatuses.WIDOWED')}</SelectItem>
                  <SelectItem value="OTHER">{t('form.maritalStatuses.OTHER')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="idIssueDate">{t('form.idIssueDate')}</Label>
              <Input id="idIssueDate" type="date" {...register('idIssueDate')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="idIssuePlace">{t('form.idIssuePlace')}</Label>
              <Input id="idIssuePlace" {...register('idIssuePlace')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="personalEmail">{t('form.personalEmail')}</Label>
              <Input
                id="personalEmail"
                type="email"
                {...register('personalEmail')}
                error={!!errors.personalEmail}
                placeholder={t('form.placeholders.personalEmail')}
              />
              {errors.personalEmail && (
                <p className="text-sm text-danger">{t(errors.personalEmail.message!)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="education">{t('form.education')}</Label>
              <Input id="education" {...register('education')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="permanentAddress">{t('form.permanentAddress')}</Label>
            <Input id="permanentAddress" {...register('permanentAddress')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currentAddress">{t('form.currentAddress')}</Label>
            <Input id="currentAddress" {...register('currentAddress')} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('form.sections.work')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="departmentId">{t('form.department')}</Label>
              <Select
                value={watch('departmentId') || ''}
                onValueChange={(value) => setValue('departmentId', value || undefined)}
              >
                <SelectTrigger>
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="positionId">{t('form.position')}</Label>
              <Select
                value={watch('positionId') || ''}
                onValueChange={(value) => setValue('positionId', value || undefined)}
              >
                <SelectTrigger>
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
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="managerId">{t('form.manager')}</Label>
            <Select
              value={watch('managerId') || NO_MANAGER}
              onValueChange={(value) =>
                setValue('managerId', value === NO_MANAGER ? undefined : value)
              }
            >
              <SelectTrigger>
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="joinDate">{t('form.joinDate')}</Label>
              <Input id="joinDate" type="date" {...register('joinDate')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="probationEndDate">{t('form.probationEndDate')}</Label>
              <Input id="probationEndDate" type="date" {...register('probationEndDate')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contractType">{t('form.contractType')}</Label>
              <Select
                value={watch('contractType') || ''}
                onValueChange={(value) =>
                  setValue(
                    'contractType',
                    value as 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN' | 'PROBATION'
                  )
                }
              >
                <SelectTrigger>
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
            </div>
          </div>

          {/* Role / access level — editable in both create and edit so an
              existing employee can be promoted to e.g. Payroll Approver.
              Only SUPER_ADMIN may assign roles (privilege escalation guard). */}
          {canAssignRole && (
            <div className="space-y-2">
              <Label htmlFor="roleId">{t('form.role')}</Label>
              <Select
                value={watch('roleId') || ''}
                onValueChange={(value) => setValue('roleId', value || undefined)}
              >
                <SelectTrigger>
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
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('form.sections.emergency')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="emergencyContactName">{t('form.emergencyContactName')}</Label>
              <Input id="emergencyContactName" {...register('emergencyContactName')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emergencyContactRelationship">
                {t('form.emergencyContactRelationship')}
              </Label>
              <Input
                id="emergencyContactRelationship"
                {...register('emergencyContactRelationship')}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="emergencyContactPhone">{t('form.emergencyContactPhone')}</Label>
            <Input id="emergencyContactPhone" {...register('emergencyContactPhone')} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('form.sections.banking')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bankAccountNumber">{t('form.bankAccountNumber')}</Label>
              <Input id="bankAccountNumber" {...register('bankAccountNumber')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankName">{t('form.bankName')}</Label>
              <Input id="bankName" {...register('bankName')} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankBranch">{t('form.bankBranch')}</Label>
            <Input id="bankBranch" {...register('bankBranch')} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('form.sections.taxInsurance')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="taxCode">{t('form.taxCode')}</Label>
              <Input id="taxCode" {...register('taxCode')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="socialInsuranceNumber">{t('form.socialInsuranceNumber')}</Label>
              <Input id="socialInsuranceNumber" {...register('socialInsuranceNumber')} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="healthcareFacility">{t('form.healthcareFacility')}</Label>
            <Input id="healthcareFacility" {...register('healthcareFacility')} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('form.sections.other')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="motorbikeRegistration">{t('form.motorbikeRegistration')}</Label>
            <Input
              id="motorbikeRegistration"
              {...register('motorbikeRegistration')}
              placeholder={t('form.placeholders.motorbikeRegistration')}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('actions.cancel', { ns: 'common' })}
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading
            ? t('form.submitting')
            : isEditing
              ? t('form.submitUpdate')
              : t('form.submitCreate')}
        </Button>
      </div>
    </form>
  );
}
