# Deploy HRM lên Google Cloud

> Kiến trúc: **Cloud Run** (API + Worker) · **Cloud SQL** (PostgreSQL 16) · **Memorystore** (Redis) · **Cloud Storage** (CV) · **Secret Manager** · **Firebase Hosting** (web SPA, rewrite `/api/**` → Cloud Run).

```
Browser ─► Firebase Hosting (SPA + rewrite /api/** ) ─► Cloud Run: hrm-api ─┬─► Cloud SQL (VPC/socket)
                                                         Cloud Run: hrm-worker ─┼─► Memorystore Redis (VPC)
                                                         (min=1, no-cpu-throttle) ├─► Cloud Storage (CV, Workload Identity)
                                                                                  └─► Secret Manager
```

Các file hạ tầng đã có trong repo:
- [apps/api/Dockerfile](../apps/api/Dockerfile) + [.dockerignore](../.dockerignore) — image dùng chung cho api & worker
- [apps/api/src/worker.ts](../apps/api/src/worker.ts) — process chạy BullMQ + daily scan (tách khỏi HTTP)
- [firebase.json](../firebase.json) + [.firebaserc](../.firebaserc) — hosting web + rewrite API
- [cloudbuild.yaml](../cloudbuild.yaml) — CI/CD: build → migrate → deploy api/worker → build & deploy web

---

## 0. Biến & bật API

```bash
export PROJECT_ID=hrm-prod
export REGION=asia-southeast1
export REPO=hrm
gcloud config set project $PROJECT_ID

gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com sqladmin.googleapis.com redis.googleapis.com \
  vpcaccess.googleapis.com secretmanager.googleapis.com storage.googleapis.com \
  compute.googleapis.com firebasehosting.googleapis.com
```

## 1. Artifact Registry

```bash
gcloud artifacts repositories create $REPO --repository-format=docker --location=$REGION
```

## 2. Cloud SQL (PostgreSQL 16)

```bash
gcloud sql instances create hrm-pg \
  --database-version=POSTGRES_16 --tier=db-custom-1-3840 \
  --region=$REGION --storage-auto-increase
gcloud sql databases create hrm --instance=hrm-pg
gcloud sql users create hrm_app --instance=hrm-pg --password='<STRONG_PW>'
```

`DATABASE_URL` (qua Unix socket của Cloud Run — connection name = `PROJECT:REGION:hrm-pg`):

```
postgresql://hrm_app:<STRONG_PW>@localhost/hrm?host=/cloudsql/hrm-prod:asia-southeast1:hrm-pg&schema=public
```

## 3. Memorystore Redis + VPC Connector

```bash
gcloud redis instances create hrm-redis --size=1 --region=$REGION --redis-version=redis_7_0
gcloud redis instances describe hrm-redis --region=$REGION --format='value(host)'   # → _REDIS_IP

gcloud compute networks vpc-access connectors create hrm-vpc \
  --region=$REGION --range=10.8.0.0/28
```

## 4. Cloud Storage (CV)

```bash
gcloud storage buckets create gs://hrm-cv-$PROJECT_ID --location=$REGION --uniform-bucket-level-access
```

Cấp quyền cho **service account runtime của Cloud Run** (mặc định `PROJECT_NUMBER-compute@developer.gserviceaccount.com`, nên tạo SA riêng cho production):

```bash
RUNTIME_SA=$(gcloud iam service-accounts list --filter='compute@' --format='value(email)')
gcloud storage buckets add-iam-policy-binding gs://hrm-cv-$PROJECT_ID \
  --member=serviceAccount:$RUNTIME_SA --role=roles/storage.objectAdmin
```

> Driver GCS dùng **Application Default Credentials / Workload Identity** — không cần key tĩnh.

## 5. Secret Manager

```bash
printf '%s' '<random-strong-jwt-secret>' | gcloud secrets create JWT_SECRET --data-file=-
printf '%s' '<DATABASE_URL ở bước 2>'     | gcloud secrets create DATABASE_URL --data-file=-
printf '%s' '<resend-api-key>'            | gcloud secrets create RESEND_API_KEY --data-file=-
printf '%s' '<anthropic-api-key>'         | gcloud secrets create ANTHROPIC_API_KEY --data-file=-
printf '%s' '<google-oauth-client-id>'    | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-
printf '%s' '<google-oauth-client-secret>'| gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-
```

Cấp quyền đọc secret cho runtime SA:

