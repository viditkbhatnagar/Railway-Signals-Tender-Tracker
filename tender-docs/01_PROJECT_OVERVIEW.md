# Railway S&T Tender Tracker — Project Overview

## What This App Does

A Next.js web application deployed on Vercel that monitors Indian government tender portals for **railway Signalling & Telecommunication (S&T)** tenders. It scrapes two portals:

1. **CPPP (etenders.gov.in)** — Fully automated, no auth needed
2. **IREPS (ireps.gov.in)** — Semi-automated, user provides OTP manually

The app filters tenders by configurable keywords and presents a clean dashboard with search, filtering, and Excel export.

## Target User

A railway S&T contractor/vendor who needs to monitor government tenders daily for keywords like: Signalling, Interlocking, Electronic Interlocking, MSDAC, Level Crossing Gates, Relay Interlocking, Axle Counter, etc.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Vercel (Next.js)                   │
│                                                      │
│  ┌──────────────┐    ┌────────────────────────────┐  │
│  │   Frontend    │    │     API Routes (/api/)      │  │
│  │   (React)     │    │                             │  │
│  │               │    │  /api/cppp/scrape           │  │
│  │  Dashboard    │───▶│  /api/ireps/init-session    │  │
│  │  Tender List  │    │  /api/ireps/submit-otp      │  │
│  │  Filters      │◀───│  /api/ireps/scrape-zone     │  │
│  │  Export       │    │  /api/keywords              │  │
│  └──────────────┘    └────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────────┐│
│  │           Supabase (PostgreSQL)                   ││
│  │  - tenders table (cached results)                 ││
│  │  - keywords table (user's keyword list)           ││
│  │  - scrape_logs table (run history)                ││
│  └──────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

## Key Technical Decisions

### Why Next.js on Vercel?
- User wants Vercel deployment
- API routes handle server-side scraping (keeps IREPS session cookies server-side)
- SSR/ISR for fast dashboard loading
- Built-in cron via `vercel.json` for scheduled CPPP scraping

### Why Supabase?
- User already has Supabase MCP connected
- Free tier is sufficient
- Stores cached tender data so the dashboard loads instantly
- Stores keyword configuration persistently

### IREPS OTP Flow (Critical Architecture)
Vercel serverless functions are stateless — we can't keep a persistent session. Solution:

1. **`/api/ireps/init-session`** — Makes POST to IREPS `guestLogin.do`, gets session cookies + CSRF token. Returns a `sessionToken` (encrypted cookie string) to the frontend.
2. **User enters OTP in the UI** — Calls `/api/ireps/submit-otp` with OTP + sessionToken
3. **`/api/ireps/submit-otp`** — Sends OTP to IREPS using the stored session cookies. If successful, returns an `authToken` (the authenticated session cookie string).
4. **`/api/ireps/scrape-zone`** — Called once per railway zone with the `authToken`. Each call is a separate serverless invocation. Frontend orchestrates: calls zone 1, waits, calls zone 2, etc.

This keeps each serverless function under 30 seconds while crawling all 17 railway zones.

### CPPP Scraper (Simpler)
- `/api/cppp/scrape` — Server-side curl-based scraping, no auth needed
- Iterates through all organisations, extracts tenders, filters by keywords
- Can be triggered manually or via Vercel Cron (daily at 7 AM IST)
- Uses `node-fetch` or `axios` with cookie jar

## Pages

1. **`/` (Dashboard)** — Shows keyword-matched tenders from both portals, sorted by closing date
2. **`/scrape`** — Manual scrape trigger page with OTP flow for IREPS
3. **`/keywords`** — Manage keyword list (add/remove/edit)
4. **`/history`** — Past scrape runs and stats

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Vercel
- **Scraping**: `node-fetch` / `axios` + `cheerio` (server-side HTML parsing)
- **Export**: `xlsx` or `exceljs` for Excel generation
- **State**: React Query / SWR for data fetching

## Default Keywords

```json
[
  "Signalling and Telecommunication",
  "S & T", "S&T",
  "Interlocking",
  "Electronic Interlocking",
  "Relay Interlocking",
  "MSDAC",
  "Level Crossing",
  "Level Crossing Gates",
  "Signalling", "Signal",
  "Axle Counter",
  "Track Circuit",
  "Block Instrument",
  "Data Logger",
  "Panel Interlocking",
  "Route Relay",
  "CTC", "Centralized Traffic Control",
  "Train Protection",
  "ATP", "TPWS",
  "LED Signal"
]
```

## Non-Functional Requirements

- **Rate limiting**: 2-3 second delay between requests to both portals
- **Error handling**: Graceful retry on network failures, timeout handling
- **Caching**: Don't re-scrape if last scrape was < 1 hour ago
- **Mobile responsive**: User may check on phone
- **No CAPTCHA bypass**: CPPP advanced search has CAPTCHA — we avoid it entirely by scraping org listings
- **No robots.txt violation on CPPP**: Public pages only, respectful delays
- **IREPS ethical usage**: User authenticates manually, we only crawl what they can see in a browser
