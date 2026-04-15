# API Routes Specification

## Base URL: `/api`

All routes are Next.js API routes (App Router: `app/api/*/route.ts`).

---

## 1. CPPP Routes

### `POST /api/cppp/scrape`

Triggers a full CPPP scrape. Can be called manually or via Vercel Cron.

**Request Body:**
```json
{
  "keywords": ["Signalling", "Interlocking", "MSDAC"] // optional, uses defaults if omitted
}
```

**Process:**
1. Fetch org listing page (1 request)
2. Iterate through all orgs, fetch each org's tenders (81 requests, 2s delay each)
3. Parse all tenders
4. Filter by keywords
5. Upsert results into Supabase `tenders` table
6. Return summary

**Response:**
```json
{
  "success": true,
  "totalOrgs": 81,
  "totalTenders": 1470,
  "matchedTenders": 12,
  "newTenders": 5,
  "scrapeDuration": "3m 24s",
  "tenders": [ ... ] // matched tenders array
}
```

**Timeout concern:** This takes ~3-4 minutes. Options:
- **Option A (Recommended):** Split into chunks. Frontend calls `/api/cppp/scrape-chunk?chunk=1` (orgs 1-20), then chunk 2, etc. Each chunk fits in 60s.
- **Option B:** Use Vercel Pro for extended timeouts
- **Option C:** Use a background job pattern with polling

### `GET /api/cppp/scrape-chunk`

**Query params:** `chunk` (1-5), `sessionId` (from init call)

Scrapes a subset of organisations. Frontend orchestrates sequential calls.

### `POST /api/cppp/init`

Initializes a CPPP scraping session (fetches org page, gets cookie, parses org list).

**Response:**
```json
{
  "sessionId": "encrypted-cookie-string",
  "orgs": [
    { "sno": 1, "name": "AAI Cargo...", "count": 2, "link": "/eprocure/..." },
    ...
  ],
  "totalOrgs": 81,
  "totalTenders": 1470
}
```

### `POST /api/cppp/scrape-org`

Scrapes tenders for a single organisation. Frontend calls this in a loop with delays.

**Request Body:**
```json
{
  "sessionId": "encrypted-cookie-string",
  "orgLink": "/eprocure/app?component=...",
  "orgName": "IRCON International Limited"
}
```

**Response:**
```json
{
  "tenders": [
    {
      "title": "EOI for associating with IRCON...",
      "referenceNo": "IRCON/SnT/BD/NWR-OFC/EOI/2026",
      "tenderId": "2026_IRCON_273456_1",
      "publishedDate": "01-Apr-2026 06:00 PM",
      "closingDate": "20-Apr-2026 11:00 AM",
      "openingDate": "21-Apr-2026 11:30 AM",
      "organisation": "IRCON International Limited",
      "orgChain": "IRCON International Limited||S&T",
      "source": "CPPP"
    }
  ]
}
```

---

## 2. IREPS Routes

### `POST /api/ireps/init-session`

Loads the IREPS guest login page and extracts session data.

**Response:**
```json
{
  "sessionToken": "encrypted-session-data",
  "csrfToken": "3d6660d5667ca2a93778c43e6858aee2",
  "formAction": "/epsn/guestLogin.do;jsessionid=XXXXX",
  "ready": true
}
```

### `POST /api/ireps/request-otp`

Submits the mobile number to IREPS to trigger OTP generation.

**Request Body:**
```json
{
  "sessionToken": "encrypted-session-data",
  "mobileNumber": "9876543210",
  "countryCode": "91"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP requested. Check your IREPS app.",
  "sessionToken": "updated-encrypted-session"
}
```

### `POST /api/ireps/submit-otp`

Submits the OTP to complete authentication.

**Request Body:**
```json
{
  "sessionToken": "encrypted-session-data",
  "otp": "123456",
  "mobileNumber": "9876543210"
}
```

**Response:**
```json
{
  "success": true,
  "authToken": "encrypted-authenticated-session",
  "expiresAt": 1713200000000
}
```

### `POST /api/ireps/scrape-zone`

Scrapes tenders for a single railway zone. Frontend calls this sequentially for each zone.

**Request Body:**
```json
{
  "authToken": "encrypted-authenticated-session",
  "zoneId": "NR",
  "zoneName": "Northern Railway"
}
```

**Response:**
```json
{
  "zone": "Northern Railway",
  "totalTenders": 234,
  "tenders": [
    {
      "title": "Provision of Electronic Interlocking at XYZ station",
      "referenceNo": "NR/S&T/EI/2026-27/001",
      "department": "Signal & Telecom",
      "zone": "Northern Railway",
      "division": "Delhi",
      "estimatedValue": "₹2,50,00,000",
      "publishedDate": "2026-04-10",
      "closingDate": "2026-05-15",
      "tenderType": "Open",
      "source": "IREPS"
    }
  ],
  "sessionValid": true
}
```

### `GET /api/ireps/zones`

Returns the list of railway zones to scrape.

**Response:**
```json
{
  "zones": [
    { "id": "CR", "name": "Central Railway" },
    { "id": "ER", "name": "Eastern Railway" },
    { "id": "ECR", "name": "East Central Railway" },
    ...
  ]
}
```

---

## 3. Keyword Routes

### `GET /api/keywords`

Returns current keyword list from Supabase.

### `POST /api/keywords`

Add a keyword.

**Body:** `{ "keyword": "New Keyword" }`

### `DELETE /api/keywords`

Remove a keyword.

**Body:** `{ "keyword": "Old Keyword" }`

---

## 4. Tender Routes

### `GET /api/tenders`

Fetch cached tenders from Supabase with filtering.

**Query params:**
- `source` — `CPPP`, `IREPS`, or `all`
- `keyword` — Filter by matched keyword
- `status` — `active` (closing date in future) or `expired`
- `relevance` — `high`, `medium`, `low`
- `sort` — `closingDate`, `publishedDate`, `relevance`
- `limit`, `offset` — Pagination

### `GET /api/tenders/export`

Export tenders as Excel file.

**Query params:** Same as above.

**Response:** Excel file download (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet)

---

## 5. Scrape History

### `GET /api/scrape-logs`

Returns past scrape runs.

**Response:**
```json
{
  "logs": [
    {
      "id": "uuid",
      "source": "CPPP",
      "startedAt": "2026-04-15T06:00:00Z",
      "completedAt": "2026-04-15T06:03:24Z",
      "totalScraped": 1470,
      "matchedCount": 12,
      "status": "completed"
    }
  ]
}
```

---

## 6. Cron Route

### `GET /api/cron/daily-scrape`

Triggered by Vercel Cron daily at 7 AM IST. Runs CPPP scrape only (IREPS needs manual OTP).

**vercel.json:**
```json
{
  "crons": [
    {
      "path": "/api/cron/daily-scrape",
      "schedule": "30 1 * * *"
    }
  ]
}
```
(1:30 UTC = 7:00 AM IST)

---

## Error Handling

All routes return consistent error format:
```json
{
  "success": false,
  "error": "Description of error",
  "code": "SESSION_EXPIRED" | "NETWORK_ERROR" | "PARSE_ERROR" | "RATE_LIMITED"
}
```

## Environment Variables

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
SESSION_ENCRYPTION_KEY=random-32-char-string
CRON_SECRET=secret-for-cron-auth
```
