# HRM — Runbook deploy lên Google Cloud (từ số 0 → auto-deploy)

> Mục tiêu: triển khai HRM lên GCP với **cấu hình rẻ nhất** cho gói trial 90 ngày, web chạy ở URL miễn phí `https://<PROJECT_ID>.web.app`, rồi bật **tự động deploy mỗi khi merge PR vào `main`** của repo `dinhhanh263/HRM`.
>
> Làm tuần tự A → B → C → D. Phần A–C chỉ làm **một lần**. Sau phần D, mỗi lần merge là tự deploy.
>
> 💰 Ước tính: ~$65–70/tháng (~$200/90 ngày) — trong $300 credit. Tốn nhất là Redis + Cloud SQL (tính theo giờ).

---
## dinhhanh note
> ⚠️ KHÔNG ghi giá trị key/secret thật vào file này (file nằm trong repo, dễ lộ khi commit).
> Các secret đã được lưu an toàn trong Google Secret Manager:
> RESEND_API_KEY · ANTHROPIC_API_KEY · GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET · JWT_SECRET · DATABASE_URL
> Xem danh sách: `gcloud secrets list`. Đọc 1 giá trị (khi cần): `gcloud secrets versions access latest --secret=<TÊN>`

## PHẦN A — Chuẩn bị tài khoản (một lần)

### A1. Google Cloud
1. Vào https://console.cloud.google.com → đăng nhập Google → kích hoạt **gói Free Trial $300** (đã làm).
2. Cài Google Cloud CLI nếu chưa có: https://cloud.google.com/sdk/docs/install
3. Đăng nhập CLI:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

### A2. Tạo project + gắn billing
```bash
export PROJECT_ID=hrm-prod-263     # ĐỔI thành ID độc nhất của bạn
export REGION=asia-southeast1       # Singapore — gần VN
export REPO=hrm

gcloud projects create $PROJECT_ID
gcloud config set project $PROJECT_ID

gcloud billing accounts list        # copy ACCOUNT_ID (XXXXXX-XXXXXX-XXXXXX)
gcloud billing projects link $PROJECT_ID --billing-account=0185EE-B574FF-802A2A
```
> Đặt cảnh báo ngân sách: Console → Billing → **Budgets & alerts** → tạo budget $250, alert 50/90/100%.

### A3. GitHub
- Đảm bảo source code (kèm `cloudbuild.yaml`, `apps/`, `packages/`...) nằm trên nhánh **`main`** của repo **`dinhhanh263/HRM`**.
- Bạn cần **quyền admin** repo này (để cài Cloud Build GitHub App ở phần D).

---

## PHẦN B — Tạo hạ tầng GCP (một lần, cấu hình rẻ)

> Giữ nguyên `$PROJECT_ID`, `$REGION`, `$REPO` trong terminal cho mọi lệnh dưới.

### B1. Bật API
```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com sqladmin.googleapis.com redis.googleapis.com \
  vpcaccess.googleapis.com secretmanager.googleapis.com storage.googleapis.com \
  compute.googleapis.com firebasehosting.googleapis.com
```

### B2. Artifact Registry (lưu Docker image)
```bash
gcloud artifacts repositories create $REPO --repository-format=docker --location=$REGION
```

### B3. Cloud SQL PostgreSQL 16 — gói rẻ nhất
```bash
gcloud sql instances create hrm-pg \
  --database-version=POSTGRES_16 --edition=enterprise --tier=db-f1-micro \
  --region=$REGION --storage-size=10 --storage-type=HDD \
  --no-storage-auto-increase --availability-type=zonal
gcloud sql databases create hrm --instance=hrm-pg
gcloud sql users create hrm_app --instance=hrm-pg --password='<DAT_MAT_KHAU_MANH>'
```

