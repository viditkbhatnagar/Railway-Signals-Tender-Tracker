# Database Schema — Supabase (PostgreSQL)

## Tables

### `tenders`

Main tender storage. Upserted on each scrape (deduped by `tender_id + source`).

```sql
CREATE TABLE tenders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Identity
  tender_id TEXT NOT NULL,          -- e.g., "2026_IRCON_273456_1" (CPPP) or zone-specific ID (IREPS)
  source TEXT NOT NULL,              -- 'CPPP' or 'IREPS'
  
  -- Core data
  title TEXT NOT NULL,
  reference_no TEXT,
  organisation TEXT NOT NULL,
  org_chain TEXT,                    -- Full org hierarchy (CPPP)
  department TEXT,                   -- e.g., "Signal & Telecom" (IREPS)
  zone TEXT,                         -- Railway zone (IREPS only)
  division TEXT,                     -- Railway division (IREPS only)
  
  -- Dates
  published_date TIMESTAMPTZ,
  closing_date TIMESTAMPTZ,
  opening_date TIMESTAMPTZ,
  
  -- Financial
  estimated_value TEXT,              -- Keep as text (varied formats: "₹2.5 Cr", "Rs. 25,00,000")
  emd_amount TEXT,
  
  -- Classification
  tender_type TEXT,                  -- Open, Limited, Single, EOI
  tender_category TEXT,              -- Goods, Services, Works
  
  -- Matching
  matched_keywords TEXT[],           -- Array of matched keyword strings
  relevance TEXT DEFAULT 'LOW',      -- 'HIGH', 'MEDIUM', 'LOW'
  
  -- Links
  detail_link TEXT,                  -- URL to tender detail page
  
  -- Meta
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Dedup constraint
  UNIQUE(tender_id, source)
);

-- Indexes for common queries
CREATE INDEX idx_tenders_source ON tenders(source);
CREATE INDEX idx_tenders_closing_date ON tenders(closing_date);
CREATE INDEX idx_tenders_relevance ON tenders(relevance);
CREATE INDEX idx_tenders_matched_keywords ON tenders USING GIN(matched_keywords);
CREATE INDEX idx_tenders_scraped_at ON tenders(scraped_at);

-- Full text search on title
CREATE INDEX idx_tenders_title_search ON tenders USING GIN(to_tsvector('english', title));
```

### `keywords`

User-configurable keyword list.

```sql
CREATE TABLE keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  category TEXT DEFAULT 'custom',    -- 'default' or 'custom'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default keywords
INSERT INTO keywords (keyword, category) VALUES
  ('Signalling and Telecommunication', 'default'),
  ('S & T', 'default'),
  ('S&T', 'default'),
  ('Interlocking', 'default'),
  ('Electronic Interlocking', 'default'),
  ('Relay Interlocking', 'default'),
  ('MSDAC', 'default'),
  ('Level Crossing', 'default'),
  ('Level Crossing Gates', 'default'),
  ('Signalling', 'default'),
  ('Signal', 'default'),
  ('Axle Counter', 'default'),
  ('Track Circuit', 'default'),
  ('Block Instrument', 'default'),
  ('Data Logger', 'default'),
  ('Panel Interlocking', 'default'),
  ('Route Relay', 'default'),
  ('CTC', 'default'),
  ('Centralized Traffic Control', 'default'),
  ('Train Protection', 'default'),
  ('ATP', 'default'),
  ('TPWS', 'default'),
  ('LED Signal', 'default');
```

### `scrape_logs`

History of scrape runs.

```sql
CREATE TABLE scrape_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,              -- 'CPPP', 'IREPS', 'BOTH'
  status TEXT DEFAULT 'running',     -- 'running', 'completed', 'failed', 'partial'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Stats
  total_scraped INTEGER DEFAULT 0,
  matched_count INTEGER DEFAULT 0,
  new_count INTEGER DEFAULT 0,       -- Newly discovered tenders
  orgs_scraped INTEGER DEFAULT 0,    -- CPPP orgs or IREPS zones processed
  orgs_total INTEGER DEFAULT 0,
  
  -- Error tracking
  error_message TEXT,
  errors JSONB DEFAULT '[]',         -- Array of { org/zone, error } objects
  
  -- Duration
  duration_seconds INTEGER
);
```

## Supabase RLS (Row Level Security)

For a single-user app, you can keep RLS simple or disabled. If multi-user in future:

```sql
-- Enable RLS
ALTER TABLE tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (service key)
CREATE POLICY "Allow all for service" ON tenders FOR ALL USING (true);
CREATE POLICY "Allow all for service" ON keywords FOR ALL USING (true);
CREATE POLICY "Allow all for service" ON scrape_logs FOR ALL USING (true);
```

## Key Queries

### Get active matched tenders (dashboard)
```sql
SELECT * FROM tenders 
WHERE closing_date > NOW() 
  AND matched_keywords != '{}' 
ORDER BY 
  CASE relevance WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
  closing_date ASC;
```

### Get tenders closing this week
```sql
SELECT * FROM tenders 
WHERE closing_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
  AND matched_keywords != '{}'
ORDER BY closing_date ASC;
```

### Upsert tender (on scrape)
```sql
INSERT INTO tenders (tender_id, source, title, reference_no, organisation, ...)
VALUES ($1, $2, $3, $4, $5, ...)
ON CONFLICT (tender_id, source) 
DO UPDATE SET 
  title = EXCLUDED.title,
  closing_date = EXCLUDED.closing_date,
  matched_keywords = EXCLUDED.matched_keywords,
  relevance = EXCLUDED.relevance,
  updated_at = NOW(),
  scraped_at = NOW();
```

### Keyword matching in application code
```typescript
// Done in the API route, not SQL, for flexibility
function classifyRelevance(tender: Tender, matchedKeywords: string[]): 'HIGH' | 'MEDIUM' | 'LOW' {
  const highKeywords = [
    'interlocking', 'electronic interlocking', 'relay interlocking',
    'msdac', 'level crossing gate', 'axle counter', 'track circuit',
    'block instrument', 'data logger', 'panel interlocking',
    'signalling and telecommunication', 's & t', 's&t',
    'train protection', 'atp', 'tpws', 'ctc',
  ];
  
  const titleLower = tender.title.toLowerCase();
  const hasHighKeyword = matchedKeywords.some(kw => 
    highKeywords.includes(kw.toLowerCase())
  );
  
  if (hasHighKeyword) return 'HIGH';
  
  const railwayOrgs = ['ircon', 'rites', 'metro', 'rail', 'k-ride', 'central electronics'];
  const isRailwayOrg = railwayOrgs.some(ro => tender.organisation.toLowerCase().includes(ro));
  if (isRailwayOrg) return 'MEDIUM';
  
  return 'LOW';
}
```

## Supabase Client Setup

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // Use service key for server-side operations
);
```
