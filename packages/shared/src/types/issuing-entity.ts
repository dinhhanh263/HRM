// SPEC-043: Pháp nhân phát hành (Issuing Entity) — đơn vị đứng tên trên PO PDF.
// Master data theo tenant; phiếu PR chọn 1 entity và snapshot trọn bộ thông tin.

export interface IssuingEntityDto {
  id: string;
  name: string;
  address: string | null;
  taxCode: string | null;
  phone: string | null;
  logoUrl: string | null;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// Light reference đính kèm vào PurchaseRequestDto (resolved entity hiện tại — có
// thể đã bị ẩn/sửa; PDF dùng snapshot trên phiếu chứ không phải ref này).
export interface IssuingEntityRefDto {
  id: string;
  name: string;
  active: boolean;
}

export interface CreateIssuingEntityRequest {
  name: string;
  address?: string | null;
  taxCode?: string | null;
  phone?: string | null;
  isDefault?: boolean;
}

export interface UpdateIssuingEntityRequest {
  name?: string;
  address?: string | null;
  taxCode?: string | null;
  phone?: string | null;
  isDefault?: boolean;
  active?: boolean;
}
