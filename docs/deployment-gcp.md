# Deploy HRM lên Google Cloud

> Kiến trúc: **Cloud Run** (chỉ `hrm-api`) · **Cloud SQL** (PostgreSQL 16) · **Cloud Tasks** (hàng đợi job) · **Cloud Scheduler** (cron quét nhắc việc) · **Cloud Storage** (CV) · **Secret Manager** · **Firebase Hosting** (web SPA, rewrite `/api/**` → Cloud Run).
>
> Không còn Memorystore (Redis), không còn Serverless VPC connector, không còn service `hrm-worker` riêng. Job chạy trong chính `hrm-api` qua route nội bộ `/internal/tasks/*` do Cloud Tasks đẩy tới. `hrm-api` scale-to-zero giữa các job.

```
Browser ─► Firebase Hosting (SPA + rewrite /api/**) ─► Cloud Run: hrm-api ─┬─► Cloud SQL (unix socket)
Cloud Tasks ──(POST /internal/tasks/<job> + X-Tasks-Secret)──────────────► │   ├─► Cloud Storage (CV, Workload Identity)
Cloud Scheduler ──(daily POST /internal/tasks/reminder-scan)─────────────► │   └─► Secret Manager
```

Các file hạ tầng trong repo:
- [apps/api/Dockerfile](../apps/api/Dockerfile) — image cho `hrm-api`
- [apps/api/src/infrastructure/tasks/](../apps/api/src/infrastructure/tasks/) — dispatcher + driver Cloud Tasks/inline
- [firebase.json](../firebase.json) + [.firebaserc](../.firebaserc) — hosting web + rewrite API
- [cloudbuild.yaml](../cloudbuild.yaml) — CI/CD: build → migrate → deploy api → build & deploy web

> Chi phí ước tính ≈ **$43/tháng** (Cloud SQL `db-g1-small` + Cloud Run scale-to-zero + Cloud Tasks + Scheduler + Firebase Hosting + GCS + Secret Manager). Cloud Tasks: 1 triệu thao tác/tháng miễn phí (thừa cho ~100 nhân viên).

---

## 0. Biến & bật API

```bash
export PROJECT_ID=gen-lang-client-0828439003
export REGION=asia-southeast1
export REPO=hrm
gcloud config set project $PROJECT_ID

gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com sqladmin.googleapis.com \
  cloudtasks.googleapis.com cloudscheduler.googleapis.com \
  secretmanager.googleapis.com storage.googleapis.com \
  compute.googleapis.com firebasehosting.googleapis.com
```

## 1. Artifact Registry

```bash
gcloud artifacts repositories create $REPO --repository-format=docker --location=$REGION
```

## 2. Cloud SQL (PostgreSQL 16)

```bash
gcloud sql instances create hrm-pg \
  --database-version=POSTGRES_16 --tier=db-g1-small \
  --region=$REGION --storage-auto-increase
gcloud sql databases create hrm --instance=hrm-pg
gcloud sql users create hrm_app --instance=hrm-pg --password='<STRONG_PW>'
```

`DATABASE_URL` (qua Unix socket của Cloud Run — connection name = `PROJECT:REGION:hrm-pg`):

```
postgresql://hrm_app:<STRONG_PW>@localhost/hrm?host=/cloudsql/gen-lang-client-0828439003:asia-southeast1:hrm-pg&schema=public
```

## 3. Cloud Tasks (hàng đợi job)

Mỗi job là một queue riêng. Tên queue = `hrm-<task>` (khớp `apps/api/src/infrastructure/tasks/task-names.ts`).

```bash
for Q in cv-parse employee-import employee-invite reminder-email reminder-scan; do
  gcloud tasks queues create hrm-$Q --location=$REGION
done

# Retry policy: cv-parse 2 lần (API trả phí), còn lại 3 lần, backoff luỹ thừa.
gcloud tasks queues update hrm-cv-parse --location=$REGION \
  --max-attempts=2 --min-backoff=2s --max-backoff=60s
for Q in employee-import employee-invite reminder-email reminder-scan; do
  gcloud tasks queues update hrm-$Q --location=$REGION \
    --max-attempts=3 --min-backoff=2s --max-backoff=60s
done
```

## 4. Cloud Storage (CV)

```bash
gcloud storage buckets create gs://hrm-cv-$PROJECT_ID --location=$REGION --uniform-bucket-level-access
```

Cấp quyền cho **service account runtime của Cloud Run** (mặc định `PROJECT_NUMBER-compute@developer.gserviceaccount.com`):

