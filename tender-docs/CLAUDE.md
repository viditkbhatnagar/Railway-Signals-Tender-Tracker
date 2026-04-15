# CLAUDE.md — Instructions for Claude Code

## Project: Railway S&T Tender Tracker

Build a **Next.js 14+ (App Router)** web application that scrapes Indian government tender portals for railway Signalling & Telecommunication tenders, deployed on **Vercel** with **Supabase** as the database.

## Read These Files First (in order)

1. `01_PROJECT_OVERVIEW.md` — Architecture, tech stack, goals
2. `02_IREPS_TECHNICAL_RESEARCH.md` — IREPS endpoints, OTP flow, session management
3. `03_CPPP_SCRAPER_APPROACH.md` — CPPP scraping (proven working, tested April 2026)
4. `04_API_ROUTES_SPEC.md` — All API route definitions
5. `05_FRONTEND_SPEC.md` — Pages, components, UX flows
6. `06_DATABASE_SCHEMA.md` — Supabase tables, queries, seed data
7. `07_DEPLOYMENT.md` — Vercel config, env vars, project structure
8. `08_IMPLEMENTATION_PLAN.md` — Build order + CRITICAL gotchas (read carefully)

## Critical Constraints

1. **CPPP scraping works NOW with `fetch` + cookies — tested and verified.** The approach in `03_CPPP_SCRAPER_APPROACH.md` is proven. Don't change the fundamental approach.

2. **IREPS requires manual OTP — the user enters it in the UI.** The app NEVER bypasses authentication. See the OTP flow in `02_IREPS_TECHNICAL_RESEARCH.md`.

3. **Vercel Hobby plan has 10-second function timeout.** The frontend MUST orchestrate scraping by calling API routes one-at-a-time (1 org per call for CPPP, 1 zone per call for IREPS). Do NOT try to scrape everything in a single API call.

4. **Government sites may return 503 or have SSL issues.** Use `rejectUnauthorized: false` ONLY for `.gov.in` domains. Retry failed requests up to 3 times with exponential backoff.

5. **Respectful scraping: 2-3 second delay between requests.** The delay happens on the frontend side (between sequential API calls), not inside the API routes.

6. **No CAPTCHA bypass.** CPPP search has CAPTCHA — we avoid it by using org-based browsing. Never attempt CAPTCHA solving.

## Quick Start Commands

```bash
npx create-next-app@latest tender-tracker --typescript --tailwind --app
cd tender-tracker
npm install cheerio @supabase/supabase-js exceljs tough-cookie lucide-react date-fns
npm install -D @types/tough-cookie
```

## Build Priority

Start with CPPP (fully working, no auth needed) → Dashboard → then add IREPS. The IREPS OTP flow is complex — get CPPP + dashboard working first as an MVP.
