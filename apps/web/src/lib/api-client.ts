import axios, { type AxiosError } from 'axios';
import type { ApiError } from '@hrm/shared';
import { clearSessionMarkers } from './session-persistence';

// Same-origin '/api/v1' by default (proxied to the API in dev, and via the
// Firebase Hosting rewrite in prod — no CORS). Override with VITE_API_URL at
// build time for a cross-origin API host.
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

// Refresh tokens are single-use (rotated server-side), so concurrent 401s must
// share one refresh call — otherwise the losers reuse a revoked token and fail.
let refreshPromise: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post('/auth/refresh')
      .then((res) => {
        const newToken = res.data.data.accessToken;
        setAccessToken(newToken);
        return newToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config;
    const isRefreshCall = originalRequest?.url?.includes('/auth/refresh');

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !isRefreshCall &&
      !originalRequest.headers['X-Retry']
    ) {
      try {
        const newToken = await refreshAccessToken();

        originalRequest.headers['X-Retry'] = 'true';
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch {
        setAccessToken(null);
        clearSessionMarkers();
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);
