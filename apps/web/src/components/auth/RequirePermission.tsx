import type { ReactNode } from 'react';
import type { PermissionKey } from '@hrm/shared';
import { usePermission } from '@/hooks/usePermission';
import { ForbiddenPage } from './ForbiddenPage';

type RequirePermissionProps = {
  children: ReactNode;
} & (
  | { permission: PermissionKey; anyOf?: never; allOf?: never }
  | { permission?: never; anyOf: PermissionKey[]; allOf?: never }
  | { permission?: never; anyOf?: never; allOf: PermissionKey[] }
);

/**
 * Route-level guard. Renders the 403 page (instead of silently redirecting)
 * when the current user lacks the required permission. Server still enforces.
 */
export function RequirePermission({ children, ...rest }: RequirePermissionProps) {
  const { can, canAny, canAll } = usePermission();

  let allowed = false;
  if ('permission' in rest && rest.permission) {
    allowed = can(rest.permission);
  } else if ('anyOf' in rest && rest.anyOf) {
    allowed = canAny(rest.anyOf);
  } else if ('allOf' in rest && rest.allOf) {
    allowed = canAll(rest.allOf);
  }

  return <>{allowed ? children : <ForbiddenPage />}</>;
}
