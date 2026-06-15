import type { PrismaClient } from '@prisma/client';

// The 5 leave types every tenant starts with (Vietnam context). Tenants can
// edit/deactivate these or add their own via the leave-type config UI.
export const DEFAULT_LEAVE_TYPES = [
  { code: 'ANNUAL', name: 'Nghỉ phép năm', colorHex: '#3B82F6', defaultDays: 12, paid: true, requiresAttachment: false },
  { code: 'SICK', name: 'Nghỉ ốm', colorHex: '#F59E0B', defaultDays: 30, paid: true, requiresAttachment: false },
  { code: 'PERSONAL', name: 'Nghỉ việc riêng', colorHex: '#8B5CF6', defaultDays: 3, paid: true, requiresAttachment: false },
  { code: 'UNPAID', name: 'Nghỉ không lương', colorHex: '#6B7280', defaultDays: 0, paid: false, requiresAttachment: false },
  { code: 'MATERNITY', name: 'Nghỉ thai sản', colorHex: '#EC4899', defaultDays: 180, paid: true, requiresAttachment: true },
] as const;

/** Idempotently seed the default leave types for a tenant. */
export async function seedLeaveTypesForTenant(prisma: PrismaClient, tenantId: string): Promise<void> {
  for (const def of DEFAULT_LEAVE_TYPES) {
    await prisma.leaveType.upsert({
      where: { tenantId_code: { tenantId, code: def.code } },
      update: {},
      create: {
        tenantId,
        code: def.code,
        name: def.name,
        colorHex: def.colorHex,
        defaultDays: def.defaultDays,
        paid: def.paid,
        requiresAttachment: def.requiresAttachment,
        active: true,
      },
    });
  }
}
