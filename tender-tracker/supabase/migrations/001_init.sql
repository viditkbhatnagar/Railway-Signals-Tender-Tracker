-- Railway S&T Tender Tracker - Initial schema
-- Run this in Supabase SQL Editor or via `supabase db push`.

-- ============================================================
-- tenders
-- ============================================================
CREATE TABLE IF NOT EXISTS tenders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  tender_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('CPPP', 'IREPS')),

  title TEXT NOT NULL,
  reference_no TEXT,
  organisation TEXT NOT NULL,
  org_chain TEXT,
  department TEXT,
  zone TEXT,
  division TEXT,

  published_date TIMESTAMPTZ,
  closing_date TIMESTAMPTZ,
  opening_date TIMESTAMPTZ,

  estimated_value TEXT,
  emd_amount TEXT,

  tender_type TEXT,
  tender_category TEXT,

  matched_keywords TEXT[] DEFAULT '{}',
  relevance TEXT DEFAULT 'LOW' CHECK (relevance IN ('HIGH', 'MEDIUM', 'LOW')),

  detail_link TEXT,

  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (tender_id, source)
);

CREATE INDEX IF NOT EXISTS idx_tenders_source         ON tenders(source);
CREATE INDEX IF NOT EXISTS idx_tenders_closing_date   ON tenders(closing_date);
CREATE INDEX IF NOT EXISTS idx_tenders_relevance      ON tenders(relevance);
CREATE INDEX IF NOT EXISTS idx_tenders_matched_kw     ON tenders USING GIN(matched_keywords);
CREATE INDEX IF NOT EXISTS idx_tenders_scraped_at     ON tenders(scraped_at);
CREATE INDEX IF NOT EXISTS idx_tenders_title_search   ON tenders USING GIN(to_tsvector('english', title));

-- ============================================================
-- keywords
-- ============================================================
CREATE TABLE IF NOT EXISTS keywords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  category TEXT DEFAULT 'custom' CHECK (category IN ('default', 'custom')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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
  ('LED Signal', 'default')
ON CONFLICT (keyword) DO NOTHING;

-- ============================================================
-- scrape_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS scrape_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('CPPP', 'IREPS', 'BOTH')),
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  total_scraped INTEGER DEFAULT 0,
  matched_count INTEGER DEFAULT 0,
  new_count INTEGER DEFAULT 0,
  orgs_scraped INTEGER DEFAULT 0,
  orgs_total INTEGER DEFAULT 0,

  error_message TEXT,
  errors JSONB DEFAULT '[]'::jsonb,

  duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_scrape_logs_started_at ON scrape_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_source     ON scrape_logs(source);

-- ============================================================
-- updated_at trigger for tenders
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenders_updated_at ON tenders;
CREATE TRIGGER trg_tenders_updated_at
  BEFORE UPDATE ON tenders
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
