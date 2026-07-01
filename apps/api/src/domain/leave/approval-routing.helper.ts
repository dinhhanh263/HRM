import type { ApproverType } from '@prisma/client';

/**
 * Pure routing engine for the configurable leave-approval flow (SPEC-005).
 *
 * These functions decide *which* flow applies, *who* must approve each step,
 * and *how* the request advances past auto-skipped steps — all without touching
 * the database, so the routing logic is exhaustively unit-testable. Persistence
 * (snapshotting into LeaveApproval, bumping currentStep) lives in the service.
 *
 * stepOrder convention: ApprovalStep config rows are 0-based (assigned by array
 * index at save time). The runtime snapshot and LeaveRequest.currentStep are
 * 1-based, so currentStep=1 is the first step and currentStep=0 stays reserved
 * for legacy single-step requests (SPEC-004, flowId=null).
 */

/** A single configured step within a flow. */
export interface StepConfig {
  stepOrder: number;
  approverType: ApproverType;
  roleKey: string | null;
  approverId: string | null;
}

/** A flow candidate considered when routing a request. */
export interface FlowCandidate {
  id: string;
  departmentId: string | null;
  active: boolean;
  steps: StepConfig[];
}

/** Everything the engine needs to resolve concrete approvers for a request. */
export interface RoutingContext {
  /** Employee id of the person who filed the request. */
  requesterId: string;
  /** The requester's direct manager (Employee.managerId), or null. */
  directManagerId: string | null;
  /** The head of the requester's department (Department.managerId), or null. */
  departmentHeadId: string | null;
}

/** A resolved step ready to be snapshotted as a LeaveApproval row. */
export interface SnapshotStep {
  /** 1-based position within the running request. */
  stepOrder: number;
  approverType: ApproverType;
  roleKey: string | null;
  /** Resolved expected approver; null for ROLE (capability) or unresolved steps. */
  approverId: string | null;
  /** True when this step is auto-skipped and needs no human decision. */
  skip: boolean;
  /** Machine-readable reason a step was skipped, or null when active. */
  skipReason: string | null;
}

/**
 * Pick the flow that applies to an employee: a department-specific active flow
 * wins, otherwise the tenant default (departmentId === null), otherwise null —
 * which means the request keeps the legacy single-step behaviour. Flows with no
 * steps are ignored so an empty config never traps a request.
 */
export function resolveFlow(
  flows: FlowCandidate[],
  employeeDepartmentId: string | null,
): FlowCandidate | null {
  const usable = flows.filter((f) => f.active && f.steps.length > 0);

  if (employeeDepartmentId) {
    const deptFlow = usable.find((f) => f.departmentId === employeeDepartmentId);
    if (deptFlow) return deptFlow;
  }

  return usable.find((f) => f.departmentId === null) ?? null;
}

/**
 * Resolve a step to a concrete approver. Specific-person types (MANAGER,
 * DEPARTMENT_HEAD, SPECIFIC_USER) yield an approverId (or null if unset); ROLE
 * is capability-based and yields a roleKey with no fixed person.
 */
export function resolveApprover(
  step: StepConfig,
  ctx: RoutingContext,
): { approverId: string | null; roleKey: string | null } {
  switch (step.approverType) {
    case 'MANAGER':
      return { approverId: ctx.directManagerId, roleKey: null };
    case 'DEPARTMENT_HEAD':
      return { approverId: ctx.departmentHeadId, roleKey: null };
    case 'SPECIFIC_USER':
      return { approverId: step.approverId, roleKey: null };
    case 'ROLE':
      return { approverId: null, roleKey: step.roleKey };
    default:
      return { approverId: null, roleKey: null };
  }
}

/**
 * Build the ordered, resolved snapshot for a flow run. A specific-person step is
 * auto-skipped when it resolves to nobody (NO_APPROVER), to the requester
 * themselves (SELF_APPROVAL — no self-approval), or to a person who is already
 * the active approver of an earlier step (DUPLICATE_APPROVER — never ask one
 * person to approve the same request twice). ROLE steps are never auto-skipped —
 * any holder of the role can act, so capability is assumed to exist, and two ROLE
 * steps are not treated as duplicates (a different person may hold the role).
 */