### B4. Memorystore Redis — Basic 1GB
```bash
gcloud redis instances create hrm-redis --size=1 --region=$REGION \
  --tier=basic --redis-version=redis_7_0

# Lấy IP nội bộ Redis — GHI LẠI, dùng ở phần C & D: 10.85.43.251
gcloud redis instances describe hrm-redis --region=$REGION --format='value(host)'
```

### B5. VPC Connector (Cloud Run ↔ Redis/SQL nội bộ)
```bash
gcloud compute networks vpc-access connectors create hrm-vpc \
  --region=$REGION --range=10.8.0.0/28
```

### B6. Bucket lưu CV
```bash
gcloud storage buckets create gs://hrm-cv-$PROJECT_ID \
  --location=$REGION --uniform-bucket-level-access
```

### B7. Secrets + phân quyền IAM
```bash
# JWT secret tự sinh
openssl rand -base64 48 | tr -d '\n' | gcloud secrets create JWT_SECRET --data-file=-

# DATABASE_URL (khớp mật khẩu ở B3)
# ⚠️ BẮT BUỘC: (1) đã export PROJECT_ID/REGION ở terminal này; (2) URL-encode ký tự đặc biệt
#    trong mật khẩu: @ → %40, # → %23, / → %2F, : → %3A. VD: pass "abc@12" → "abc%4012".
printf '%s' "postgresql://hrm_app:<MAT_KHAU_URL_ENCODED>@localhost/hrm?host=/cloudsql/$PROJECT_ID:$REGION:hrm-pg&schema=public" \
  | gcloud secrets create DATABASE_URL --data-file=-

# API keys CỦA BẠN — dán trực tiếp vào terminal (TUYỆT ĐỐI KHÔNG ghi key thật vào file này)
printf '%s' '<RESEND_API_KEY>'             | gcloud secrets create RESEND_API_KEY --data-file=-
printf '%s' '<ANTHROPIC_API_KEY>'          | gcloud secrets create ANTHROPIC_API_KEY --data-file=-
printf '%s' '<GOOGLE_OAUTH_CLIENT_ID>'     | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-
printf '%s' '<GOOGLE_OAUTH_CLIENT_SECRET>' | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-

# Quyền cho service account runtime (compute default)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
RUNTIME_SA=$PROJECT_NUMBER-compute@developer.gserviceaccount.com
for S in JWT_SECRET DATABASE_URL RESEND_API_KEY ANTHROPIC_API_KEY GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  gcloud secrets add-iam-policy-binding $S --member=serviceAccount:$RUNTIME_SA \
    --role=roles/secretmanager.secretAccessor
done
gcloud storage buckets add-iam-policy-binding gs://hrm-cv-$PROJECT_ID \
  --member=serviceAccount:$RUNTIME_SA --role=roles/storage.objectAdmin

# Quyền cho Cloud Build SA (để build + deploy)
CB_SA=$PROJECT_NUMBER@cloudbuild.gserviceaccount.com
for ROLE in run.admin iam.serviceAccountUser artifactregistry.writer \
            cloudsql.client secretmanager.secretAccessor firebasehosting.admin; do
  gcloud projects add-iam-policy-binding $PROJECT_ID --member=serviceAccount:$CB_SA --role=roles/$ROLE
done
```

### B8. Kích hoạt Firebase Hosting
```bash
firebase login                              # mở trình duyệt
firebase projects:addfirebase $PROJECT_ID   # gắn Firebase + tạo site $PROJECT_ID.web.app
```

---

## PHẦN C — Deploy lần đầu (thủ công, kiểm chứng pipeline)

> Chạy từ thư mục gốc repo (nơi có `cloudbuild.yaml`). Thay `<REDIS_IP>` bằng IP ở B4.

### C1. Chạy pipeline
```bash
cd /Users/dev/Projects/HRM && export PROJECT_ID=hrm-prod-263 REGION=asia-southeast1 REPO=hrm && gcloud builds submit --config cloudbuild.yaml --substitutions=_GCS_BUCKET=hrm-cv-$PROJECT_ID,_REDIS_IP=10.85.43.251,_WEB_URL=https://$PROJECT_ID.web.app
```
→ build image → `prisma migrate deploy` → deploy `hrm-api` + `hrm-worker` → build & deploy web.

