import { isAxiosError } from 'axios';

/**
 * Extract the human-readable message from the API error envelope
 * ({ success: false, error: { code, message } }). Axios's own `error.message`
 * is just "Request failed with status code NNN", which is useless to users —
 * prefer the server message and fall back to a caller-supplied string.
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  return isAxiosError(err) && typeof err.response?.data?.error?.message === 'string'
    ? err.response.data.error.message
    : fallback;
}

/**
 * Extract the machine-readable error code (e.g. 'EMAIL_EXISTS') from the API
 * error envelope, so callers can map server errors to specific form fields.
 */
export function getApiErrorCode(err: unknown): string | undefined {
  return isAxiosError(err) && typeof err.response?.data?.error?.code === 'string'
    ? err.response.data.error.code
    : undefined;
}
