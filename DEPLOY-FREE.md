# Deploy for free (Supabase + Render + Netlify)

Runs the whole HRIS on free tiers, no credit card needed for the basics. Good for a
small org / internal tool. (See `README.md` for the paid Google Cloud path.)

| Piece            | Free service        | Free limits (enough for a small org)        |
|------------------|---------------------|---------------------------------------------|
| Database         | **Supabase**        | 500 MB Postgres                             |
| Attachments      | **Supabase Storage**| 1 GB                                        |
| API server       | **Render**          | 1 free web service (sleeps when idle)       |
| Front-end        | **Netlify / Vercel**| static hosting                              |
| Email (optional) | **Resend**          | 3,000 emails/mo                             |

## 1. Database + storage — Supabase

1. Create a project at supabase.com (pick a region near you).
2. **SQL Editor** → paste and run `schema.sql`, then `seed.sql`.
3. Generate real login passwords: run `npm run seed:hash` locally and paste its
   `UPDATE …` output into the SQL Editor. It prints each temp password — share those
   with users; they're forced to reset on first login.
4. **Storage** → New bucket → name it `attachments`, keep it **Private**.
5. **Project Settings → API** → copy the **Project URL** and the **service_role** key.
6. **Project Settings → Database** → copy the **Connection string (URI)**.

## 2. API server — Render

1. Push this `leave-tracker-backend` folder to a GitHub repo.
2. render.com → **New → Blueprint**, point it at the repo (it reads `render.yaml`).
3. Fill the prompted env vars:
   - `DATABASE_URL` = the Supabase connection string
   - `SUPABASE_URL` = the Project URL
   - `SUPABASE_SERVICE_KEY` = the service_role key
   - `CORS_ORIGIN` = your front-end URL (set after step 3; can update later)
   - `JWT_SECRET` is auto-generated.
4. Deploy → you get `https://timeoff-api.onrender.com`. Check `…/healthz` returns `{ ok: true }`.

## 3. Front-end — Netlify (or Vercel / Cloudflare Pages)

1. Point the React app's API base URL at your Render URL.
2. Build (`npm run build`) and deploy the output to Netlify/Vercel.
3. Back in Render, set `CORS_ORIGIN` to the deployed front-end URL and redeploy.

## 4. (Optional) Email — Resend

Sign up at resend.com, get an API key, and replace the stub in `src/mailer.js`
`sendEmail()` with a Resend call. Until then, notifications are logged, not emailed.

## Free-tier trade-offs (fine for internal use, know them anyway)

- **Render free sleeps after ~15 min idle** → the first request after idle takes
  ~30–60s to wake. A simple uptime pinger (e.g. cron-job.org hitting `/healthz`
  every 10 min) keeps it warm.
- **Supabase pauses a free project after ~1 week of no activity** → it auto-resumes
  on the next connection with a short delay.
- Limits are generous for a small team but not for a whole enterprise; upgrading any
  one piece later is a config change, not a rewrite.
- The **service_role key bypasses all row security** — keep it only in Render's env,
  never in the front-end or git.
- The hardening checklist in `README.md` still applies (SSO/MFA, per-row authz,
  attachment scanning, backups, data-protection obligations).
