# IREPS Technical Research — API Endpoints, Session Management, HTML Structure

## Overview

IREPS (ireps.gov.in) is built on Apache Struts (Java). It uses session-based authentication with JSESSIONID cookies and Struts CSRF tokens. The site has two contexts:
- `eps` — Goods & Services procurement
- `epsn` — Works E-Tender (this is where S&T tenders live)

## robots.txt

```
User-agent: *
Disallow: /
```

Blanket disallow. We only access IREPS with user-provided authentication (manual OTP).

## Authentication Flow — Guest Login

### Step 1: Load Guest Login Page

**Request:**
```
POST https://www.ireps.gov.in/epsn/guestLogin.do
```

**Response:** HTML page with form. Key fields:

| Field | Type | Purpose |
|-------|------|---------|
| `org.apache.struts.taglib.html.TOKEN` | hidden | Struts CSRF token (changes per session) |
| `activity` | hidden | Empty initially |
| `actionMode` | hidden | Value: `adSearch` |
| `guForm` | text | Empty (purpose unclear) |
| `ver` | hidden | Empty |
| `number` | text | **User's mobile number** |
| `otp` | password | **OTP entered by user** |
| `ccode` | select | Country code (default India: `91`) |

**Important cookies set:**
- `JSESSIONID` — Session identifier (format: `0001xxxxx:yyyyyyy`)
- The JSESSIONID is embedded in the form action URL: `/epsn/guestLogin.do;jsessionid=XXXXX`

### Step 2: Request OTP

The "Get OTP" button triggers a request (likely AJAX). The OTP is NOT sent via SMS — it's generated in the **IREPS mobile app**. The user must have the IREPS app installed and use "Generate OTP" feature, then enter it on the web form.

**To request OTP via the web form:**
```
POST https://www.ireps.gov.in/epsn/guestLogin.do;jsessionid={SESSION_ID}
Content-Type: application/x-www-form-urlencoded

org.apache.struts.taglib.html.TOKEN={TOKEN}
&activity=
&actionMode=adSearch
&number={MOBILE_NUMBER}
&ccode=91
&guForm=
&ver=
```

The "Get OTP" button is `type="button"` (not submit), meaning it likely triggers an AJAX call. You'll need to inspect network requests to find the exact OTP request endpoint. Alternative: the user just uses the IREPS app to generate OTP independently.

### Step 3: Submit OTP

**Request:**
```
POST https://www.ireps.gov.in/epsn/guestLogin.do;jsessionid={SESSION_ID}
Content-Type: application/x-www-form-urlencoded

org.apache.struts.taglib.html.TOKEN={TOKEN}
&activity=
&actionMode=adSearch
&number={MOBILE_NUMBER}
&ccode=91
&otp={OTP_VALUE}
&guForm=
&ver=
&imageField=Proceed
```

**On success:** Redirects to the tender search page. The JSESSIONID cookie is now authenticated.

**Rate limits:** 
- "You can request OTP two times in an hour"
- "Same OTP will be valid for full day"
- This is good — one OTP per day is enough

### Step 4: Access Tender Search

After successful OTP login, the user lands on a search page. From JavaScript analysis:

**Works E-Tender Search:**
```
GET/POST https://www.ireps.gov.in/epsn/anonymSearch.do?searchParam=showPage&language=en
```

**Goods & Services Search:**
```
GET https://www.ireps.gov.in/epsn/anonymSearch.do?searchParam=showPageClosed&language=en
```

**Purchase Order Search:**
```
GET https://www.ireps.gov.in/epsn/anonymSearchPO.do?searchParam=showPageSupply&language=en
```

## Post-Login Tender Browsing

### Tender Listing by Railway Zone

IREPS organizes tenders by Railway Zones. After login, the search page shows:

| Sr No | Railway Zone | Total Tenders | Action (View) |
|-------|-------------|---------------|---------------|

