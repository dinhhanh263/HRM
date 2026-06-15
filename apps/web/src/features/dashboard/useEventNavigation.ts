import { useNavigate } from 'react-router-dom';
import type { DashboardEvent } from '@hrm/shared';
import { usePermission } from '@/hooks/usePermission';

/**
 * SPEC-034 §3 — deep-link per event kind, gated by the target screen's view
 * permission (UX only; the routes re-check server-side). Returns undefined when
 * the user can't act, so callers render the item non-interactive.
 */
export function useEventNavigation() {
  const navigate = useNavigate();
  const { can } = usePermission();

  return (event: DashboardEvent): (() => void) | undefined => {
    if (event.kind === 'probation_ending') {
      if (!can('probation:view')) return undefined;
      return () => navigate(`/probation?employee=${event.employeeId}`);
    }
    if (!can('employees:view')) return undefined;
    return () => navigate(`/employees/${event.employeeId}`);
  };
}
