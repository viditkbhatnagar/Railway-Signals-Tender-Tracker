# Deployment & Configuration

## Vercel Setup

### `vercel.json`
```json
{
  "crons": [
    {
      "path": "/api/cron/daily-scrape",
      "schedule": "30 1 * * *"
    }
  ],
  "functions": {
    "app/api/cppp/**/*.ts": {
      "maxDuration": 60
    },
    "app/api/ireps/**/*.ts": {
      "maxDuration": 60
    }
  }
}
```

Note: `maxDuration: 60` requires Vercel Pro plan. On Hobby plan (10s limit), you MUST use the chunked approach where the frontend orchestrates individual org/zone calls.

### Environment Variables (Vercel Dashboard → Settings → Environment Variables)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Session encryption (generate with: openssl rand -hex 32)
SESSION_ENCRYPTION_KEY=your-64-char-hex-string

# Cron auth (generate with: openssl rand -hex 16)
CRON_SECRET=your-32-char-hex-string

# Optional: Node TLS for government sites with non-standard certs
NODE_TLS_REJECT_UNAUTHORIZED=0
```

**IMPORTANT on `NODE_TLS_REJECT_UNAUTHORIZED`:** This is needed because Indian government sites sometimes use NIC CA certificates that aren't in the default trust store. Set this ONLY in the Vercel environment, not in the app code globally. Alternatively, download and bundle the NIC root CA certificate.

## Project Structure

```
tender-tracker/
├── app/
│   ├── layout.tsx                 # Root layout with nav
│   ├── page.tsx                   # Dashboard (/)
│   ├── scrape/
│   │   └── page.tsx               # Scrape trigger page
│   ├── keywords/
│   │   └── page.tsx               # Keyword management
│   ├── history/
│   │   └── page.tsx               # Scrape history
│   └── api/
│       ├── cppp/
│       │   ├── init/route.ts      # Init CPPP session
│       │   └── scrape-org/route.ts # Scrape single org
│       ├── ireps/
│       │   ├── init-session/route.ts
│       │   ├── request-otp/route.ts
│       │   ├── submit-otp/route.ts
│       │   └── scrape-zone/route.ts
│       ├── tenders/
│       │   ├── route.ts           # GET tenders list
│       │   └── export/route.ts    # Export Excel
│       ├── keywords/
│       │   └── route.ts           # CRUD keywords
│       ├── scrape-logs/
│       │   └── route.ts           # GET scrape history
│       └── cron/
│           └── daily-scrape/route.ts
├── components/
│   ├── TenderCard.tsx
│   ├── ScrapeProgress.tsx
│   ├── OTPFlow.tsx
│   ├── FilterBar.tsx
│   ├── StatsBar.tsx
│   ├── KeywordManager.tsx
│   └── Navigation.tsx
├── lib/
│   ├── supabase.ts                # Supabase client
│   ├── cppp-scraper.ts            # CPPP scraping logic
│   ├── ireps-scraper.ts           # IREPS scraping logic
│   ├── keywords.ts                # Keyword matching logic
│   ├── encryption.ts              # Session token encryption
│   └── types.ts                   # TypeScript interfaces
├── public/
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── vercel.json
└── .env.local                     # Local dev env vars
```

## Package Dependencies

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@supabase/supabase-js": "^2.0.0",
    "cheerio": "^1.0.0",
    "exceljs": "^4.4.0",
    "tailwindcss": "^3.4.0",
    "lucide-react": "^0.383.0",
    "date-fns": "^3.0.0",
    "tough-cookie": "^4.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.0.0",
    "@types/tough-cookie": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

## SSL Certificate Handling

Indian government sites (etenders.gov.in, ireps.gov.in) may use NIC CA certificates. For Node.js `fetch`:

```typescript
// lib/fetch-utils.ts
import https from 'https';

// Custom agent that accepts government certificates
const govAgent = new https.Agent({
  rejectUnauthorized: false, // Only for gov.in domains
});

export async function govFetch(url: string, options: RequestInit = {}) {
  // Only disable cert check for known gov domains
  const isGovDomain = url.includes('.gov.in') || url.includes('.nic.in');
  
  return fetch(url, {
    ...options,
    // @ts-ignore - Node.js specific
    agent: isGovDomain ? govAgent : undefined,
  });
}
```

## Local Development

```bash
# Clone and setup
git clone <repo>
cd tender-tracker
npm install

# Set up env
cp .env.example .env.local
# Edit .env.local with your Supabase keys

# Run Supabase migrations
npx supabase db push

# Start dev server
npm run dev
```

## Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_KEY
vercel env add SESSION_ENCRYPTION_KEY
# ... etc

# Deploy to production
vercel --prod
```
