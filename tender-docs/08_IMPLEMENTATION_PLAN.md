# Implementation Plan & Critical Gotchas

## Build Order (for Claude Code)

### Phase 1: Foundation
1. `npx create-next-app@latest tender-tracker --typescript --tailwind --app --src-dir=false`
2. Install dependencies: `cheerio`, `@supabase/supabase-js`, `exceljs`, `tough-cookie`, `lucide-react`, `date-fns`
3. Set up Supabase client (`lib/supabase.ts`)
4. Create TypeScript interfaces (`lib/types.ts`)
5. Run database migrations in Supabase (create tables from `06_DATABASE_SCHEMA.md`)
6. Seed default keywords

### Phase 2: CPPP Scraper (Backend)
7. Build `lib/cppp-scraper.ts` — core scraping logic
8. Build `/api/cppp/init` route — fetch org listing, return orgs + session
9. Build `/api/cppp/scrape-org` route — scrape single org's tenders
10. Build keyword matching logic (`lib/keywords.ts`)
11. Test end-to-end: init → scrape each org → filter → save to Supabase

### Phase 3: Dashboard (Frontend)
12. Build root layout with navigation
13. Build dashboard page (`/`) — fetch from Supabase, display tender cards
14. Build `<TenderCard>` component
15. Build `<FilterBar>` component
16. Build `<StatsBar>` component

### Phase 4: Scrape UI
17. Build `/scrape` page
18. Build CPPP scrape flow — init button → progress bar → org-by-org orchestration
19. Build `<ScrapeProgress>` component

### Phase 5: IREPS Integration (Backend)
20. Build `lib/ireps-scraper.ts` — session management, page parsing
21. Build `lib/encryption.ts` — session token encrypt/decrypt
22. Build `/api/ireps/init-session` route
23. Build `/api/ireps/request-otp` route  
24. Build `/api/ireps/submit-otp` route
25. Build `/api/ireps/scrape-zone` route
26. Test with real OTP flow

### Phase 6: IREPS UI
27. Build `<OTPFlow>` component
28. Integrate into `/scrape` page
29. Build zone-by-zone scrape progress

### Phase 7: Keyword Management
30. Build `/keywords` page
31. Build `/api/keywords` CRUD routes
32. Build `<KeywordManager>` component

### Phase 8: Export & History
33. Build `/api/tenders/export` — Excel generation
34. Build `/history` page
35. Build `/api/scrape-logs` route

### Phase 9: Polish & Deploy
36. Add Vercel Cron for daily CPPP scrape
37. Mobile responsive tweaks
38. Error handling polish
39. Deploy to Vercel

---

## Critical Gotchas (Learned from Research)

### CPPP Gotchas

1. **Python `requests` gets HTTP 503, but `curl` and `node-fetch` work.**
   The site likely checks TLS fingerprint or HTTP/2 negotiation. Always test with actual `fetch` first. If it fails, fall back to spawning `curl` as child process.

2. **Session cookies are REQUIRED for org drill-down links.**
   The org listing page returns links like `/eprocure/app?component=%24DirectLink&page=FrontEndTendersByOrganisation&service=direct&session=T&sp=...`. These links contain session-bound tokens. You MUST use the same cookie jar for the org page fetch AND all subsequent org detail fetches. If cookies expire, re-fetch the org listing page.

3. **The "Active Tenders" and "Advanced Search" pages require CAPTCHA.**
   Never use these pages. Always use "Tenders by Organisation" (no CAPTCHA).

4. **Tender title format is `[Title][RefNo][TenderID]`.**
   Parse with regex: `/\[([^\]]*)\]/g`. Sometimes titles contain brackets within, so be careful with greedy matching.

5. **The site uses Apache Tapestry framework.**
   URLs contain encoded session parameters (`sp=S...%3D%3D`). Don't try to construct these — only use links extracted from HTML.

6. **Some orgs have 100+ tenders (NHAI has 295).**
   These might be paginated on the actual site, but in our tests they returned all tenders in a single page. Monitor for pagination indicators (`Next`, page numbers) and handle if present.

