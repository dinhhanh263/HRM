# SPEC-043: Issuing Entities (Pháp nhân phát hành) cho Purchase Order PDF

**Status:** Approved (discovery resolved 2026-06-24)
**Created:** 2026-06-24
**Author:** Claude + Hạnh
**Depends on:** SPEC-036 (Tenant Settings Center — hạ tầng cấu hình), SPEC-042 (Purchase Request — nơi dùng), SPEC-039 (Storage driver — lưu logo)

---

## Objective

Một tenant (CodeCrush Asia) vận hành **nhiều pháp nhân** (vd CodeCrush Asia JSC, **Hale**). Cho phép khai báo **danh sách pháp nhân phát hành** (tên, địa chỉ, MST, SĐT, **logo**) trong Cài đặt, và khi tạo **Purchase Request** chọn pháp nhân phát hành; **PDF phiếu PO** in **trọn bộ** thông tin + logo của đúng pháp nhân đó thay vì lấy cứng từ `settings.company`.

## Vấn đề cần giải

- Hiện PDF lấy header từ `Tenant.settings.company` (1 bộ duy nhất) → không in được phiếu dưới danh nghĩa pháp nhân khác (Hale).
- Nếu chỉ nhập tên + logo rời mỗi phiếu thì **địa chỉ/MST vẫn của CodeCrush** → header "lai" sai MST (rủi ro với chứng từ gửi NCC). ⇒ thông tin pháp nhân phải đi **trọn bộ**.

## Quyết định discovery (đã chốt 2026-06-24)

1. **Master data, không nhập tay mỗi phiếu** — khai báo pháp nhân 1 lần trong Cài đặt, form PR **chọn từ dropdown**. (Hướng B.)
2. **Trọn bộ trường mỗi pháp nhân**: `name`, `address`, `taxCode`, `phone`, `logoUrl`. (Header PDF đầy đủ, tránh "lai".)
3. **Bảng Prisma mới `IssuingEntity`** (không nhét vào settings JSON — có logo nhị phân + cần picker/quan hệ). Theo convention `LeaveType`/`AssetCategory`.
4. **Snapshot vào phiếu lúc tạo/sửa** — lưu bản sao `issuingCompanyName/Address/TaxCode/Phone/LogoUrl` trên `PurchaseRequest`. Sửa/xoá pháp nhân sau này **không làm sai** PDF phiếu cũ (giống snapshot bước duyệt).
5. **Logo chỉ PNG/JPEG** (pdfkit `doc.image` **không** hỗ trợ WebP/SVG), ≤ 2MB. Lưu qua `createBlobStorage` prefix `/uploads/entity-logo`.
6. **Quyền = quyền Cài đặt** (`settings:view` / `settings:update`) — đây là cấu hình tenant (SUPER_ADMIN, HR_MANAGER). **Không** thêm permission mới.
7. **Có 1 pháp nhân mặc định** (`isDefault`) — form PR chọn sẵn. Backfill 1 pháp nhân mặc định từ `settings.company` hiện có khi migrate (nếu `company.name` không rỗng).
8. **Fallback an toàn**: phiếu không có snapshot (phiếu cũ) hoặc tenant chưa khai pháp nhân → PDF dùng `settings.company` như hiện tại. **Không phá** phiếu cũ.
9. **Xoá mềm bằng `active`** — ẩn pháp nhân khỏi dropdown nhưng không phá snapshot phiếu đã dùng. Cho phép xoá cứng nếu chưa từng dùng (tuỳ chọn iteration sau; iteration này dùng `active=false`).

## Target Users

| User | Actions |
|------|---------|
| **SUPER_ADMIN / HR_MANAGER** | Thêm/sửa/ẩn pháp nhân + upload logo + đặt mặc định (trong Cài đặt) |
| **Người tạo PR** (EMPLOYEE…) | Chọn pháp nhân phát hành khi tạo/sửa phiếu (mặc định = pháp nhân default) |
| **Mọi người xem PDF** | PDF in đúng pháp nhân đã chọn |

