import type { ApplicationStatus } from '@hrm/shared';

/** Minimal shape needed to place an application into a column. */
interface GroupableApplication {
  currentStageId: string;
  status: ApplicationStatus;
}

/**
 * Group applications into their pipeline columns keyed by stage id.
 *
 * Every application — open OR closed — is placed at its resting stage so the
 * board never "loses" a card: a hire lands on the HIRED stage, a reject/withdraw
 * stays on the stage it ended on (mirrors the dialog copy "giữ nguyên ở bước
 * hiện tại"). Closed cards sink below the active ones so the live funnel reads
 * first. Pure: no UI, no I/O. Generic so the caller keeps its full DTO type.
 */
export function groupApplicationsByStage<
  A extends GroupableApplication,
  S extends { id: string },
>(applications: A[], stages: S[]): Map<string, A[]> {
  const map = new Map<string, A[]>();
  for (const stage of stages) map.set(stage.id, []);

  // Stable partition: active cards first, closed cards after, preserving the
  // server's ordering within each group.
  const active: A[] = [];
  const closed: A[] = [];
  for (const app of applications) {
    (app.status === 'ACTIVE' ? active : closed).push(app);
  }
  for (const app of active) map.get(app.currentStageId)?.push(app);
  for (const app of closed) map.get(app.currentStageId)?.push(app);

  return map;
}
