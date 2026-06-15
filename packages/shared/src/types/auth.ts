import type { UserDto } from './user.js';

export interface LoginRequest {
  email: string;
  password: string;
  tenantSlug: string;
  // When true, the refresh session persists across browser restarts (7 days).
  // When false/absent, it lasts only until the browser closes (session cookie).
  rememberMe?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  tenantSlug: string;
}

export interface AuthResponse {
  user: UserDto;
  accessToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
  tenantSlug: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}
