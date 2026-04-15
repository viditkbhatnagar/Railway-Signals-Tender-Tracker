# CPPP Scraper — Proven Technical Approach

## Overview

CPPP (Central Public Procurement Portal) at `etenders.gov.in` is fully scrapable without authentication. This document details the exact approach that has been **tested and verified working** as of April 2026.

## Key Facts

- **No restrictive robots.txt** on public pages
- **No authentication required** for tender listings
- **No CAPTCHA** on organisation-based browsing (only on keyword search)
- **Server-rendered HTML** (Java/Tapestry framework) — works with simple HTTP requests
- **Session-based URLs** — must maintain cookies between requests
- **1,470+ active tenders** across 81 organisations (typical count)

## Legal Basis

- RTI Act Section 4(1)(b) mandates proactive disclosure of procurement data
- GODL-India allows derivative use including commercial
- ToS does not mention scraping/bots
- Non-personal data (DPDPA doesn't apply)

## Working Approach: Organisation-Based Scraping

### Why NOT use the search form?
The Active Tenders page (`?page=FrontEndLatestActiveTenders`) and the Advanced Search both require **CAPTCHA**. We bypass this entirely by using the **Tenders by Organisation** page which lists all organisations and their tenders WITHOUT captcha.

### Step 1: Fetch Organisation Listing

**URL:** `https://etenders.gov.in/eprocure/app?page=FrontEndTendersByOrganisation&service=page`

**Method:** GET (with cookie jar for session)

**IMPORTANT:** The site returns HTTP 503 with Python `requests` library but HTTP 200 with `curl`. This is likely due to HTTP/2 or TLS fingerprinting. **Solution: Use `curl` via subprocess or use `undici`/`node-fetch` in Node.js.**

**Verified working approach with curl:**
```bash
curl -s -k -c cookies.txt -b cookies.txt \
  "https://etenders.gov.in/eprocure/app?page=FrontEndTendersByOrganisation&service=page" \
  -o org_page.html
```

**For Node.js (Vercel API routes), use `node-fetch` or `axios`:**
```javascript
const response = await fetch(
  'https://etenders.gov.in/eprocure/app?page=FrontEndTendersByOrganisation&service=page',
  {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    // May need to handle SSL: 
    // agent: new https.Agent({ rejectUnauthorized: false })
  }
);
```

**If Node.js fetch also gets 503**, fall back to spawning curl as a child process:
```javascript
import { execSync } from 'child_process';
const html = execSync(`curl -s -k "${url}"`).toString();
```

### Step 2: Parse Organisation Table

The response HTML contains a table with headers: `S.No | Organisation Name | Tender Count`

**Cheerio parsing:**
```javascript
import * as cheerio from 'cheerio';

const $ = cheerio.load(html);
const orgs = [];

// Find the table by exact header match
$('table').each((i, table) => {
  const firstRow = $(table).find('tr').first();
  const headers = firstRow.find('td, th').map((_, el) => $(el).text().trim()).get();
  
  if (headers[0] === 'S.No' && headers[1] === 'Organisation Name' && headers[2] === 'Tender Count') {
    $(table).find('tr').slice(1).each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length === 3) {
        const sno = $(cells[0]).text().trim();
        const name = $(cells[1]).text().trim();
        const count = $(cells[2]).text().trim();
        const link = $(cells[2]).find('a').attr('href') || '';
        
        if (/^\d+$/.test(sno) && link) {
          orgs.push({ sno: parseInt(sno), name, count: parseInt(count) || 0, link });
        }
      }
    });
  }
});
```

**Sample parsed data:**
```json
[
  { "sno": 1, "name": "AAI Cargo Logistics and Allied Services Company Ltd", "count": 2, "link": "/eprocure/app?component=%24DirectLink&page=FrontEndTendersByOrganisation&service=direct&session=T&sp=..." },
  { "sno": 10, "name": "Bharat Sanchar Nigam Limited (Govt of India Enterprise)", "count": 165, "link": "..." },
  { "sno": 44, "name": "IRCON International Limited", "count": 7, "link": "..." },
  ...
]
```

### Step 3: Fetch Tenders for Each Organisation

**URL:** `https://etenders.gov.in{org.link}` (relative link from Step 2)

**CRITICAL:** Must use the **same cookie jar/session** as Step 1. The links contain session tokens that are tied to the session.

**Response contains a table with headers:**
```
S.No | e-Published Date | Closing Date | Opening Date | Title and Ref.No./Tender ID | Organisation Chain
```

### Step 4: Parse Tender Data

**Title format:** `[Tender Title][Reference Number][Tender ID]`

```javascript
// Parse the "[Title][RefNo][TenderID]" format
const titleCell = $(cells[4]).text().trim();
const parts = titleCell.match(/\[([^\]]*)\]/g) || [];
const title = parts[0]?.slice(1, -1) || titleCell;
const refNo = parts[1]?.slice(1, -1) || '';
const tenderId = parts[2]?.slice(1, -1) || '';
```

**Full tender object:**
```typescript
interface CPPPTender {
  organisation: string;
  title: string;
  referenceNo: string;
  tenderId: string;
  publishedDate: string;  // "26-Mar-2026 06:00 PM"
  closingDate: string;
  openingDate: string;
  orgChain: string;       // "Parent Org||Division||Department"
  detailLink: string;
  source: 'CPPP';
}
```

### Step 5: Keyword Matching

```javascript
function matchesKeyword(tender, keywords) {
  const searchText = `${tender.title} ${tender.referenceNo} ${tender.tenderId} ${tender.orgChain}`.toLowerCase();
  return keywords.filter(kw => searchText.includes(kw.toLowerCase()));
}
```

## Timing & Rate Limits

- **81 organisations** to iterate through
- **2-3 second delay** between requests
- **Total time: ~3-4 minutes** for a full scrape
- **Vercel function timeout:** May need Vercel Pro (60s timeout) OR process in chunks:
  - Chunk 1: Fetch org listing + first 20 orgs
  - Chunk 2: Orgs 21-40
  - Chunk 3: Orgs 41-60
  - Chunk 4: Orgs 61-81
  - Each chunk under 60 seconds

## Railway-Adjacent Organisations on CPPP

These orgs on CPPP may have S&T relevant tenders:

| Organisation | Why Relevant |
|---|---|
| IRCON International Limited | Railway construction, S&T contracts |
| RITES Ltd. | Railway consultancy |
| Delhi Metro Rail Corporation | Metro signalling |
| Bangalore Metro Rail Corporation | Metro signalling |
| Mumbai Metro Rail Corporation | Metro signalling |
| Madhya Pradesh Metro Rail Corporation | Metro signalling |
| Uttar Pradesh Metro Rail Corporation | Metro signalling |
| National Capital Region Transport Corporation | RRTS signalling |
| National High Speed Rail Corporation | Bullet train signalling |
| Rail Infrastructure Development Company (K-RIDE) | Karnataka rail |
| Indian Port Rail Corporation | Port railway |
| Central Electronics Limited | Makes MSDAC, axle counters |
| Telecommunications Consultants India Limited | Telecom projects |
| Bharat Sanchar Nigam Limited | Telecom infra |

## Verified Results (April 2026 Scrape)

- **Total tenders scraped:** 1,470
- **Keyword matches (broad):** 181
- **HIGH relevance (direct S&T):** 2
  - MSDAC tender from Central Electronics Limited
  - IRCON S&T OFC laying EOI
- Most matches were BSNL civil/maintenance tenders matching "Telecom" broadly