7. **Date format is `DD-Mon-YYYY HH:MM AM/PM`.**
   Example: `26-Mar-2026 06:00 PM`. Parse with: `parse(dateStr, 'dd-MMM-yyyy hh:mm a', new Date())` (date-fns).

### IREPS Gotchas

1. **OTP is NOT sent via SMS — it's generated in the IREPS mobile app.**
   The user must have the IREPS app installed. The "Get OTP" button on the web form likely triggers the app (or a backend flag) to display the OTP. Make this very clear in the UI.

2. **"Same OTP will be valid for full day."**
   This is good — once authenticated, the user doesn't need a new OTP until tomorrow. Store the auth token for reuse within the same day.

3. **"You can request OTP two times in an hour."**
   Rate limit on OTP requests. Handle gracefully — show remaining attempts, suggest waiting.

4. **Struts CSRF token changes per page.**
   Every IREPS page includes a hidden `org.apache.struts.taglib.html.TOKEN` field. You must extract this from the current page and include it in the next POST request. Missing token = request rejected.

5. **JSESSIONID is embedded in form action URLs.**
   The form action is `/epsn/guestLogin.do;jsessionid=XXXXX`. Extract the jsessionid from either the URL or the `Set-Cookie` header.

6. **The "Get OTP" button is `type="button"`, not `type="submit"`.**
   It triggers a JavaScript function, likely an AJAX call. You may need to reverse-engineer this AJAX endpoint by monitoring network requests in browser DevTools. Alternatively, since the user has the IREPS app, they can generate OTP independently — skip the web-based "Get OTP" entirely.

7. **IREPS may return different HTML structure for different railway zones.**
   Tender listing tables might have slightly different column orders or extra columns for different zones. Build flexible parsing that identifies columns by header text, not position.

8. **robots.txt is `Disallow: /`.**
   We're accessing with user authentication (manual OTP), not bypassing anything. But still use respectful delays (3s between requests) and stop if the session is rejected.

### Vercel Gotchas

1. **Serverless function timeout on Hobby plan is 10 seconds.**
   This is NOT enough for scraping. Solutions:
   - **Best:** Frontend orchestrates individual API calls (1 org = 1 call = ~2-3 seconds)
   - **Alternative:** Upgrade to Pro (60s timeout)
   - **Alternative:** Use Vercel Edge Functions (no timeout but limited Node.js APIs)

2. **Serverless functions are stateless.**
   Cannot maintain cookies between invocations. Must pass encrypted session state via request body.

3. **Cold starts add 1-3 seconds.**
   First API call after inactivity will be slower. Not a problem for scraping (already has delays), but affects UI responsiveness.

4. **`fetch` in Node.js 18+ is built-in.**
   No need for `node-fetch` if using Node.js 18+ runtime. But may need `undici` for advanced features (cookie handling, custom agent).

5. **Environment variable `NODE_TLS_REJECT_UNAUTHORIZED=0` affects all HTTPS calls.**
   Ideally, only disable certificate verification for .gov.in domains. Use a custom `https.Agent` per-request instead of the global env var.

6. **Vercel Cron is limited to once per day on Hobby plan.**
   Pro plan allows more frequent crons. For the free tier, daily CPPP scrape at 7 AM IST is sufficient.

### General Gotchas

1. **Date timezone handling.**
   CPPP dates are IST (UTC+5:30). IREPS dates are also IST. Store in Supabase as `TIMESTAMPTZ` (with timezone). Parse with IST timezone explicitly.

2. **Some tenders have empty/malformed titles.**
   Handle gracefully — use reference number as fallback display text.

3. **Duplicate tender detection.**
   The same tender might appear in multiple scrapes. Use `UPSERT` with `(tender_id, source)` as the unique constraint. Update `scraped_at` timestamp on re-scrape.

4. **Keyword matching should be case-insensitive.**
   "MSDAC", "msdac", "Msdac" should all match. Use `.toLowerCase()` on both the search text and keywords.

5. **The keyword "S&T" also matches "S&T" in any text including "S&T Division".**
   This is correct behavior — tender department names like "S&T Division" or "Signal & Telecom" should match.

6. **Excel export should include a clickable link to the tender detail page.**
   Use ExcelJS hyperlink feature: `cell.value = { text: title, hyperlink: url }`.