export function buildApprovalSnapshot(flow: FlowCandidate, ctx: RoutingContext): SnapshotStep[] {
  const ordered = [...flow.steps].sort((a, b) => a.stepOrder - b.stepOrder);

  // Concrete approvers already responsible for an earlier *active* step. A later
  // step resolving to the same person is redundant and gets auto-skipped.
  const activeApprovers = new Set<string>();

  return ordered.map((step, index) => {
    const { approverId, roleKey } = resolveApprover(step, ctx);

    let skip = false;
    let skipReason: string | null = null;

    if (step.approverType !== 'ROLE') {
      if (!approverId) {
        skip = true;
        skipReason = 'NO_APPROVER';
      } else if (approverId === ctx.requesterId) {
        skip = true;
        skipReason = 'SELF_APPROVAL';
      } else if (activeApprovers.has(approverId)) {
        skip = true;
        skipReason = 'DUPLICATE_APPROVER';
      } else {
        activeApprovers.add(approverId);
      }
    }

    return {
      stepOrder: index + 1,
      approverType: step.approverType,
      roleKey,
      approverId,
      skip,
      skipReason,
    };
  });
}

/**
 * Starting at `fromStepOrder` (1-based, inclusive), return the stepOrder of the
 * next step that still needs a human decision, or null when none remain — which
 * signals the request is fully approved.
 */
export function findNextActiveStep(snapshot: SnapshotStep[], fromStepOrder: number): number | null {
  const next = snapshot.find((s) => s.stepOrder >= fromStepOrder && !s.skip);
  return next ? next.stepOrder : null;
}

/** What we know about the person trying to act on an approval step. */
export interface ApprovalActor {
  /** Actor's employee id, or null (e.g. a tenant admin with no employee profile). */
  employeeId: string | null;
  /** Actor's role key (e.g. 'hr_manager'), used to match ROLE steps; null if none. */
  roleKey: string | null;
  /** SUPER_ADMIN bypasses approver matching entirely (implicit-all). */
  isSuperAdmin: boolean;
}

/** The resolved/expected approver of a step the actor wants to decide. */
export interface ApprovalTarget {
  approverType: ApproverType;
  roleKey: string | null;
  approverId: string | null;
}

/**
 * Decide whether `actor` may record a decision on `target`. SUPER_ADMIN always
 * may. ROLE steps are capability-based — any holder of the role key qualifies.
 * Specific-person steps require the actor to be exactly the resolved approver
 * (an unresolved step, approverId === null, can never be matched by a human).
 */
export function matchesApprover(target: ApprovalTarget, actor: ApprovalActor): boolean {
  if (actor.isSuperAdmin) return true;
  if (target.approverType === 'ROLE') {
    return target.roleKey !== null && actor.roleKey === target.roleKey;
  }
  return target.approverId !== null && actor.employeeId === target.approverId;
}

/** SPEC-046: a single CC/watcher entry on a flow (view-only, never an approver). */
export interface WatcherTarget {
  watcherType: 'ROLE' | 'SPECIFIC_USER';
  roleKey: string | null;
  watcherId: string | null;
}

/**
 * Decide whether `actor` watches (is CC'd on) a flow given its watcher list.
 * ROLE watchers match any holder of the role key; SPECIFIC_USER watchers match
 * exactly the named employee. This grants *view* only — it never confers the
 * ability to approve/reject (watchers are absent from the approval step chain).
 */
export function isWatcher(
  watchers: WatcherTarget[],
  actor: Pick<ApprovalActor, 'employeeId' | 'roleKey'>,
): boolean {
  return watchers.some((w) => {
    if (w.watcherType === 'ROLE') {
      return w.roleKey !== null && actor.roleKey === w.roleKey;
    }
    return w.watcherId !== null && actor.employeeId === w.watcherId;
  });
}
