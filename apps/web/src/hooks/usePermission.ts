import { useCallback } from 'react';
import type { PermissionKey } from '@hrm/shared';
import { useAuthStore } from '@/stores/auth.store';

/**
 * UI-only permission checks. The server re-checks every request, so this layer
 * is for hiding/showing affordances, never the source of authority.
 */
export function usePermission() {
  const permissions = useAuthStore((s) => s.user?.permissions);

  const can = useCallback(
    (key: PermissionKey) => permissions?.includes(key) ?? false,
    [permissions],
  );

  const canAny = useCallback(
    (keys: PermissionKey[]) => keys.some((key) => permissions?.includes(key) ?? false),
    [permissions],
  );

  const canAll = useCallback(
    (keys: PermissionKey[]) => keys.every((key) => permissions?.includes(key) ?? false),
    [permissions],
  );

  return { can, canAny, canAll };
}
