---
name: start
description: Start toàn bộ môi trường localhost (Docker DB + Redis, API, Web)
---

# /start — Khởi động đầy đủ môi trường dev

Khởi động **tất cả** thành phần localhost theo đúng thứ tự. Không được bỏ sót DB/Redis.

## Thứ tự bắt buộc

1. **Docker daemon** — nếu chưa chạy: `open -a Docker`, đợi tới khi `docker info` thành công.
2. **Postgres + Redis** — `cd docker && docker compose up -d`, xác nhận:
   - Postgres: port 5432 (container `hrm-postgres`)
   - Redis: port 6379 (container `hrm-redis`)
3. **API** — dùng `preview_start` với name `api` (port 5000, từ `.claude/launch.json`).
   ⚠️ Phải start SAU khi DB/Redis đã lên — nếu API đã lỡ chạy trước đó, restart lại.
4. **Web** — dùng `preview_start` với name `web` (port 5173).

## Verify trước khi báo xong

- `curl http://localhost:5000/health` → `{"status":"ok"}`
- Web mở được http://localhost:5173

## Báo cáo

Liệt kê trạng thái 4 thành phần (Postgres, Redis, API, Web) + URL web + nhắc tài khoản seed:
- HR: `hr@codecrush.asia` / `Hr@12345` (tenant `codecrush`)
- Admin: `admin@codecrush.asia` / `Admin@123`
