import type { ReactNode } from 'react';
import type { PermissionKey } from '@hrm/shared';
import { usePermission } from '@/hooks/usePermission';

type CanProps = {
  children: ReactNode;
  /** Shown instead of children when the check fails. Defaults to nothing. */
  fallback?: ReactNode;
} & (
  | { permission: PermissionKey; anyOf?: never; allOf?: never }
  | { permission?: never; anyOf: PermissionKey[]; allOf?: never }
  | { permission?: never; anyOf?: never; allOf: PermissionKey[] }
);

/**
 * Conditionally renders UI based on the current user's permissions.
 * Server still enforces — this only hides affordances the user can't use.
 */
export function Can({ children, fallback = null, ...rest }: CanProps) {
  const { can, canAny, canAll } = usePermission();

  let allowed = false;
  if ('permission' in rest && rest.permission) {
    allowed = can(rest.permission);
  } else if ('anyOf' in rest && rest.anyOf) {
    allowed = canAny(rest.anyOf);
  } else if ('allOf' in rest && rest.allOf) {
    allowed = canAll(rest.allOf);
  }

  return <>{allowed ? children : fallback}</>;
}
