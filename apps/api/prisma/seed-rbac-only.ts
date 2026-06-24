// Back-compat shim. The canonical, idempotent RBAC + approval-flow sync now
// lives at src/scripts/seed-rbac.ts so it compiles into `dist` and can run in
// the production image (which has no `src`). Importing it executes the sync.
//   Local:      pnpm --filter @hrm/api db:seed:rbac   (or tsx this file)
//   Production: node apps/api/dist/scripts/seed-rbac.js  (Cloud Run job)
import '../src/scripts/seed-rbac.js';
