// Caps for the purchase-request line-item import. This import never persists —
// parsed rows are returned to the New Purchase Request form and merged into the
// field array. The row cap mirrors the create validator's `items.max(200)` so a
// file can never carry more items than a single request may hold.

/** Maximum number of DATA rows (header excluded) accepted in one file. */
export const PR_ITEM_IMPORT_MAX_ROWS = 200;