---

## Core Features

### 1. Quản lý pháp nhân trong Cài đặt
**Acceptance Criteria:**
- [ ] Section/màn "Đơn vị phát hành" trong `/settings`: danh sách card (tên, MST, badge "Mặc định", logo thumbnail), nút Thêm.
- [ ] Form (Sheet): `name` (bắt buộc), `address`, `taxCode`, `phone`, `logo` (upload PNG/JPEG ≤2MB, preview, xoá), `isDefault` (toggle).
- [ ] Đặt 1 pháp nhân `isDefault` → bỏ default ở các pháp nhân khác (chỉ 1 default/tenant).
- [ ] Sửa / Ẩn (`active=false`) pháp nhân. Pháp nhân ẩn không hiện trong dropdown tạo phiếu nhưng phiếu cũ vẫn in đúng (snapshot).
- [ ] Gate `settings:view` (xem) / `settings:update` (sửa). Tenant-scoped.

### 2. Chọn pháp nhân khi tạo/sửa Purchase Request
**Acceptance Criteria:**
- [ ] Form PR thêm dropdown **"Đơn vị phát hành"**, mặc định chọn pháp nhân `isDefault` (nếu có).
- [ ] Khi tạo/sửa/gửi-lại: server **resolve** pháp nhân theo `issuingEntityId`, **snapshot** `name/address/taxCode/phone/logoUrl` vào phiếu (trong cùng transaction tính tổng).
- [ ] `issuingEntityId` không bắt buộc — không chọn (hoặc tenant chưa khai) → snapshot rỗng → PDF fallback `settings.company`.
- [ ] Validate `issuingEntityId` thuộc đúng tenant + đang `active` (khi tạo mới).

### 3. PDF phiếu PO dùng pháp nhân
**Acceptance Criteria:**
- [ ] Header PDF lấy `issuing*` snapshot của phiếu: tên (đậm) + dòng `địa chỉ · 📞 phone · MST: taxCode` + **logo** (góc trái/phải header).
- [ ] Logo nhúng qua `doc.image(buffer, …)` (đọc từ storage). PNG/JPEG; lỗi/thiếu logo → bỏ qua, không vỡ PDF (try/catch như `handover.pdf.ts`).
- [ ] Không có snapshot → fallback `settings.company` (không logo) như hành vi hiện tại.

---

## Data Model

```prisma
model IssuingEntity {
  id        String   @id @default(cuid())
  tenantId  String   @map("tenant_id")
  name      String
  address   String?
  taxCode   String?  @map("tax_code")
  phone     String?
  logoUrl   String?  @map("logo_url")          // /uploads/entity-logo/<uuid>.<png|jpg>
  isDefault Boolean  @default(false) @map("is_default")
  active    Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  tenant           Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  purchaseRequests PurchaseRequest[]

  @@index([tenantId])
  @@map("issuing_entities")
}

// PurchaseRequest — bổ sung (snapshot, đều nullable để fallback & không phá phiếu cũ):
//   issuingEntityId     String?   @map("issuing_entity_id")
//   issuingCompanyName  String?   @map("issuing_company_name")
//   issuingAddress      String?   @map("issuing_address")
//   issuingTaxCode      String?   @map("issuing_tax_code")
//   issuingPhone        String?   @map("issuing_phone")
//   issuingLogoUrl      String?   @map("issuing_logo_url")
//   issuingEntity       IssuingEntity? @relation(fields: [issuingEntityId], references: [id])
//   @@index([issuingEntityId])
// Tenant — back-relation: issuingEntities IssuingEntity[]
```

Migration backfill: nếu `Tenant.settings.company.name` không rỗng → tạo 1 `IssuingEntity` `isDefault=true` từ company (name/address/taxCode/phone, không logo).

## API (dưới `/api/v1/issuing-entities`)

