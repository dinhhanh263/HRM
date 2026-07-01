import { db } from '../../infrastructure/database/client.js';
import { recomputeAccountBalance } from '../repositories/cash-transaction.repository.js';
import { parseCashTxFile, type ImportFileFormat } from './cash-transaction-import.parser.js';
import type {
  CashTxImportParseResult,
  CashTxImportPreviewRow,
  CashTxImportConfirmResult,
  CashTxImportRowError,
  ParsedCashTxRow,
  TransactionDirection,
} from '@hrm/shared';

interface Lookups {
  accountByName: Map<string, { id: string; issuingEntityId: string; currency: string }>;
  categoryByKindName: Map<string, string>; // `${kind}:${lowername}` -> id
  departmentByName: Map<string, string>;
}

interface ResolvedRow {
  accountId: string;
  issuingEntityId: string;
  currency: string;
  direction: TransactionDirection;
  amount: number;
  occurredAt: Date;
  categoryId: string | null;
  departmentId: string | null;
  reference: string | null;
  description: string | null;
}

async function loadLookups(tenantId: string): Promise<Lookups> {
  const [accounts, categories, departments] = await Promise.all([
    db.fundAccount.findMany({ where: { tenantId, active: true }, select: { id: true, name: true, issuingEntityId: true, currency: true } }),
    db.financeCategory.findMany({ where: { tenantId, active: true }, select: { id: true, name: true, kind: true } }),
    db.department.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ]);
  const accountByName = new Map<string, { id: string; issuingEntityId: string; currency: string }>();
  for (const a of accounts) accountByName.set(a.name.trim().toLowerCase(), { id: a.id, issuingEntityId: a.issuingEntityId, currency: a.currency });
  const categoryByKindName = new Map<string, string>();
  for (const c of categories) categoryByKindName.set(`${c.kind}:${c.name.trim().toLowerCase()}`, c.id);
  const departmentByName = new Map<string, string>();
  for (const d of departments) departmentByName.set(d.name.trim().toLowerCase(), d.id);
  return { accountByName, categoryByKindName, departmentByName };
}

function parseDirection(raw: string): TransactionDirection | null {
  const v = raw.trim().toLowerCase();
  if (['in', 'thu', 'income', 'vào'].includes(v)) return 'IN';
  if (['out', 'chi', 'expense', 'ra'].includes(v)) return 'OUT';
  return null;
}

// Validate one parsed row against the tenant lookups. Returns either a resolved
// payload (ready to insert) or a list of per-cell errors.
function validateRow(
  row: ParsedCashTxRow,
  lk: Lookups,
): { resolved: ResolvedRow | null; errors: CashTxImportRowError[] } {
  const errors: CashTxImportRowError[] = [];
  const err = (column: CashTxImportRowError['column'], code: string, message: string) =>
    errors.push({ row: row.rowNumber, column, code, message });

  const account = lk.accountByName.get(row.account.trim().toLowerCase());
  if (!row.account.trim()) err('account', 'REQUIRED', 'Thiếu tài khoản');
  else if (!account) err('account', 'NOT_FOUND', `Không tìm thấy tài khoản "${row.account}"`);

  const direction = parseDirection(row.direction);
  if (!row.direction.trim()) err('direction', 'REQUIRED', 'Thiếu loại (Thu/Chi)');
  else if (!direction) err('direction', 'INVALID', `Loại không hợp lệ: "${row.direction}" (Thu/Chi)`);

  const amount = Number(row.amount.replace(/[,\s]/g, ''));
  if (!row.amount.trim()) err('amount', 'REQUIRED', 'Thiếu số tiền');
  else if (!Number.isFinite(amount) || amount <= 0) err('amount', 'INVALID', `Số tiền không hợp lệ: "${row.amount}"`);

  const occurredAt = row.date.trim() ? new Date(row.date.trim()) : null;
  if (!row.date.trim()) err('date', 'REQUIRED', 'Thiếu ngày');
  else if (!occurredAt || Number.isNaN(occurredAt.getTime())) err('date', 'INVALID', `Ngày không hợp lệ: "${row.date}" (YYYY-MM-DD)`);

  // Category: optional, but if given must exist AND match the direction's kind.
  let categoryId: string | null = null;
  if (row.category.trim() && direction) {
    const kind = direction === 'IN' ? 'INCOME' : 'EXPENSE';
    categoryId = lk.categoryByKindName.get(`${kind}:${row.category.trim().toLowerCase()}`) ?? null;
    if (!categoryId) err('category', 'NOT_FOUND', `Danh mục "${row.category}" không tồn tại (loại ${kind})`);
  }

  // Department: optional; if given must exist.
  let departmentId: string | null = null;
  if (row.department.trim()) {
    departmentId = lk.departmentByName.get(row.department.trim().toLowerCase()) ?? null;
    if (!departmentId) err('department', 'NOT_FOUND', `Bộ phận "${row.department}" không tồn tại`);
  }

  if (errors.length > 0 || !account || !direction || !occurredAt) return { resolved: null, errors };

  return {
    resolved: {
      accountId: account.id,
      issuingEntityId: account.issuingEntityId,
      currency: account.currency,
      direction,
      amount,
      occurredAt,
      categoryId,
      departmentId,
      reference: row.reference.trim() || null,
      description: row.description.trim() || null,
    },
    errors,
  };
}

