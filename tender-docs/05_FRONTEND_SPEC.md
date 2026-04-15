# Frontend Specification — Pages, Components, UX Flow

## Tech Stack
- Next.js 14+ (App Router)
- Tailwind CSS
- shadcn/ui components
- React Query or SWR for data fetching
- Lucide icons

## Design Direction
Industrial/utilitarian aesthetic. Think railway control panel — dark theme with amber/green status indicators. Monospace fonts for data, clean sans-serif for headings. Data-dense but readable.

## Pages

### 1. Dashboard (`/`)

The main page. Shows keyword-matched tenders from both portals.

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  🚂 Railway S&T Tender Tracker          [Scrape Now] │
├──────────────────────────────────────────────────────┤
│  Stats Bar:                                          │
│  [Active Tenders: 14] [Closing This Week: 3]         │
│  [CPPP: 12] [IREPS: 2] [Last Scraped: 2h ago]       │
├──────────────────────────────────────────────────────┤
│  Filters:                                            │
│  [Source ▼] [Relevance ▼] [Closing Within ▼] [🔍 ]  │
├──────────────────────────────────────────────────────┤
│  Tender Cards (sorted by closing date, soonest first)│
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ 🔴 HIGH  Closing: 16 Apr (TOMORROW)             │ │
│  │ Provision of MSDAC in Arigada ARGD Yard         │ │
│  │ Central Electronics Ltd | Ref: C-2(b)/WC/...    │ │
│  │ Source: CPPP | Keywords: MSDAC                   │ │
│  │ [View Details] [Open on Portal]                  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ 🟡 MED   Closing: 20 Apr                        │ │
│  │ EOI for IRCON Pre-bid Partner OFC Laying         │ │
│  │ IRCON International Ltd | Ref: IRCON/SnT/...     │ │
│  │ Source: CPPP | Keywords: Signal, Telecom         │ │
│  │ [View Details] [Open on Portal]                  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  [Export to Excel]                                    │
└──────────────────────────────────────────────────────┘
```

**Tender Card Color Coding:**
- 🔴 RED border — Closing within 24 hours
- 🟠 ORANGE border — Closing within 3 days
- 🟡 YELLOW border — Closing within 7 days
- 🟢 GREEN border — Closing > 7 days

**Relevance Badge:**
- HIGH — Direct S&T keywords (Interlocking, MSDAC, etc.)
- MEDIUM — Railway org with telecom/signal keyword
- LOW — Broad match (BSNL civil works matching "Telecom")

### 2. Scrape Page (`/scrape`)

Manual scrape trigger with IREPS OTP flow.

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  Scrape Tenders                                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─── CPPP (etenders.gov.in) ─────────────────────┐ │
│  │ No authentication needed.                       │ │
│  │ Last scraped: 15 Apr 2026, 11:25 AM             │ │
│  │ [▶ Start CPPP Scrape]                           │ │
│  │                                                  │ │
│  │ Progress: ████████░░ 65/81 orgs (80%)           │ │
│  │ Found: 8 matching tenders so far...             │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─── IREPS (ireps.gov.in) ───────────────────────┐ │
│  │ Requires OTP authentication.                    │ │
│  │ Last scraped: Never                             │ │
│  │                                                  │ │
│  │ Step 1: [▶ Initialize Session]                  │ │
│  │                                                  │ │
│  │ Step 2: Enter Mobile Number                     │ │
│  │ +91 [__________] [Request OTP]                  │ │
│  │                                                  │ │
│  │ Step 3: Enter OTP (from IREPS app)              │ │
│  │ [______] [Submit OTP]                           │ │
│  │                                                  │ │
│  │ Step 4: [▶ Start IREPS Scrape]                  │ │
│  │                                                  │ │
│  │ Progress: Scraping Northern Railway...           │ │
│  │ ██████░░░░ 10/17 zones (59%)                    │ │
│  │ Found: 23 S&T tenders so far...                 │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**IREPS Flow States:**
1. `idle` — Show "Initialize Session" button
2. `session_ready` — Show mobile number input
3. `otp_requested` — Show OTP input (with countdown timer)
4. `authenticated` — Show "Start Scrape" button
5. `scraping` — Show progress per zone
6. `completed` — Show summary + link to dashboard
7. `error` — Show error with retry button

### 3. Keywords Page (`/keywords`)

Manage the keyword list.

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  Keyword Configuration                               │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Add Keyword: [________________] [+ Add]             │
│                                                      │
│  Active Keywords (22):                               │
│  ┌────────────────────────────────────────┬────────┐ │
│  │ Signalling and Telecommunication       │ [✕]    │ │
│  │ S & T                                  │ [✕]    │ │
│  │ Electronic Interlocking                │ [✕]    │ │
│  │ MSDAC                                  │ [✕]    │ │
│  │ Level Crossing Gates                   │ [✕]    │ │
│  │ ...                                    │        │ │
│  └────────────────────────────────────────┴────────┘ │
│                                                      │
│  [Reset to Defaults]                                 │
└──────────────────────────────────────────────────────┘
```

### 4. History Page (`/history`)

Past scrape runs and stats.

**Table columns:** Date, Source, Duration, Total Scraped, Matches, Status

## Components

### `<TenderCard>`
Props: tender object, keywords array
Shows: title, org, dates, relevance badge, matched keywords, source badge, urgency indicator

### `<ScrapeProgress>`
Props: current step, total steps, found count, current item name
Shows: progress bar, live counter, current action

### `<OTPFlow>`
Props: onAuthenticated callback
Manages: session init → mobile input → OTP input → auth state
Shows: step indicators, form fields, error messages

### `<FilterBar>`
Props: onFilterChange callback
Shows: source dropdown, relevance dropdown, date range, search input

### `<StatsBar>`
Props: tender counts by category
Shows: total active, closing soon, by source, last scraped time

### `<KeywordManager>`
Props: keywords array, onAdd, onRemove
Shows: keyword list with delete buttons, add form

## Mobile Responsiveness

- Dashboard: Cards stack vertically on mobile
- Scrape page: Full-width forms
- Filters: Collapse into a filter button on mobile
- Tables: Horizontal scroll on mobile

## Real-time UX During Scraping

When a scrape is in progress:
1. Frontend calls API routes sequentially (org by org for CPPP, zone by zone for IREPS)
2. After each call, update progress bar and append new tenders to the live list
3. User can see tenders appearing in real-time as each org/zone is scraped
4. If a matching tender is found, show a toast notification

```typescript
// Frontend scrape orchestration (pseudo-code)
async function runCPPPScrape() {
  const { sessionId, orgs } = await fetch('/api/cppp/init');
  
  for (const org of orgs) {
    const result = await fetch('/api/cppp/scrape-org', {
      method: 'POST',
      body: JSON.stringify({ sessionId, orgLink: org.link, orgName: org.name })
    });
    
    setProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
    
    const matched = result.tenders.filter(t => matchesKeywords(t));
    if (matched.length > 0) {
      setMatchedTenders(prev => [...prev, ...matched]);
      toast(`Found ${matched.length} matching tenders in ${org.name}!`);
    }
    
    // Respectful delay
    await new Promise(r => setTimeout(r, 2500));
  }
}
```
