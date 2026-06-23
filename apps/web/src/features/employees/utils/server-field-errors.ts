import { getApiErrorCode } from '@/lib/api-error';

export interface ServerFieldError {
  field: 'email' | 'idNumber' | 'employeeCode';
  // i18n key in the `employee` namespace — render via t(message).
  message: string;
}

// Server conflict codes that correspond to a single form field. Mapped errors
// are surfaced inline on the field (with focus) instead of the generic banner.
const SERVER_FIELD_ERRORS: Record<string, ServerFieldError> = {
  EMAIL_EXISTS: { field: 'email', message: 'form.validation.emailExists' },
  ID_NUMBER_EXISTS: { field: 'idNumber', message: 'form.validation.idNumberExists' },
  EMPLOYEE_CODE_EXISTS: { field: 'employeeCode', message: 'form.validation.employeeCodeExists' },
};

export function getServerFieldError(err: unknown): ServerFieldError | undefined {
  const code = getApiErrorCode(err);
  return code ? SERVER_FIELD_ERRORS[code] : undefined;
}