**Known Railway Zones (17 zones + production units):**
1. Central Railway (CR)
2. Eastern Railway (ER)
3. East Central Railway (ECR)
4. East Coast Railway (ECoR)
5. Northern Railway (NR)
6. North Central Railway (NCR)
7. North Eastern Railway (NER)
8. Northeast Frontier Railway (NFR)
9. North Western Railway (NWR)
10. Southern Railway (SR)
11. South Central Railway (SCR)
12. South Eastern Railway (SER)
13. South East Central Railway (SECR)
14. South Western Railway (SWR)
15. Western Railway (WR)
16. West Central Railway (WCR)
17. Metro Railway Kolkata

Plus production units: CLW, DLW, ICF, RCF, MCF, etc.

### Tender Detail Fields

Each tender listing typically contains:
- **Tender Number / Reference Number**
- **Description / Title** (this is what we keyword-match against)
- **Railway Zone and Division**
- **Department** (S&T, Civil, Electrical, Mechanical, etc.)
- **Estimated Value**
- **Published Date**
- **Closing Date / Due Date**
- **Opening Date**
- **Tender Type** (Open, Limited, Single)
- **EMD (Earnest Money Deposit) Amount**

### URL Patterns (from JavaScript analysis)

```javascript
// Show tenders by list type
linkUrl + context + "/home/showTenderDetails.do?listType=" + listType
// listType values: closingToday, closingTomorrow, closingInAWeek, etc.

// View railway-specific tenders
linkUrl + context + "/home/viewRlyTenders.do?listType=" + listType

// High value tenders report
linkUrl + "epsn/reports/HighValue.do?showPage=show&language=en"

// Annual procurement report
linkUrl + "epsn/reports/AnnualProcurmentValue.do?showPage=show&language=en"
```

## Session Management for Vercel

### The Challenge
Vercel serverless functions are stateless. Each invocation is independent. We need to pass session state between calls.

### Solution: Encrypted Cookie Relay

1. When we call IREPS and get cookies back, encrypt them and send to frontend
2. Frontend stores encrypted cookies in memory (NOT localStorage for security)
3. Frontend sends encrypted cookies back with each API call
4. API route decrypts and uses them for IREPS requests

```typescript
// Pseudo-code for session relay
interface IREPSSession {
  jsessionid: string;
  csrfToken: string;
  isAuthenticated: boolean;
  expiresAt: number; // timestamp
}

// Encrypt before sending to frontend
const encryptedSession = encrypt(JSON.stringify(session), process.env.SESSION_SECRET);

// Decrypt when received from frontend
const session = JSON.parse(decrypt(encryptedSession, process.env.SESSION_SECRET));
```

### Cookie Persistence Across API Calls

Use `tough-cookie` or manual cookie management:

```typescript
import { CookieJar } from 'tough-cookie';

// In /api/ireps/init-session
const jar = new CookieJar();
const response = await fetch(IREPS_URL, { 
  // ... headers
});
// Extract Set-Cookie headers, store in jar
// Serialize jar → encrypt → return to frontend

// In /api/ireps/scrape-zone
// Decrypt → deserialize jar → use cookies in request
```

## Important Technical Notes

1. **IREPS uses Struts token validation** — The `org.apache.struts.taglib.html.TOKEN` must be extracted from each page and sent with the next request. Missing/invalid token = session rejection.

2. **Session timeout** — IREPS sessions typically expire after 20-30 minutes of inactivity. The "same OTP valid for full day" message suggests the OTP itself is day-valid, but the session may still timeout.

3. **User-Agent matters** — Use a realistic browser User-Agent string. IREPS may block non-browser UAs.

4. **SSL/TLS** — The server uses a government CA certificate. You may need to handle certificate verification carefully. In Node.js: `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` (only for IREPS calls, not globally).

5. **The site is NOT an SPA** — It's server-rendered HTML. Each page navigation returns full HTML that needs parsing with Cheerio.

6. **Form submissions use POST** — The `postRequest()` JavaScript function creates hidden forms and submits them. Our API routes need to replicate this with POST requests and proper form encoding.
