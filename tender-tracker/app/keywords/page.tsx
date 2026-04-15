import { KeywordManager } from '@/components/KeywordManager';
import { getServerSupabase } from '@/lib/supabase';
import type { Keyword } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function loadKeywords(): Promise<{ keywords: Keyword[]; error: string | null }> {
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('keywords')
      .select('id, keyword, category, is_active, created_at')
      .order('category', { ascending: true })
      .order('keyword', { ascending: true });
    if (error) return { keywords: [], error: error.message };
    return { keywords: (data ?? []) as Keyword[], error: null };
  } catch (err) {
    return { keywords: [], error: err instanceof Error ? err.message : 'Failed' };
  }
}

export default async function KeywordsPage() {
  const { keywords, error } = await loadKeywords();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Keywords</h1>
        <p className="text-sm text-neutral-500">
          Tenders are matched against active keywords (case-insensitive substring) in title,
          reference number, organisation, and department fields.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-medium">Could not load keywords.</p>
          <p className="mt-1 font-mono text-xs break-all">{error}</p>
        </div>
      ) : (
        <KeywordManager initial={keywords} />
      )}
    </div>
  );
}
