# FleetFlow

A parcel delivery and fleet management platform for fleets going electric. Customers book, pay for and track parcels; dispatchers plan routes, schedule EV charging and watch the fleet move live; drivers work through their stops in order.

**Live demo:** _add your Vercel URL here after deploying (see [DEPLOY.md](DEPLOY.md))_ · one-click demo logins for customer, admin and driver on the login page.

## Highlights

- **Route optimization (OR-Tools):** a capacitated vehicle routing solver decides which vehicle takes each waiting parcel and the order of every stop. It respects weight capacity and each EV's remaining battery range, keeps parcels already on a vehicle with that vehicle, and reports what couldn't fit and why. It's compared against delivering in booking order.
- **EV charging planner (linear program):** schedules overnight charging in 30-minute slots to minimize cost under a time-of-use tariff, without exceeding the depot's grid connection, so each van leaves with enough charge for its planned route. It's compared against "plug in and charge immediately". It's the one-shot form of a model-predictive controller.
- **Live fleet map (WebSockets):** vehicle positions and parcel changes are pushed to dashboards instantly, filtered per user so drivers only receive their own vehicle. A built-in simulator drives the demo fleet and drains and recharges EV batteries.
- **AI dispatch assistant (LLM agent):** answers questions such as "which vans are free?" or "when should the EVs charge tonight?" by calling read-only tools over live data. Provider-agnostic (Gemini free tier by default), with per-user and daily limits.
- **Payments:** weight-based pricing, test-mode checkout, receipts, refunds, revenue analytics. Providers plug in behind a small interface.
- **Security:** JWT with per-user token versions (instant sign-out everywhere), bcrypt, login lockout, single-use password reset links, role-based access enforced on the server, and a demo mode that protects shared demo logins.
- **Quality:** 84 backend tests run on both SQLite and PostgreSQL in CI, with database migrations (Alembic) checked against the models.

## Features by role

| Customer | Admin / dispatcher | Driver |
|---|---|---|
| Book parcels with a live price and a map pin | Dispatch board with live map | Deliveries in planned stop order |
| Pay by card (test mode), receipts | Route optimizer and EV charging planner | One-tap status updates, report a problem |
| Track parcels; public tracking page | Analytics: revenue, deliveries, success rate, per-vehicle | Live battery and status of their vehicle |
| Payment history | Payments and refunds, user management | Account settings |
| Account settings | AI assistant, fleet simulator | |

## Tech stack

| Layer | Technology |
|---|---|
| Web app | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Motion, Embla Carousel |
| Maps & data | Leaflet + OpenStreetMap, TanStack Query, WebSockets |
| API | Python 3.11, FastAPI, Pydantic |
| Database | PostgreSQL, SQLAlchemy 2, Alembic migrations |
| Optimization | Google OR-Tools (routing solver, GLOP linear programming) |
| AI | Gemini API with tool calling, behind a provider interface |
| Auth | JWT (PyJWT), bcrypt |
| Testing & CI | pytest, ruff, GitHub Actions (SQLite + PostgreSQL), ESLint, TypeScript |
| Hosting (free) | Vercel (web), Render (API), Neon (PostgreSQL) |

## Architecture

```
Browser (Next.js on Vercel)
   │  HTTPS (REST)            WebSocket (live updates)
   ▼                            ▼
FastAPI (Render) ──────────────────────────────┐
   ├─ routers/       auth, users, vehicles, parcels, payments, planning, assistant, live …
   ├─ planning/      OR-Tools: vehicle routing + EV charging LP (pure functions, no DB)
   ├─ assistant/     LLM agent loop + read-only tools + provider (Gemini)
   ├─ payments/      provider interface + test-mode sandbox
   ├─ realtime.py    per-user filtered WebSocket broadcast
   └─ simulator.py   moves the demo fleet
   ▼
PostgreSQL (Neon) ← schema managed by Alembic migrations
```

## Project structure