```bash
RUNTIME_SA=$(gcloud iam service-accounts list --filter='compute@' --format='value(email)')
gcloud storage buckets add-iam-policy-binding gs://hrm-cv-$PROJECT_ID \
  --member=serviceAccount:$RUNTIME_SA --role=roles/storage.objectAdmin
```

> Driver GCS dùng **Application Default Credentials / Workload Identity** — không cần key tĩnh.

## 5. Secret Manager

```bash
printf '%s' '<random-strong-jwt-secret>'  | gcloud secrets create JWT_SECRET --data-file=-
printf '%s' '<DATABASE_URL ở bước 2>'      | gcloud secrets create DATABASE_URL --data-file=-
printf '%s' '<resend-api-key>'             | gcloud secrets create RESEND_API_KEY --data-file=-
printf '%s' '<anthropic-api-key>'          | gcloud secrets create ANTHROPIC_API_KEY --data-file=-
printf '%s' '<google-oauth-client-id>'     | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-
printf '%s' '<google-oauth-client-secret>' | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-
# Bí mật dùng chung bảo vệ /internal/tasks/* (Cloud Tasks + Scheduler gắn header X-Tasks-Secret):
openssl rand -hex 32 | tr -d '\n'          | gcloud secrets create TASKS_SECRET --data-file=-
```

Cấp quyền đọc secret cho runtime SA:

```bash
for S in JWT_SECRET DATABASE_URL RESEND_API_KEY ANTHROPIC_API_KEY GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET TASKS_SECRET; do
  gcloud secrets add-iam-policy-binding $S \
    --member=serviceAccount:$RUNTIME_SA --role=roles/secretmanager.secretAccessor
done
```

> `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID/SECRET` có thể để giá trị rỗng lúc đầu — app degrade gracefully (email log thay vì gửi, CV parsing tắt, SSO báo "not configured"). Lõi HRM (đăng nhập, nhân viên, chấm công, lương) vẫn chạy.

## 6. Quyền cho Cloud Build SA

```bash
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
CB_SA=$PROJECT_NUMBER@cloudbuild.gserviceaccount.com
for ROLE in run.admin iam.serviceAccountUser artifactregistry.writer \
            cloudsql.client secretmanager.secretAccessor firebasehosting.admin; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member=serviceAccount:$CB_SA --role=roles/$ROLE
done
```

## 7. Chạy pipeline (deploy 2 pha)

`APP_INTERNAL_URL` phải bằng URL Cloud Run của `hrm-api` (nơi Cloud Tasks POST tới). Lần đầu chưa có URL nên chạy 2 pha:

```bash
# Pha 1 — tạo service hrm-api:
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_GCS_BUCKET=hrm-cv-$PROJECT_ID,_WEB_URL=https://hrm.codecrush.asia

# Lấy URL service rồi chạy lại để bơm APP_INTERNAL_URL (Cloud Tasks mới gọi được /internal/tasks/*):
API_URL=$(gcloud run services describe hrm-api --region=$REGION --format='value(status.url)')
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_GCS_BUCKET=hrm-cv-$PROJECT_ID,_WEB_URL=https://hrm.codecrush.asia,_API_URL=$API_URL
```

> Trong pha 1, các lần enqueue job sẽ lỗi (chưa có `APP_INTERNAL_URL`) — chấp nhận được khi bring-up. Sau pha 2 mọi job chạy bình thường.

Pipeline tự động: build image → `prisma migrate deploy` (Cloud Run job) → deploy `hrm-api` → build web (`VITE_API_URL=/api/v1`) → deploy Firebase Hosting.

> **Seed lần đầu** (chỉ chạy 1 lần, KHÔNG đưa vào pipeline):
> ```bash
> gcloud run jobs deploy hrm-seed \
>   --image=$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/api:latest --region=$REGION \
>   --set-cloudsql-instances=$PROJECT_ID:$REGION:hrm-pg \
>   --set-secrets=DATABASE_URL=DATABASE_URL:latest \
>   --command=pnpm --args=--filter,@hrm/api,db:seed --execute-now --wait
> ```

## 8. Cloud Scheduler (cron quét nhắc việc hằng ngày)

Thay cho repeatable job của BullMQ. Lịch & timezone khớp `REMINDER_SCAN_CRON='0 7 * * *'` / `REMINDER_SCAN_TZ='Asia/Ho_Chi_Minh'` trong `apps/api/src/shared/configs/email.config.ts`.

