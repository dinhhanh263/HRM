// SPEC-037 — self-service "My Account". Every endpoint acts on the caller's
// own identity (req.user.sub); none of these DTOs ever carry another user.

export interface MyAccountUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  lastLoginAt: string | null;
}

export interface MyAccountEmployee {
  id: string;
  employeeCode: string;
  departmentName: string | null;
  positionName: string | null;
  joinDate: string;
  phone: string | null;
  avatar: string | null;
}

export interface MyAccountDto {
  user: MyAccountUser;
  /** null when the account has no linked employee profile (e.g. pure admin). */
  employee: MyAccountEmployee | null;
  /** First successful Google sign-in; null = never used SSO. */
  googleLinkedAt: string | null;
  /** Email preference per reminder kind; missing key = enabled. */
  notificationPrefs: Record<string, boolean>;
}

export interface UpdateMyProfileRequest {
  phone?: string;
  avatar?: string;
}

export interface MySessionDto {
  id: string;
  /** Best-effort "Chrome · macOS" parsed from the user agent; null = unknown. */
  device: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  persistent: boolean;
  /** True for the session that made this request (matched by cookie). */
  current: boolean;
}
