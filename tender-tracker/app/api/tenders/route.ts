import { NextRequest } from 'next/server';
import { queryTenders, type TenderQuery } from '@/lib/tender-queries';
import type { TenderSource, Relevance } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseSource(v: string | null): TenderQuery['source'] {
  return v === 'CPPP' || v === 'IREPS' ? (v as TenderSource) : 'all';
}
function parseRelevance(v: string | null): TenderQuery['relevance'] {
  return v === 'HIGH' || v === 'MEDIUM' || v === 'LOW' ? (v as Relevance) : 'all';
}
function parseStatus(v: string | null): TenderQuery['status'] {
  return v === 'active' || v === 'expired' || v === 'all' ? v : 'active';
}
function parseSort(v: string | null): TenderQuery['sort'] {
  return v === 'publishedDate' || v === 'relevance' ? v : 'closingDate';
}
function parseInt0(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function GET(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams;
  const result = await queryTenders({
    source: parseSource(sp.get('source')),
    relevance: parseRelevance(sp.get('relevance')),
    status: parseStatus(sp.get('status')),
    closingWithinDays: parseInt0(sp.get('closingWithin')),
    search: sp.get('search') ?? undefined,
    sort: parseSort(sp.get('sort')),
    limit: parseInt0(sp.get('limit')) ?? 200,
    offset: parseInt0(sp.get('offset')) ?? 0,
  });
  return Response.json(result);
}
