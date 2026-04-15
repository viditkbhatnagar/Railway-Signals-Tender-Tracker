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
| 4 | Scrape page + CPPP orchestration UI | — |
| 5 | IREPS scraper + `/api/ireps/*` routes | — |
| 6 | IREPS OTP flow UI | — |
| 7 | Keyword management UI | — |
| 8 | Export to Excel + history page | — |
| 9 | Vercel cron + polish + deploy | — |

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

## License

Private project. No license granted.