```bash
API_URL=$(gcloud run services describe hrm-api --region=$REGION --format='value(status.url)')
SECRET=$(gcloud secrets versions access latest --secret=TASKS_SECRET)
gcloud scheduler jobs create http hrm-reminder-scan \
  --location=$REGION --schedule='0 7 * * *' --time-zone='Asia/Ho_Chi_Minh' \
  --uri="$API_URL/internal/tasks/reminder-scan" --http-method=POST \
  --headers="X-Tasks-Secret=$SECRET" --message-body='{}'
```

## 9. Domain & Google OAuth

1. Map custom domain **hrm.codecrush.asia** trong Firebase Hosting (tự cấp SSL). Thêm bản ghi DNS trong managed zone `codecrush-asia` (project `gen-lang-client-0828439003`) theo hướng dẫn Firebase.
2. Google Cloud Console → **APIs & Services → Credentials → OAuth Client**: thêm Authorized redirect URI **khớp tuyệt đối**:
   `https://hrm.codecrush.asia/api/v1/auth/google/callback`
3. Đảm bảo `_WEB_URL` trong substitution = domain thật (đã set `CORS_ORIGIN`, `APP_WEB_URL`, các `GOOGLE_*_REDIRECT`).

---

## Biến môi trường production (đầy đủ)

| Biến | Nguồn | Ghi chú |
|---|---|---|
| `NODE_ENV=production` | env | |
| `PORT` | Cloud Run inject | |
| `TRUST_PROXY=1` | env | rate-limit theo IP thật sau proxy |
| `DATABASE_URL` | secret | api, migrate, seed |
| `JWT_SECRET` | secret | |
| `JWT_ACCESS_EXPIRES_IN=15m` / `JWT_REFRESH_EXPIRES_IN=7d` | env | |
| `CORS_ORIGIN` = `_WEB_URL` | env | |
| `APP_WEB_URL` = `_WEB_URL` | env | |
| `STORAGE_DRIVER=gcs` · `GCS_BUCKET` | env | |
| `RESEND_API_KEY` · `EMAIL_FROM` | secret/env | |
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` | secret | |
| `GOOGLE_REDIRECT_URI` · `GOOGLE_SUCCESS_REDIRECT` · `GOOGLE_FAILURE_REDIRECT` | env | |
| `ANTHROPIC_API_KEY` | secret | CV parsing |
| `RATE_LIMIT_DISABLED=false` | env | |
| `TASKS_DRIVER=cloud` | env | dùng driver Cloud Tasks (mặc định `inline` cho dev/test) |
| `TASKS_PROJECT` = `$PROJECT_ID` | env | |
| `TASKS_LOCATION` = `$REGION` | env | vùng của các queue Cloud Tasks |
| `APP_INTERNAL_URL` = URL Cloud Run của hrm-api | env | đích Cloud Tasks POST tới |
| `TASKS_SECRET` | secret | xác thực `/internal/tasks/*` |
| Web build: `VITE_API_URL=/api/v1` | build arg | |

## Vận hành & lưu ý

- **Không còn worker always-on**: job chạy trong `hrm-api` khi Cloud Tasks gọi tới. Service scale-to-zero giữa các job. Đặt `--timeout=900` (đã có trong cloudbuild) cho job CV-parse dài (gọi Anthropic).
- **Retry** do Cloud Tasks quản lý theo cấu hình queue (bước 3). Handler trả 5xx → Cloud Tasks retry; 2xx → xong.
- **Cron** do Cloud Scheduler kích hoạt (bước 8); scan đồng thời dọn các dòng `import_staging` đã hết hạn.
- **Migration**: luôn `prisma migrate deploy` (job), không bao giờ `migrate dev` trên prod.
- **EMAIL_FROM** phải là domain đã verify ở Resend (không dùng `onboarding@resend.dev`).
- **Phân quyền cache**: dùng cache TTL 60s trong tiến trình (không Redis) — thay đổi vai trò mất tối đa ~60s để lan giữa các instance. Chấp nhận được cho HRM.
- **Staging import** lưu ở bảng Postgres `import_staging` (TTL 30 phút, dọn bởi cron). Trạng thái job import lưu ở bảng `import_job`.

## Chạy thử Docker local

```bash
docker build -f apps/api/Dockerfile -t hrm-api:test .
docker run --rm -p 8088:8080 -e PORT=8080 -e JWT_SECRET=x \
  -e DATABASE_URL=postgresql://x:x@localhost/x -e TASKS_DRIVER=inline hrm-api:test
curl localhost:8088/health   # {"status":"ok",...}
```
