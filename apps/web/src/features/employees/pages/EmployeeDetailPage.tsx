import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Can } from '@/components/auth/Can';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EmployeeStatusBadge } from '../components/EmployeeStatusBadge';
import { ContractsTab } from '../components/ContractsTab';
import { EmployeeLeaveBalances } from '@/features/leave/components/EmployeeLeaveBalances';
import {
  useEmployee,
  useActivateEmployee,
  useDeactivateEmployee,
  useTerminateEmployee,
} from '../hooks/useEmployees';
import {
  ArrowLeft,
  Pencil,
  Mail,
  Phone,
  Building2,
  Briefcase,
  UserCheck,
  UserX,
  LogOut,
  X,
} from 'lucide-react';

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateString: string | null, locale: string) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('employee');
  const { t: tc } = useTranslation('contracts');
  const locale = i18n.language === 'en' ? 'en-US' : 'vi-VN';

  const { data: employee, isLoading, error } = useEmployee(id!);
  const activateMutation = useActivateEmployee();
  const deactivateMutation = useDeactivateEmployee();
  const terminateMutation = useTerminateEmployee();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
        <p className="text-text-muted text-sm mt-3">{t('shared.loading')}</p>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 mb-3 rounded-full bg-danger-light flex items-center justify-center">
          <X className="w-6 h-6 text-danger" />
        </div>
        <p className="text-text-primary font-medium">{t('shared.notFoundTitle')}</p>
        <p className="text-text-muted text-sm mt-1">{t('shared.notFoundSubtitle')}</p>
        <Button variant="secondary" onClick={() => navigate('/employees')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('edit.backToList')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/employees')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('shared.back')}
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{t('detail.title')}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          {employee.status === 'INACTIVE' && (
            <Can permission="employees:activate">
              <Button
                variant="secondary"
                onClick={() => activateMutation.mutate(employee.id)}
                disabled={activateMutation.isPending}
              >
                <UserCheck className="h-4 w-4 mr-2 text-success" />
                {t('shared.activate')}
              </Button>
            </Can>
          )}
          {employee.status === 'ACTIVE' && (
            <Can permission="employees:deactivate">
              <Button
                variant="secondary"
                onClick={() => deactivateMutation.mutate(employee.id)}
                disabled={deactivateMutation.isPending}
              >
                <UserX className="h-4 w-4 mr-2 text-warning" />
                {t('shared.deactivate')}
              </Button>
            </Can>
          )}
          {employee.status !== 'TERMINATED' && (
            <Can permission="employees:terminate">
              <Button
                variant="secondary"
                className="text-danger hover:text-danger"
                onClick={() => {
                  if (confirm(t('shared.terminateConfirm'))) {
                    terminateMutation.mutate(employee.id);
                  }
                }}
                disabled={terminateMutation.isPending}
              >
                <LogOut className="h-4 w-4 mr-2" />
                {t('shared.terminate')}
              </Button>
            </Can>
          )}
          <Can permission="employees:update">
            <Button onClick={() => navigate(`/employees/${employee.id}/edit`)}>
              <Pencil className="h-4 w-4 mr-2" />
              {t('shared.edit')}
            </Button>
          </Can>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">{t('detail.tabs.overview')}</TabsTrigger>
          <Can permission="contracts:view">
            <TabsTrigger value="contracts">{tc('tab')}</TabsTrigger>
          </Can>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-0">
      <div className="grid grid-cols-3 gap-6">
        {/* Profile Card */}
        <Card className="col-span-1">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <Avatar className="h-24 w-24 mb-4">
                <AvatarImage src={employee.avatar || undefined} />
                <AvatarFallback className="bg-primary-light text-primary text-2xl font-semibold">
                  {getInitials(employee.fullName)}
                </AvatarFallback>
              </Avatar>
              <h2 className="text-xl font-semibold text-text-primary">{employee.fullName}</h2>
              <p className="text-text-muted font-mono text-sm">{employee.employeeCode}</p>
              <div className="mt-3">
                <EmployeeStatusBadge status={employee.status} />
              </div>

              <Separator className="my-6" />

              <div className="w-full space-y-4 text-left">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-text-muted" />
                  <span className="text-text-secondary">{employee.user?.email}</span>
                </div>
                {employee.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-text-muted" />
                    <span className="text-text-secondary">{employee.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <Building2 className="h-4 w-4 text-text-muted" />
                  <span className="text-text-secondary">
                    {employee.department?.name || t('detail.unassigned')}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Briefcase className="h-4 w-4 text-text-muted" />
                  <span className="text-text-secondary">
                    {employee.position?.name || t('detail.unassigned')}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detail Cards */}
        <div className="col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-text-primary">
                {t('detail.sections.personal')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.fullName')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.fullName}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.gender')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.gender ? t(`form.genders.${employee.gender}`) : '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.dateOfBirth')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {formatDate(employee.dateOfBirth, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.idNumber')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.idNumber || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.phone')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.phone || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.email')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.user?.email}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">
                    {t('detail.fields.dependentsCount')}
                  </dt>
                  <dd className="text-sm font-medium text-text-primary mt-1 tabular-nums">
                    {employee.dependentsCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.placeOfBirth')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.placeOfBirth || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.maritalStatus')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.maritalStatus
                      ? t(`form.maritalStatuses.${employee.maritalStatus}`)
                      : '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.personalEmail')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.personalEmail || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.education')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.education || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.idIssueDate')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {formatDate(employee.idIssueDate, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.idIssuePlace')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.idIssuePlace || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">
                    {t('detail.fields.permanentAddress')}
                  </dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.permanentAddress || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.currentAddress')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.currentAddress || '-'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-text-primary">
                {t('detail.sections.work')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.employeeCode')}</dt>
                  <dd className="text-sm font-medium font-mono text-text-primary mt-1">
                    {employee.employeeCode}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.systemRole')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.user?.roleRef?.name || employee.user?.role}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.department')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.department?.name || t('detail.unassigned')}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.position')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.position?.name || t('detail.unassigned')}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.directManager')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.manager?.fullName || t('detail.unassigned')}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.joinDate')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {formatDate(employee.joinDate, locale)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.contractType')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {t(`form.contractTypes.${employee.contractType}`)}
                  </dd>
                </div>
                {employee.probationEndDate && (
                  <div>
                    <dt className="text-sm text-text-muted">
                      {t('detail.fields.probationEndDate')}
                    </dt>
                    <dd className="text-sm font-medium text-text-primary mt-1">
                      {formatDate(employee.probationEndDate, locale)}
                    </dd>
                  </div>
                )}
                {employee.terminatedAt && (
                  <>
                    <div>
                      <dt className="text-sm text-text-muted">{t('detail.fields.terminatedAt')}</dt>
                      <dd className="text-sm font-medium text-danger mt-1">
                        {formatDate(employee.terminatedAt, locale)}
                      </dd>
                    </div>
                    {employee.terminationReason && (
                      <div>
                        <dt className="text-sm text-text-muted">{t('detail.fields.terminationReason')}</dt>
                        <dd className="text-sm font-medium text-text-primary mt-1">
                          {employee.terminationReason}
                        </dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-text-primary">
                {t('detail.sections.emergency')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-text-muted">
                    {t('detail.fields.emergencyContactName')}
                  </dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.emergencyContactName || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">
                    {t('detail.fields.emergencyContactRelationship')}
                  </dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.emergencyContactRelationship || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">
                    {t('detail.fields.emergencyContactPhone')}
                  </dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.emergencyContactPhone || '-'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-text-primary">
                {t('detail.sections.banking')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-text-muted">
                    {t('detail.fields.bankAccountNumber')}
                  </dt>
                  <dd className="text-sm font-medium text-text-primary mt-1 tabular-nums">
                    {employee.bankAccountNumber || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.bankName')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.bankName || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.bankBranch')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.bankBranch || '-'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-text-primary">
                {t('detail.sections.taxInsurance')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-text-muted">{t('detail.fields.taxCode')}</dt>
                  <dd className="text-sm font-medium text-text-primary mt-1 tabular-nums">
                    {employee.taxCode || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">
                    {t('detail.fields.socialInsuranceNumber')}
                  </dt>
                  <dd className="text-sm font-medium text-text-primary mt-1 tabular-nums">
                    {employee.socialInsuranceNumber || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-muted">
                    {t('detail.fields.healthcareFacility')}
                  </dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.healthcareFacility || '-'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-text-primary">
                {t('detail.sections.other')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-text-muted">
                    {t('detail.fields.motorbikeRegistration')}
                  </dt>
                  <dd className="text-sm font-medium text-text-primary mt-1">
                    {employee.motorbikeRegistration || '-'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Leave balances — read-only cards for everyone; HR/Admin can adjust per-year allocations. */}
      <Card>
        <CardContent className="pt-6">
          <EmployeeLeaveBalances employeeId={employee.id} />
        </CardContent>
      </Card>
        </TabsContent>

        <Can permission="contracts:view">
          <TabsContent value="contracts" className="mt-0">
            <Card>
              <CardContent className="pt-6">
                <ContractsTab employeeId={employee.id} />
              </CardContent>
            </Card>
          </TabsContent>
        </Can>
      </Tabs>
    </div>
  );
}
