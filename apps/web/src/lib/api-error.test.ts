import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import { getApiErrorCode, getApiErrorMessage } from './api-error';

function axiosErrorWith(data: unknown): AxiosError {
  const err = new AxiosError('Request failed with status code 409');
  err.response = { data, status: 409 } as AxiosError['response'];
  return err;
}

describe('getApiErrorMessage', () => {
  it('returns the server error message from the API error envelope', () => {
    const err = axiosErrorWith({
      success: false,
      error: { code: 'CONFLICT', message: 'An employee with this ID number already exists' },
    });

    expect(getApiErrorMessage(err, 'fallback')).toBe(
      'An employee with this ID number already exists',
    );
  });

  it('returns the fallback for an axios error without a structured message', () => {
    const err = axiosErrorWith({ raw: 'html error page' });

    expect(getApiErrorMessage(err, 'fallback')).toBe('fallback');
  });

  it('returns the fallback for a non-axios error', () => {
    expect(getApiErrorMessage(new Error('Network Error'), 'fallback')).toBe('fallback');
  });

  it('returns the fallback for null (no error)', () => {
    expect(getApiErrorMessage(null, 'fallback')).toBe('fallback');
  });
});

describe('getApiErrorCode', () => {
  it('returns the server error code from the API error envelope', () => {
    const err = axiosErrorWith({
      success: false,
      error: { code: 'ID_NUMBER_EXISTS', message: 'An employee with this ID number already exists' },
    });

    expect(getApiErrorCode(err)).toBe('ID_NUMBER_EXISTS');
  });

  it('returns undefined for an axios error without a structured code', () => {
    expect(getApiErrorCode(axiosErrorWith({ raw: 'html error page' }))).toBeUndefined();
  });

  it('returns undefined for a non-axios error or null', () => {
    expect(getApiErrorCode(new Error('Network Error'))).toBeUndefined();
    expect(getApiErrorCode(null)).toBeUndefined();
  });
});
