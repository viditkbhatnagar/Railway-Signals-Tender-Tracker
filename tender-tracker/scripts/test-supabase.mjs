import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Load .env.local manually (script runs outside Next.js).
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_KEY;
console.log(`URL:       ${url}`);
console.log(`Key type:  ${key.startsWith('sb_secret_') ? 'sb_secret_ ✓' : key.startsWith('eyJ') ? 'JWT' : 'unknown'}`);
console.log(`Key len:   ${key.length}`);

if (key.includes('PASTE_HERE')) {
  console.error('\n❌ SUPABASE_SERVICE_KEY is still the placeholder. Paste your sb_secret_... value into .env.local');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// 1. Read the seeded keywords
const { data: kws, error: kErr, count } = await supabase
  .from('keywords')
  .select('keyword, category', { count: 'exact' })
  .limit(5);

if (kErr) {
  console.error('\n❌ Keywords read failed:', kErr.message);
  process.exit(1);
}
console.log(`\nkeywords table: ${count} rows`);
console.log('  sample:', kws.map((k) => k.keyword));

// 2. Verify tenders and scrape_logs tables exist (count 0 is fine)
const [{ count: tenders, error: tErr }, { count: logs, error: lErr }] = await Promise.all([
  supabase.from('tenders').select('id', { count: 'exact', head: true }),
  supabase.from('scrape_logs').select('id', { count: 'exact', head: true }),
]);
if (tErr || lErr) {
  console.error('\n❌ Table probe failed:', tErr?.message ?? lErr?.message);
  process.exit(1);
}
console.log(`tenders table:     ${tenders ?? 0} rows`);
console.log(`scrape_logs table: ${logs ?? 0} rows`);

// 3. Write+read round-trip on a throwaway tender
const testRow = {
  tender_id: '__smoke_test__',
  source: 'CPPP',
  title: 'Supabase connectivity smoke test',
  organisation: 'tender-tracker',
  matched_keywords: ['smoke'],
  relevance: 'LOW',
};
const { error: upErr } = await supabase
  .from('tenders')
  .upsert(testRow, { onConflict: 'tender_id,source' });
if (upErr) {
  console.error('\n❌ Upsert failed:', upErr.message);
  process.exit(1);
}
const { error: delErr } = await supabase
  .from('tenders')
  .delete()
  .eq('tender_id', '__smoke_test__')
  .eq('source', 'CPPP');
if (delErr) {
  console.error('\n❌ Delete failed:', delErr.message);
  process.exit(1);
}

console.log('\n✅ Supabase connectivity verified (read, upsert, delete all work).');