| Method | Path | Permission | Notes |
|--------|------|-----------|-------|
| GET | `/` | `settings:view` | list pháp nhân của tenant (gồm `active=false` cho màn quản lý; query `?activeOnly=1` cho dropdown) |
| POST | `/` | `settings:update` | tạo (name bắt buộc); nếu `isDefault` → bỏ default cũ (transaction) |
| PATCH | `/:id` | `settings:update` | sửa; set default; `active` |
| DELETE | `/:id` | `settings:update` | ẩn (`active=false`); hoặc xoá cứng nếu chưa phiếu nào dùng |
| POST | `/:id/logo` | `settings:update` | upload logo (multipart `file`, PNG/JPEG ≤2MB) → set `logoUrl` |
| DELETE | `/:id/logo` | `settings:update` | gỡ logo |
| GET | `/:id/logo` | `settings:view` | stream ảnh logo (RBAC + tenant scope) — cho thumbnail UI |

> PDF đọc logo **trực tiếp từ storage** ở server (không qua HTTP), nên không phụ thuộc endpoint GET logo.

## Tái sử dụng hạ tầng

| Thành phần | Chiến lược |
|-----------|-----------|
| `settings.service` pattern + audit | tham chiếu; entity là bảng riêng nên service riêng `issuing-entity.service.ts` |
| `createBlobStorage` (`blob-storage.ts`) | **dùng nguyên**, config mới `entity-logo` (PNG/JPEG, ≤2MB) |
| multer image middleware (mirror `purchase-upload`) | nhân bản, **chỉ PNG/JPEG** (bỏ WebP/PDF) |
| `po.pdf.ts` | sửa header: nhận `company` từ snapshot phiếu + buffer logo; `doc.image` như `handover.pdf.ts` |
| Settings UI section pattern (`SettingsPage.tsx`) | thêm section "Đơn vị phát hành" (list + Sheet form + logo uploader) |
| PR form/service/validator/mappers/types (SPEC-042) | bổ sung `issuingEntityId` + snapshot + dropdown |

## i18n

- Namespace `settings.json` (vi+en): thêm khối `issuingEntities.*` (tiêu đề, field, nút, toast).
- Namespace `purchase.json`: thêm `form.issuingEntity` (+ placeholder "Mặc định").

## Out of scope (iteration sau)

- Logo SVG/WebP (pdfkit không hỗ trợ — chỉ PNG/JPEG).
- Mỗi dòng hàng/đa pháp nhân trên cùng phiếu (1 phiếu = 1 pháp nhân).
- Dùng pháp nhân cho Payment Request/payslip (kiến trúc mở sẵn, làm khi cần).
- E-invoice / chữ ký số / con dấu ảnh.

## Non-functional

- Tenant-scoped tuyệt đối; RBAC server-side; set-default + create/update trong transaction.
- TDD: resolve+snapshot entity khi tạo/sửa; chỉ 1 default/tenant; fallback khi không có entity.
- Logo: validate MIME (PNG/JPEG) + size **ở server**; PDF nhúng lỗi không vỡ tài liệu.
- WCAG AA, dark mode, i18n vi+en, design token; số `tabular-nums`.

## Boundaries

### Always Do
- Snapshot thông tin pháp nhân vào phiếu lúc tạo/sửa (PDF phiếu cũ ổn định).
- Logo **chỉ PNG/JPEG**; validate server-side; nhúng PDF bọc try/catch.
- Chỉ **1 `isDefault`** mỗi tenant (transaction khi set).
- Fallback `settings.company` khi phiếu không có snapshot.

### Ask First
- Xoá cứng pháp nhân đã được phiếu tham chiếu (mặc định: ẩn `active=false`).
- Dùng pháp nhân cho module khác ngoài Purchase.

### Never Do
- Không tin `issuingEntityId` của tenant khác (validate tenant scope).
- Không lưu logo ra public bucket; không nhúng định dạng pdfkit không đọc được.
- Không làm vỡ PDF khi logo lỗi/thiếu.