### C2. Seed dữ liệu ban đầu (chỉ 1 lần)
```bash
gcloud run jobs deploy hrm-seed \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/api:latest --region=$REGION \
  --set-cloudsql-instances=$PROJECT_ID:$REGION:hrm-pg --vpc-connector=hrm-vpc \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest \
  --command=pnpm --args=--filter,@hrm/api,db:seed --execute-now --wait
```

### C3. Cấu hình Google OAuth redirect
Trong Google Cloud Console → **APIs & Services → Credentials → OAuth Client** của bạn, thêm vào **Authorized redirect URIs** (khớp tuyệt đối):
```
https://<PROJECT_ID>.web.app/api/v1/auth/google/callback
```

### C4. Truy cập & test
- Web: `https://<PROJECT_ID>.web.app`
- Health API: `https://<PROJECT_ID>.web.app/api/v1/health` (hoặc `/health`)
- Đăng nhập bằng tài khoản seed (xem `apps/api/prisma/seed.ts`).

---

## PHẦN D — Bật auto-deploy từ GitHub (một lần)

### D1. Nối repo với Cloud Build (trên trình duyệt)
1. https://console.cloud.google.com/cloud-build/triggers (đúng project).
2. **Connect Repository** → **GitHub (Cloud Build GitHub App)** → Authenticate.
3. **Install** app vào `dinhhanh263` → chọn repo **`HRM`** → **Connect**.

### D2. Tạo trigger trên nhánh `main`
```bash
gcloud builds triggers create github \
  --name=hrm-deploy-main \
  --repo-owner=dinhhanh263 --repo-name=HRM \
  --branch-pattern='^main$' \
  --build-config=cloudbuild.yaml \
  --substitutions=_GCS_BUCKET=hrm-cv-$PROJECT_ID,_REDIS_IP=<REDIS_IP>,_WEB_URL=https://$PROJECT_ID.web.app
```
- Chỉ chạy khi **push lên `main`** (= merge PR). PR mở/sửa không trigger.
- `$SHORT_SHA`, `$PROJECT_ID` được Cloud Build tự điền.

### D3. Kiểm thử
Merge một PR vào `main` → xem build tại https://console.cloud.google.com/cloud-build/builds → vài phút sau web cập nhật.

### Luồng làm việc sau khi xong
```
nhánh feature → PR → review → Merge vào main → (push main) → Cloud Build tự deploy ✅
```

---

## PHẦN E — Vận hành & dọn dẹp

- **Rollback**: Cloud Run → service → tab **Revisions** → chuyển traffic về revision cũ.
- **Deploy lại thủ công**: Cloud Build → Triggers → `hrm-deploy-main` → **Run**.
- **Xem log API**: Cloud Run → `hrm-api` → **Logs**.
- **Tiết kiệm khi ngừng test** (Redis + SQL tính tiền theo giờ):
  ```bash
  gcloud redis instances delete hrm-redis --region=$REGION
  gcloud sql instances delete hrm-pg
  ```
  Hoặc xóa hẳn project: `gcloud projects delete $PROJECT_ID`
- **Bật lại**: tạo lại Redis/SQL (B3–B4), cập nhật `_REDIS_IP` trong trigger (D2), chạy lại migrate/seed.

---

## Checklist nhanh
- [ ] A: login gcloud, tạo project, gắn billing, budget alert
- [ ] B1–B8: enable API, Artifact Registry, Cloud SQL, Redis, VPC, bucket, secrets+IAM, Firebase
- [ ] C1–C4: deploy thủ công, seed, OAuth redirect, test `*.web.app`
- [ ] D1–D3: connect repo, tạo trigger `^main$`, test merge
- [ ] E: biết cách rollback + xóa Redis/SQL khi ngừng test
