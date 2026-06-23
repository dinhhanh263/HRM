// Caps for the asset bulk-import feature. Unlike employee import, the confirm
// step is a single synchronous, all-or-nothing `prisma.$transaction`, so the row
// cap is lower (the whole batch is one interactive transaction).

/** Maximum number of DATA rows (header excluded) accepted in one file. */
export const ASSET_IMPORT_MAX_ROWS = 2_000;
