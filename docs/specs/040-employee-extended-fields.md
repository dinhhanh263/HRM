# SPEC-040: Employee Extended Fields — Hồ sơ nhân viên mở rộng

## Objective

Bổ sung các trường hồ sơ nhân viên còn thiếu (theo mẫu "Employee Info" của HR) vào màn
**Employee Details** và 2 form tạo/sửa, phân nhóm theo đúng phong cách hiện tại
(Personal Information, Work Information…). Các trường đã có sẵn (họ tên, ngày sinh, SĐT,
ngày vào làm, chức vụ, số người phụ thuộc) được giữ nguyên, không trùng lặp.

## Target Users

HR_MANAGER / SUPER_ADMIN (tạo & sửa hồ sơ qua `employees:create` / `employees:update`).
MANAGER & EMPLOYEE xem được hồ sơ trong phạm vi RBAC hiện hành (không đổi luật truy cập).

## Scope

**Trong scope:** thêm cột DB (nullable), validator, service mapping, shared types, 2 form
(Create inline + EmployeeForm dùng cho Edit), màn Detail, i18n vi/en.

**Ngoài scope:** bulk import template (giữ nguyên), payroll, đổi luật RBAC. Cột legacy
`address` (đang chết — bị validator strip) **không** được dùng nữa; thay bằng
`permanentAddress` + `currentAddress`.

## Field Mapping — Excel ↔ Hệ thống

| # | Excel | Trạng thái | Field |
|---|-------|-----------|-------|
| 1 | Họ và Tên | có sẵn | `fullName` |
| 2 | Ngày sinh | có sẵn | `dateOfBirth` |
| 3 | Nơi sinh | **mới** | `placeOfBirth` |
| 4 | SĐT | có sẵn | `phone` |
| 5 | CCCD (Số – Ngày cấp – Nơi cấp) | một phần | `idNumber` (có) + `idIssueDate` **mới** + `idIssuePlace` **mới** |
| 6 | Email cá nhân | **mới** | `personalEmail` (tách khỏi email đăng nhập) |
| 7 | Ngày bắt đầu làm việc | có sẵn | `joinDate` |
| 8 | Chức vụ | có sẵn | `position` |
| 9 | Địa chỉ thường trú | **mới** | `permanentAddress` |
| 10 | Địa chỉ tạm trú | **mới** | `currentAddress` |
| 11 | Trình độ học vấn (Chuyên ngành) | **mới** | `education` |
| 12 | Tình trạng hôn nhân | **mới** | `maritalStatus` (enum) |
| 13 | Liên hệ khẩn cấp (Tên – MQH – SĐT) | **mới** | `emergencyContactName` / `emergencyContactRelationship` / `emergencyContactPhone` |
| 14 | Số TK ngân hàng | **mới** | `bankAccountNumber` |
| 15 | Tên ngân hàng – CN | **mới** | `bankName` + `bankBranch` |
| 16 | Mã số thuế | **mới** | `taxCode` |
| 17 | NPT thuế (Số NPT – MQH) | một phần | `dependentsCount` (có) — số NPT giữ nguyên |
| 18 | Mã số BHXH | **mới** | `socialInsuranceNumber` |
| 19 | Nơi đăng ký KCB | **mới** | `healthcareFacility` |
| 20 | Đăng ký xe máy (Loại – Màu – Biển số) | **mới** | `motorbikeRegistration` (1 ô text) |

**Enum mới:** `MaritalStatus = SINGLE | MARRIED | DIVORCED | WIDOWED | OTHER`.

## Section Grouping (Detail + Form)

1. **Personal Information** (mở rộng): + nơi sinh, ngày/nơi cấp CCCD, email cá nhân, học vấn,
   tình trạng hôn nhân, địa chỉ thường trú, địa chỉ tạm trú.
2. **Work Information** (giữ nguyên).
3. **Emergency Contact** (mới): tên, mối quan hệ, SĐT.
4. **Banking** (mới): số TK, tên ngân hàng, chi nhánh.
5. **Tax & Insurance** (mới): MST, mã BHXH, nơi đăng ký KCB. (dependentsCount vẫn ở Personal.)
6. **Other** (mới): đăng ký xe máy.

## Acceptance

- Tạo nhân viên mới với đủ trường mới → GET detail trả lại đúng giá trị đã nhập.
- Sửa nhân viên: đổi `maritalStatus`, `personalEmail`, `bankAccountNumber`, `permanentAddress`
  → lưu & hiển thị lại đúng trên màn Detail.
- Tất cả trường mới optional (nullable) — bỏ trống vẫn tạo/sửa được.
- i18n đầy đủ vi + en; không có chuỗi hardcode.
- Validator strip field lạ → mọi field mới phải khai báo ở create/update schema.
