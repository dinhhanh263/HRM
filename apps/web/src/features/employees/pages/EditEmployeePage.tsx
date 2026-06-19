import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UpdateEmployeeRequest } from '@hrm/shared';
import { Button } from '@/components/ui/button';
import { EmployeeForm } from '../components/EmployeeForm';
import { useEmployee, useUpdateEmployee } from '../hooks/useEmployees';
import { getApiErrorMessage } from '@/lib/api-error';
import { getServerFieldError } from '../utils/server-field-errors';
import { ArrowLeft, AlertCircle, X } from 'lucide-react';

export function EditEmployeePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('employee');

  const { data: employee, isLoading, error } = useEmployee(id!);
  const updateMutation = useUpdateEmployee(id!);

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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/employees/${id}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('shared.back')}
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('edit.title')}</h1>
          <p className="text-text-secondary text-sm mt-1">
            {employee.fullName}{' '}
            <span className="font-mono text-text-muted">({employee.employeeCode})</span>
          </p>
        </div>
      </div>

      <EmployeeForm
        employee={employee}
        onSubmit={(data) => {
          // Empty optional fields come back as '' from the form; send undefined
          // so the API's validators (date format, cuid) don't reject ''. managerId
          // is intentionally nullable — null clears the assignment.
          const request: UpdateEmployeeRequest = {
            fullName: data.fullName,
            phone: data.phone || undefined,
            departmentId: data.departmentId || undefined,
            positionId: data.positionId || undefined,
            managerId: data.managerId || null,
            dateOfBirth: data.dateOfBirth || undefined,
            gender: data.gender || undefined,
            idNumber: data.idNumber || undefined,
            contractType: data.contractType,
            // null clears the probation date; an empty string would fail the date validator.
            probationEndDate: data.probationEndDate || null,
            roleId: data.roleId || undefined,
            // Empty string means the avatar was removed → null clears it.
            avatarUrl: data.avatarUrl || null,
            // Extended profile fields (SPEC-040). Empty string → null clears the
            // column; an empty date string would otherwise fail the API validator.
            placeOfBirth: data.placeOfBirth || null,
            idIssueDate: data.idIssueDate || null,
            idIssuePlace: data.idIssuePlace || null,
            personalEmail: data.personalEmail || null,
            education: data.education || null,
            maritalStatus: data.maritalStatus || null,
            permanentAddress: data.permanentAddress || null,
            currentAddress: data.currentAddress || null,
            emergencyContactName: data.emergencyContactName || null,
            emergencyContactRelationship: data.emergencyContactRelationship || null,
            emergencyContactPhone: data.emergencyContactPhone || null,
            bankAccountNumber: data.bankAccountNumber || null,
            bankName: data.bankName || null,
            bankBranch: data.bankBranch || null,
            taxCode: data.taxCode || null,
            socialInsuranceNumber: data.socialInsuranceNumber || null,
            healthcareFacility: data.healthcareFacility || null,
            motorbikeRegistration: data.motorbikeRegistration || null,
          };
          updateMutation.mutate(request, {
            onSuccess: () => {
              navigate(`/employees/${id}`);
            },
          });
        }}
        onCancel={() => navigate(`/employees/${id}`)}
        isLoading={updateMutation.isPending}
        serverError={updateMutation.error}
      />

      {/* Banner only for errors that don't map to a specific field. */}
      {updateMutation.error && !getServerFieldError(updateMutation.error) && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-danger-light border border-danger/20">
          <AlertCircle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-danger">{t('states.error', { ns: 'common' })}</p>
            <p className="text-sm text-danger/80 mt-1">
              {getApiErrorMessage(updateMutation.error, t('edit.error'))}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
