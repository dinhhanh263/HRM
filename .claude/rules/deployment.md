# Deployment & Production Ops — HRM

> Tài liệu vận hành production. Mọi thao tác chạm tới hạ tầng/DB production PHẢI đọc file này trước. Thông tin đã được xác minh trực tiếp (gcloud + DNS + introspect DB) ngày 2026-06-22.

---

## ⚠️ CÓ HAI DEPLOYMENT — TUYỆT ĐỐI KHÔNG LẪN

### 1. PRODUCTION CÔNG TY (hệ thống thật đang dùng) ← mặc định mọi thao tác prod
| Hạng mục | Giá trị |
|----------|---------|
| **Domain** | **`hrm.codecrush.asia`** (CNAME → `gen-lang-client-0828439003.web.app`, Firebase Hosting) |
| **GCP project** | **`gen-lang-client-0828439003`** · region `asia-southeast1` |
| **Account có quyền** | **`hanhdinh@codecrush.asia`** (gmail `dinhhanh263@gmail.com` KHÔNG có quyền ở project này) |
| **Backend** | Cloud Run `hrm-api` (cùng project còn có `hr-agent`, `cc-website` — không liên quan DB HRM) |
| **DB** | Cloud SQL Postgres 16 instance `hrm-pg`, db `hrm`, user `hrm_app` |
| **Secrets** | Secret Manager (project này): `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `google-client-secret`, `TASKS_SECRET`, … |

### 2. DEPLOY CÁ NHÂN (chỉ để học cách deploy — KHÔNG phải prod công ty)
| Hạng mục | Giá trị |
|----------|---------|
| **Domain** | `hrm-prod-263.web.app` |
| **GCP project** | `hrm-prod-263` · project number `656435233067` |
| **Account có quyền** | `dinhhanh263@gmail.com` |

> Đừng backup/migrate/dọn dữ liệu nhầm sang `hrm-prod-263`. Khi user nói "production" mà không nói rõ → hiểu là **production công ty `gen-lang-client-0828439003`**.

---

## gcloud — bắt buộc

Python hệ thống (3.9) đã bị gcloud bỏ hỗ trợ. Luôn export trước mọi lệnh gcloud:
```bash
export CLOUDSDK_PYTHON=/opt/homebrew/bin/python3.14
```
Chỉ định account rõ ràng để tránh dùng nhầm account đang active:
```bash
gcloud <cmd> --project=gen-lang-client-0828439003 --account=hanhdinh@codecrush.asia
```

---

## Kết nối DB production công ty

cloud-sql-proxy chạy local, lắng nghe `127.0.0.1:5433` → instance prod:
```bash
cloud-sql-proxy --port 5433 gen-lang-client-0828439003:asia-southeast1:hrm-pg
```
Lấy mật khẩu từ Secret Manager (KHÔNG in ra log), rồi psql qua proxy:
```bash
export CLOUDSDK_PYTHON=/opt/homebrew/bin/python3.14
RAW=$(gcloud secrets versions access latest --secret=DATABASE_URL \
  --project=gen-lang-client-0828439003 --account=hanhdinh@codecrush.asia)
export PGPASSWORD=$(printf '%s' "$RAW" | sed -E 's#^postgresql://[^:]+:([^@]+)@.*#\1#')
psql -h 127.0.0.1 -p 5433 -U hrm_app -d hrm   # db=hrm, user=hrm_app
```
(`DATABASE_URL` trong secret dùng socket `host=/cloudsql/...`; chạy local thì đổi sang `127.0.0.1:5433`.)

---

## Quy tắc thao tác production (an toàn nhiều lớp)

1. **Xác minh mục tiêu từ proxy đang chạy** (`ps -o command= -p <pid cloud-sql-proxy>`) — đừng tin project/instance ghi cứng ở bất kỳ tài liệu nào; hạ tầng có thể đổi.
2. **Backup TRƯỚC mọi thao tác phá hủy:**
   ```bash
   gcloud sql backups create --instance=hrm-pg \
     --project=gen-lang-client-0828439003 --account=hanhdinh@codecrush.asia \
     --description="manual backup before <việc> $(date +%Y%m%d-%H%M%S)"
   ```
3. **Lấy schema thật bằng introspect DB**, KHÔNG suy ra từ `schema.prisma` của nhánh git — production có thể có bảng/cột mà nhánh local không có (vd `import_job`, `import_staging`). Migration mới nhất prod tại 2026-06-22: `20260619051530_add_import_staging_and_job`.
4. **Dry-run trước**: chạy script trong transaction rồi `ROLLBACK` để kiểm tra lỗi FK, sau đó mới chạy thật với `COMMIT`.
5. **Luôn bọc trong 1 transaction + `-v ON_ERROR_STOP=1`**, có guard kiểm tra dữ liệu phải-giữ trước khi COMMIT.

---

## Lịch sử thao tác production

- **2026-06-22 — Dọn data seed:** backup ID `1782112975293` (SUCCESSFUL) → chạy `apps/api/prisma/reset-prod.sql`. Giữ lại: `admin@codecrush.asia` (SUPER_ADMIN) + employee của admin, `tenants`/`tenant_domains`, RBAC (`roles`/`permissions`/`role_permissions`), `_prisma_migrations`. Xóa: 26 user/employee seed + toàn bộ bảng cấu hình + bảng giao dịch (vốn đã rỗng). `timesheet_policies`/`payroll_settings` tự seed lại mặc định VN khi truy cập; các config khác (phòng ban, chức vụ, loại nghỉ phép, ngày lễ, pipeline, tiêu chí thử việc) phải tạo lại trong UI Cài đặt.