export const cashTransactionImportService = {
  // Stateless: parse + validate, return a preview. Nothing is written.
  async parse(tenantId: string, buffer: Buffer, format: ImportFileFormat): Promise<CashTxImportParseResult> {
    const parsed = await parseCashTxFile(buffer, format);
    if (parsed.errors.length > 0) {
      return { totalRows: 0, validCount: 0, errorCount: 0, fileErrors: parsed.errors, rows: [] };
    }
    const lk = await loadLookups(tenantId);
    const rows: CashTxImportPreviewRow[] = parsed.rows.map((r) => ({
      rowNumber: r.rowNumber,
      data: r,
      errors: validateRow(r, lk).errors,
    }));
    const errorCount = rows.filter((r) => r.errors.length > 0).length;
    return {
      totalRows: rows.length,
      validCount: rows.length - errorCount,
      errorCount,
      fileErrors: [],
      rows,
    };
  },

  // Re-parse + re-validate the uploaded file server-side (never trust client data),
  // then insert every valid row and recompute each touched account once.
  async confirm(
    tenantId: string,
    userId: string,
    buffer: Buffer,
    format: ImportFileFormat,
  ): Promise<CashTxImportConfirmResult> {
    const parsed = await parseCashTxFile(buffer, format);
    if (parsed.errors.length > 0) return { created: 0, skipped: 0 };

    const lk = await loadLookups(tenantId);
    const valid: ResolvedRow[] = [];
    let skipped = 0;
    for (const r of parsed.rows) {
      const { resolved } = validateRow(r, lk);
      if (resolved) valid.push(resolved);
      else skipped += 1;
    }
    if (valid.length === 0) return { created: 0, skipped };

    const touchedAccounts = new Set(valid.map((v) => v.accountId));
    await db.$transaction(async (tx) => {
      await tx.cashTransaction.createMany({
        data: valid.map((v) => ({
          tenantId,
          accountId: v.accountId,
          issuingEntityId: v.issuingEntityId,
          direction: v.direction,
          status: 'ACTUAL',
          amount: v.amount,
          currency: v.currency,
          occurredAt: v.occurredAt,
          categoryId: v.categoryId,
          departmentId: v.departmentId,
          reference: v.reference,
          description: v.description,
          source: 'IMPORT',
          createdById: userId,
        })),
      });
      for (const accountId of touchedAccounts) {
        await recomputeAccountBalance(tx, accountId);
      }
    });
    return { created: valid.length, skipped };
  },
};
