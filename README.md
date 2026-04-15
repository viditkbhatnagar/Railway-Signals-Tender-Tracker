# Railway Signals Tender Tracker

A Next.js 16 + React 19 web application that monitors Indian government tender portals for **Railway Signalling & Telecommunication (S&T)** tenders and surfaces keyword-matched results on a dashboard.

## What it does

Scrapes two portals:

1. **CPPP** (`etenders.gov.in`) — fully automated, no auth needed. Uses organisation-based browsing to avoid CAPTCHA.
2. **IREPS** (`ireps.gov.in`) — semi-automated. You authenticate by entering an OTP from the IREPS mobile app; the app never bypasses auth.

Matched tenders are classified HIGH / MEDIUM / LOW and stored in Supabase. The dashboard lets you filter by source, relevance, closing-date window, and free-text search, and export to Excel (planned Phase 8).

## Tech stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL)
- **Scraping**: native `fetch` + `cheerio` + `tough-cookie`
- **Deployment**: Vercel (with cron for daily CPPP scrape)

## Repository layout

```
railway-tender-app/
├── tender-docs/         Specification & research (read these first)
│   ├── CLAUDE.md        Instructions for Claude Code
│   ├── 01_PROJECT_OVERVIEW.md
│   ├── 02_IREPS_TECHNICAL_RESEARCH.md
│   ├── 03_CPPP_SCRAPER_APPROACH.md
│   ├── 04_API_ROUTES_SPEC.md
│   ├── 05_FRONTEND_SPEC.md
│   ├── 06_DATABASE_SCHEMA.md
│   ├── 07_DEPLOYMENT.md
│   └── 08_IMPLEMENTATION_PLAN.md
└── tender-tracker/      Next.js app
    ├── app/             App Router pages + API routes
    ├── components/      React components (client + server)
    ├── lib/             Scrapers, Supabase client, helpers
    ├── supabase/migrations/
    └── scripts/         Dev smoke-test scripts
```

## Build status

| Phase | Description | Status |
|---|---|---|
| 1 | Foundation (scaffold, types, Supabase client, SQL migration) | Done |
| 2 | CPPP scraper + `/api/cppp/{init,scrape-org}` routes | Done |
| 3 | Dashboard UI (StatsBar, FilterBar, TenderCard) | Done |
| 4 | Scrape page + CPPP orchestration UI | Done |
| 5 | IREPS scraper + 4 `/api/ireps/*` routes | Done |
| 6 | IREPS OTP flow UI (captcha + OTP + zone progress) | Done |
| 7 | Keyword management page (`/keywords`) | Done |
| 8 | Excel export + scrape history page (`/history`) | Done |
| 9 | Vercel cron (`/api/cron/daily-scrape`) + error pages + deploy | Done |

## Local development

### 1. Supabase

- Create a project at https://supabase.com
- Run [tender-tracker/supabase/migrations/001_init.sql](tender-tracker/supabase/migrations/001_init.sql) in the SQL Editor (creates 3 tables + seeds 23 default keywords)
- Grab the **Project URL**, **publishable key**, and **secret key** from Project Settings → API Keys

### 2. Environment

```bash
cd tender-tracker
cp .env.example .env.local
# Edit .env.local with your Supabase values plus:
#   SESSION_ENCRYPTION_KEY=$(openssl rand -hex 32)
#   CRON_SECRET=$(openssl rand -hex 16)
```

### 3. Run

```bash
npm install
npm run dev          # http://localhost:3000
```

### 4. Populate the dashboard

Until the scrape UI ships (Phase 4), trigger a scrape via curl:

```bash
curl -sS -X POST http://localhost:3000/api/cppp/init -o /tmp/init.json

# Then pick an org (e.g. IRCON) from /tmp/init.json and POST to /api/cppp/scrape-org
```

## Critical constraints (respect these)

- **No CAPTCHA bypass.** CPPP search has CAPTCHA — we avoid it entirely by using organisation-based browsing.
- **No IREPS auth bypass.** The user enters the OTP in the UI. Same OTP is valid for ~24h per IREPS policy.
- **Respectful scraping.** 2–3s delay between requests on the frontend (between sequential API calls), never inside a single API route.
- **Vercel Hobby-safe.** Each API route handles one org (CPPP) or one zone (IREPS) to stay well under the function timeout.
- **NIC TLS.** Indian government sites use NIC CA certs; `govFetch` attaches an `https.Agent` with `rejectUnauthorized: false` **only** for `*.gov.in` / `*.nic.in` hosts.

See [tender-docs/08_IMPLEMENTATION_PLAN.md](tender-docs/08_IMPLEMENTATION_PLAN.md) for the full gotcha list.

## Deploying to Vercel

1. Push this repo to GitHub (already done if you cloned it).
2. https://vercel.com → New Project → import `Railway-Signals-Tender-Tracker`
3. **Root directory**: `tender-tracker/` (not the repo root).
4. **Environment variables** (Settings → Environment Variables) — same names as `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `SESSION_ENCRYPTION_KEY`
   - `CRON_SECRET`
5. Deploy. The first scrape from `/scrape` will populate the database.

### Vercel Cron

[tender-tracker/vercel.json](tender-tracker/vercel.json) declares one cron:

```json
{ "path": "/api/cron/daily-scrape", "schedule": "30 1 * * *" }
```

That's **01:30 UTC = 07:00 IST**, daily. Vercel sends `Authorization: Bearer ${CRON_SECRET}` automatically. The route refuses to run without that header, so it's safe to expose.

> **Hobby plan caveat:** Hobby has a 10-second function timeout, but a full CPPP run takes ~7 minutes. The cron route will time out. Either upgrade to **Pro** (60s default, raise to 300s via `vercel.json`), or skip the cron entirely and trigger scrapes manually from `/scrape`. The chunked org-by-org orchestration in the UI works fine on Hobby because each request stays under 10s.

### Manually trigger the cron

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://your-deployment.vercel.app/api/cron/daily-scrape
```

## License

Private project. No license granted.
