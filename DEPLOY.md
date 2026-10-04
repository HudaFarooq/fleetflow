# Deploying FleetFlow for free

Three free services, about 20 minutes:

| Part | Service | Free plan notes |
|---|---|---|
| Database | [Neon](https://neon.tech) (PostgreSQL) | Pauses when idle and wakes on the next query |
| API | [Render](https://render.com) | Sleeps after 15 minutes idle; the first request then takes about a minute |
| Web app | [Vercel](https://vercel.com) | Always on |

None of them need a credit card.

## 1. Put the code on GitHub

FleetFlow should be its own repository. From the `fleetflow` folder:

```powershell
git init
git add .
git commit -m "FleetFlow: parcel delivery and fleet management platform"
```

Create an empty repository on GitHub (no README), then:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/fleetflow.git
git branch -M main
git push -u origin main
```

Check that `backend/.env` was **not** uploaded; `.gitignore` excludes it because it holds your passwords. GitHub Actions will now run the tests on every push (the **Actions** tab).

## 2. Database: Neon

1. Sign up at neon.tech and create a project (pick the region nearest your users).
2. Copy the **connection string**. It looks like `postgresql://user:password@ep-xxx.neon.tech/neondb?sslmode=require`.

## 3. API: Render

1. Sign up at render.com with your GitHub account.
2. **New → Blueprint**, pick the `fleetflow` repository. Render reads `render.yaml`.
3. Fill in the secret values it asks for:
   - `DATABASE_URL`: the Neon connection string
   - `CORS_ORIGINS`: `["http://localhost:3000"]` for now (updated in step 5)
   - `FRONTEND_URL`: `http://localhost:3000` for now
   - `GEMINI_API_KEY`: leave empty, or paste a free key from aistudio.google.com to turn on the AI assistant
4. Deploy. On first start it creates the tables and the demo data.
5. Note the URL, e.g. `https://fleetflow-api.onrender.com`. Opening `/health` should show `{"status":"ok"}`.

## 4. Web app: Vercel

1. Sign up at vercel.com with GitHub and **Add New → Project** → `fleetflow`.
2. Set **Root Directory** to `frontend`.
3. Add environment variables:
   - `NEXT_PUBLIC_API_URL` = your Render URL (no trailing slash)
   - `NEXT_PUBLIC_MAP_CENTER` = `31.52,74.35` (or your city)
4. Deploy and note the URL, e.g. `https://fleetflow.vercel.app`.

## 5. Connect them

In Render → `fleetflow-api` → **Environment**, update:

- `CORS_ORIGINS` = `["https://fleetflow.vercel.app"]`
- `FRONTEND_URL` = `https://fleetflow.vercel.app`

Save; Render redeploys. Open your Vercel URL and log in with a demo button.

## What's protected in production

- `ENVIRONMENT=production`: the API refuses to start with a weak `JWT_SECRET` or a SQLite database.
- `DEMO_MODE=true`: the three shared demo accounts can be used but not renamed, re-passworded, deactivated or deleted, so one visitor can't lock out the next. Visitors can still register their own accounts.
- Payments run in **test mode** only; no real money can move.
- The AI assistant has per-user hourly limits and a daily cap, and only uses read-only tools.

## Updating

Push to `main`. Vercel and Render redeploy automatically, and Render runs any new database migrations on startup.

## Troubleshooting

- **The site loads but data doesn't:** the API is waking up (free plan). Wait a minute and refresh.
- **Browser console says CORS:** `CORS_ORIGINS` doesn't exactly match your Vercel URL (https, no trailing slash).
- **Render logs show a database error:** check `DATABASE_URL`, and that it ends with `?sslmode=require`.
