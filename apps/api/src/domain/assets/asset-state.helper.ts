import { ConflictError } from '../../shared/errors/index.js';
import type { AssetStatus } from '@hrm/shared';

// Lifecycle guards for asset state transitions. Kept pure (no DB) so the rules
// are unit-testable and reused by every mutating operation. The actual status
// flip happens atomically in the service via a conditional updateMany, but these
// guards give a clear, early 409 with a stable error code.

// Cấp phát: chỉ tài sản đang rảnh (AVAILABLE) mới giao được.
export function assertAssignable(status: AssetStatus): void {
  if (status !== 'AVAILABLE') {
    throw new ConflictError(
      'Asset must be AVAILABLE to be assigned',
      'ASSET_NOT_ASSIGNABLE',
    );
  }
}

// Thu hồi: chỉ tài sản đang được giữ (ASSIGNED) mới thu lại được.
export function assertReturnable(status: AssetStatus): void {
  if (status !== 'ASSIGNED') {
    throw new ConflictError(
      'Asset must be ASSIGNED to be returned',
      'ASSET_NOT_RETURNABLE',
    );
  }
}

// Bắt đầu bảo trì: chỉ tài sản đang rảnh (AVAILABLE) mới đưa vào bảo trì được —
// tài sản đang cấp phát phải thu hồi trước.
export function assertMaintainable(status: AssetStatus): void {
  if (status !== 'AVAILABLE') {
    throw new ConflictError(
      'Asset must be AVAILABLE to start maintenance',
      'ASSET_NOT_MAINTAINABLE',
    );
  }
}

// Hoàn tất bảo trì: chỉ tài sản đang bảo trì (UNDER_MAINTENANCE) mới đóng được.
export function assertMaintenanceCompletable(status: AssetStatus): void {
  if (status !== 'UNDER_MAINTENANCE') {
    throw new ConflictError(
      'Asset is not under maintenance',
      'ASSET_NOT_UNDER_MAINTENANCE',
    );
  }
}

// Thanh lý: không thanh lý tài sản đang cấp phát (thu hồi trước), và không thanh
// lý lại tài sản đã ở trạng thái terminal (RETIRED/LOST).
export function assertDisposable(status: AssetStatus): void {
  if (status === 'ASSIGNED') {
    throw new ConflictError(
      'Asset must be returned before disposal',
      'ASSET_NOT_DISPOSABLE',
    );
  }
  if (status === 'RETIRED' || status === 'LOST') {
    throw new ConflictError('Asset is already disposed', 'ASSET_ALREADY_DISPOSED');
  }
}