```bash
for S in JWT_SECRET DATABASE_URL RESEND_API_KEY ANTHROPIC_API_KEY GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  gcloud secrets add-iam-policy-binding $S \
    --member=serviceAccount:$RUNTIME_SA --role=roles/secretmanager.secretAccessor
done
```

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

## 7. Chạy pipeline

`firebase.json` đang trỏ `region: asia-southeast1` và `serviceId: hrm-api` — đổi nếu bạn dùng vùng khác.

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_GCS_BUCKET=hrm-cv-$PROJECT_ID,_REDIS_IP=<REDIS_IP>,_WEB_URL=https://hrm.codecrush.asia
```

Pipeline tự động: build image → `prisma migrate deploy` (Cloud Run job) → deploy `hrm-api` → deploy `hrm-worker` → build web (`VITE_API_URL=/api/v1`) → deploy Firebase Hosting.

> **Seed lần đầu** (chỉ chạy 1 lần, KHÔNG đưa vào pipeline):
> ```bash
> gcloud run jobs deploy hrm-seed \
>   --image=$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/api:latest --region=$REGION \
>   --set-cloudsql-instances=$PROJECT_ID:$REGION:hrm-pg --vpc-connector=hrm-vpc \
>   --set-secrets=DATABASE_URL=DATABASE_URL:latest \
>   --command=pnpm --args=--filter,@hrm/api,db:seed --execute-now --wait
> ```

## 8. Domain & Google OAuth

1. Map custom domain trong Firebase Hosting (tự cấp SSL).
2. Google Cloud Console → **APIs & Services → Credentials → OAuth Client**: thêm Authorized redirect URI **khớp tuyệt đối**:
   `https://hrm.codecrush.asia/api/v1/auth/google/callback`
3. Đảm bảo `_WEB_URL` trong substitution = domain thật (đã set `CORS_ORIGIN`, `APP_WEB_URL`, các `GOOGLE_*_REDIRECT`).

---

## Biến môi trường production (đầy đủ)

| Biến | Nguồn | Service |
|---|---|---|
| `NODE_ENV=production` | env | api, worker |
| `PORT` | Cloud Run inject | api, worker |
| `TRUST_PROXY=1` | env | api (rate-limit theo IP thật sau proxy) |
| `DATABASE_URL` | secret | api, worker, migrate, seed |
| `REDIS_URL=redis://<IP>:6379` | env | api, worker |
| `JWT_SECRET` | secret | api |
| `JWT_ACCESS_EXPIRES_IN=15m` / `JWT_REFRESH_EXPIRES_IN=7d` | env | api |
| `CORS_ORIGIN` = `_WEB_URL` | env | api |
| `APP_WEB_URL` = `_WEB_URL` | env | api, worker |
| `STORAGE_DRIVER=gcs` · `GCS_BUCKET` | env | api, worker |
| `RESEND_API_KEY` · `EMAIL_FROM` | secret/env | api, worker |
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` | secret | api |
| `GOOGLE_REDIRECT_URI` · `GOOGLE_SUCCESS_REDIRECT` · `GOOGLE_FAILURE_REDIRECT` | env | api |
| `ANTHROPIC_API_KEY` | secret | api, worker |
| `RATE_LIMIT_DISABLED=false` | env | api |
| Web build: `VITE_API_URL=/api/v1` | build arg | web |

## Vận hành & lưu ý

- **Worker phải luôn bật**: `hrm-worker` deploy với `--min-instances=1 --no-cpu-throttling` để BullMQ tiêu thụ job và daily reminder scan (cron nội bộ) chạy đều — nếu để scale-to-zero/throttle thì queue sẽ kẹt.
- **Migration**: luôn `prisma migrate deploy` (job), không bao giờ chạy `migrate dev` trên prod.
- **EMAIL_FROM** phải là domain đã verify ở Resend (không dùng `onboarding@resend.dev`).
- **pdfkit** font tiếng Việt (`@expo-google-fonts/be-vietnam-pro`) đã nằm trong deps → có trong image.
- Cân nhắc **Cloud SQL connector qua Private IP** thay vì socket nếu cần hiệu năng cao hơn.

## Chạy thử Docker local (đã verify)

```bash
docker build -f apps/api/Dockerfile -t hrm-api:test .
docker run --rm -p 8088:8080 -e PORT=8080 -e JWT_SECRET=x \
  -e DATABASE_URL=postgresql://x:x@localhost/x -e REDIS_URL=redis://localhost:6379 hrm-api:test
curl localhost:8088/health   # {"status":"ok",...}
```
