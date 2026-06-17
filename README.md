# Timeoff — backend (GCP deployment)

This is the server the React prototype needs in order to become a real, multi-user HRIS.
It is a **starting scaffold**: the security-critical parts (password hashing, JWT, RBAC,
approval routing, balance math) are implemented and mirror the prototype's behaviour, but
it has **not been run end-to-end here** — treat it as code to review, test, and harden, not
a finished product.

> **Want a free setup?** See `DEPLOY-FREE.md` to run this entirely on free tiers
> (Supabase + Render + Netlify) instead of the paid Google Cloud path below.

## Architecture (Google Cloud)

```
                          ┌─────────────────────────────┐
   Browser (React SPA) ── │  Cloud Run  (this Node API) │
   served from Cloud      │   - JWT auth, bcrypt        │
   Storage + CDN, or      │   - approval routing        │
   Firebase Hosting       │   - balance computation     │
                          └──────────┬─────────┬────────┘
                                     │         │
                        ┌────────────▼──┐   ┌──▼───────────────┐
                        │ Cloud SQL     │   │ Cloud Storage    │
                        │ (PostgreSQL)  │   │ (attachments)    │
                        └───────────────┘   └──────────────────┘
                                     ▲
                        ┌────────────┴──┐   ┌──────────────────┐
                        │ Secret Manager│   │ Email (SendGrid/ │
                        │ (JWT, DB pw)  │   │  Workspace SMTP) │
                        └───────────────┘   └──────────────────┘
```

- **Cloud Run** runs this container; scales to zero, cheap for internal tools.
- **Cloud SQL (PostgreSQL)** is the system of record (`schema.sql`).
- **Cloud Storage** holds leave attachments; the API hands out short-lived signed URLs.
- **Secret Manager** holds the DB password and JWT signing key (never in env files in git).
- **Email** is abstracted in `src/mailer.js` — wire it to SendGrid or your Workspace SMTP.

## What maps from the prototype

| Prototype (in-memory)            | Here (persistent)                         |
|----------------------------------|-------------------------------------------|
| `INITIAL_PEOPLE`                 | `employees` table                         |
| client-side password check       | bcrypt hash + JWT, forced first-login reset |
| `requests` array                 | `leave_requests` + `request_approvals`    |
| `entitlements` map               | `entitlements` table (incl. carryover)    |
| `holidays` state                 | `holidays` table                          |
| base64 attachments               | Cloud Storage objects + signed URLs       |
| notifications array              | emitted via `mailer.js` (email)           |

## Run locally

```bash
cp .env.example .env          # fill in values
createdb timeoff              # or use docker postgres
psql timeoff -f schema.sql
psql timeoff -f seed.sql      # demo org + leave types + holidays
npm install
npm run dev                   # http://localhost:8080
```

The seed creates the same demo people. Their temp passwords follow your scheme
`{first}{3 digits}Akasia365mc` and are printed by `seed.sql` comments / `npm run seed:print`.

## Deploy to Google Cloud

```bash
PROJECT=your-project; REGION=asia-southeast1

# 1. Cloud SQL (PostgreSQL)
gcloud sql instances create timeoff-db --database-version=POSTGRES_15 \
  --tier=db-g1-small --region=$REGION
gcloud sql databases create timeoff --instance=timeoff-db
gcloud sql users create app --instance=timeoff-db --password='<choose>'
# load schema: connect via Cloud SQL Auth Proxy, then psql -f schema.sql / seed.sql

# 2. Secrets
echo -n '<db-password>'  | gcloud secrets create DB_PASSWORD --data-file=-
openssl rand -hex 32 | gcloud secrets create JWT_SECRET --data-file=-

# 3. Attachment bucket
gsutil mb -l $REGION gs://$PROJECT-timeoff-attachments

# 4. Build + deploy the container
gcloud builds submit --tag gcr.io/$PROJECT/timeoff-api
gcloud run deploy timeoff-api \
  --image gcr.io/$PROJECT/timeoff-api --region $REGION \
  --add-cloudsql-instances $PROJECT:$REGION:timeoff-db \
  --set-env-vars "DB_NAME=timeoff,DB_USER=app,DB_HOST=/cloudsql/$PROJECT:$REGION:timeoff-db,GCS_BUCKET=$PROJECT-timeoff-attachments" \
  --set-secrets "DB_PASSWORD=DB_PASSWORD:latest,JWT_SECRET=JWT_SECRET:latest" \
  --allow-unauthenticated   # put IAP / your SSO in front for a real internal tool
```

Host the React app on Cloud Storage + Cloud CDN (or Firebase Hosting) and point its
API base URL at the Cloud Run URL.

## Wiring the existing front-end

The prototype keeps everything in React state. To use this API instead, replace the
in-memory handlers with `fetch` calls:

- `LoginScreen` → `POST /auth/login`, store the returned JWT (httpOnly cookie preferred).
- balances/dashboard → `GET /me`
- request form → `POST /requests` (multipart for the attachment)
- approvals → `GET /requests/pending`, `POST /requests/:id/approve|reject`
- withdraw → `POST /requests/:id/cancel`
- HR admin → `/admin/*`
- Excel export → `GET /admin/report.xlsx`

## Security hardening before go-live (do not skip)

- [ ] Force password change on first login (`must_reset_password`); never email permanent passwords.
- [ ] Put the app behind **IAP** or your **Google Workspace SSO/SAML**; add MFA.
- [ ] Rate-limit `/auth/login`; add account lockout/backoff.
- [ ] Store JWT in an httpOnly, Secure, SameSite cookie — not localStorage.
- [ ] Validate and virus-scan uploaded attachments; restrict types/size.
- [ ] Row-level authorization on **every** endpoint (a manager must not read another team).
- [ ] Audit log for all approvals, entitlement edits, and employee add/delete (table included).
- [ ] Backups + PITR on Cloud SQL; least-privilege IAM; VPC connector if you lock egress.
- [ ] This is real employee data — confirm your data-protection/retention obligations.

## Rough monthly cost (small org, internal use)

Cloud Run (scale-to-zero) a few USD · Cloud SQL `db-g1-small` ~USD 25–35 ·
Cloud Storage + Secret Manager negligible. Ballpark **~USD 30–50/mo**, dominated by Cloud SQL.