```
frontend/src/
  app/                 pages: landing, /track, /login, /register, /forgot-password, /reset-password,
                       /dashboard (+ /account, /payments, /checkout/[id], /planning, /analytics, /users)
  components/          landing sections, tracking, dashboard views, charts, maps, shared UI
  lib/                 API client, auth, live updates, types, helpers
backend/
  app/                 FastAPI application (see Architecture)
  migrations/          Alembic migration scripts
  scripts/             init_db.py (migrate + demo data), setup_local.ps1 (Windows setup)
  tests/               pytest suite
render.yaml            Render deployment blueprint
.github/workflows/     CI pipeline
```

## Running locally (Windows)

Prerequisites: Python 3.11, Node.js 20+, PostgreSQL 17.

```powershell
# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements-dev.txt
powershell -ExecutionPolicy Bypass -File scripts\setup_local.ps1   # asks for your Postgres password, creates the DB, migrates, adds demo data
uvicorn app.main:app --reload
```

```powershell
# Web app, in a second terminal
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 and use a demo button on the login page. API docs are at http://localhost:8000/docs.

Optional settings (AI key, real email, time zone) are described in `backend/.env.example`.

### Database changes

Edit `backend/app/models.py`, then:

```powershell
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

A test fails if the models change without a matching migration.

### Tests

```powershell
cd backend
pytest                                   # SQLite, no setup needed
$env:TEST_DATABASE_URL = "postgresql+psycopg://postgres:PASSWORD@localhost:5432/fleetflow_test"
pytest                                   # same tests on an empty PostgreSQL database

cd ..\frontend
npx tsc --noEmit; npx eslint src; npm run build
```

## Deploying

See [DEPLOY.md](DEPLOY.md): Neon, Render and Vercel, all free, about 20 minutes.

## Payments in test mode

No money moves. Use any future expiry and any 3-digit CVC:

| Card number | Result |
|---|---|
| `4242 4242 4242 4242` | Succeeds |
| `5555 5555 5555 4444` | Succeeds (Mastercard) |
| `4000 0000 0000 0002` | Declined |
| `4000 0000 0000 9995` | Insufficient funds |

To use a real provider, add a class with `charge` and `refund` in `backend/app/payments/`. With real providers the card form should be the provider's own widget, so card numbers never reach this server.

## Modelling notes and limits

- **Distances** are straight-line × a road factor (1.3), not a road-network router, so they're good for comparing plans but not for navigation.
- **Routes are open:** a vehicle ends at its last stop instead of returning to the depot.
- **Charging** assumes vans are at the depot until departure. The planner solves once; in production you'd re-solve every slot with fresh battery data (receding horizon).
- **In-memory state** (login lockouts, assistant limits, WebSocket connections) assumes one API process; several processes would share it through Redis.

## API overview

Full interactive docs at `/docs`. Main endpoints:

| Area | Endpoints |
|---|---|
| Auth & account | `POST /auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`; `GET/PATCH/DELETE /auth/me`; `POST /auth/me/password`, `/auth/me/sign-out-everywhere` |
| Users (admin) | `GET/POST /users`; `GET/PATCH/DELETE /users/{id}`; `POST /users/{id}/revoke-sessions` |
| Fleet | `GET/POST /vehicles`; `PATCH /vehicles/{id}`, `/vehicles/{id}/location` |
| Parcels | `GET/POST /parcels`; `POST /parcels/{id}/assign`, `/parcels/{id}/status`, `/parcels/{id}/pay`; `GET /track/{tracking_id}` (public) |
| Payments | `GET /pricing/quote`; `GET /payments`; `POST /payments/{id}/refund` |
| Planning (admin) | `POST /planning/routes` (`apply: true` to assign), `POST /planning/charging` |
| Live | `WS /ws/fleet`; `GET /simulation`, `POST /simulation/start`, `/simulation/stop` |
| Insights | `GET /analytics`, `GET /stats/public`; `POST /assistant/chat`, `GET /assistant/status` |
