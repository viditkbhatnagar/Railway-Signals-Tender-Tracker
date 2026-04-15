import { NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import type { ApiError, ScrapeStatus, TenderSource } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CreateBody {
  source: TenderSource | 'BOTH';
  orgsTotal?: number;
}

interface UpdateBody {
  id: string;
  status: ScrapeStatus;
  totalScraped?: number;
  matchedCount?: number;
  newCount?: number;
  orgsScraped?: number;
  errorMessage?: string;
  errors?: Array<{ org?: string; zone?: string; error: string }>;
}

export async function GET(req: NextRequest): Promise<Response> {
  const supabase = getServerSupabase();
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10);
  const { data, error } = await supabase
    .from('scrape_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) return apiError(error.message, 500);
  return Response.json({ logs: data ?? [] });
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return apiError('Invalid JSON', 400, 'BAD_REQUEST');
  }
  if (body.source !== 'CPPP' && body.source !== 'IREPS' && body.source !== 'BOTH') {
    return apiError('Invalid source', 400, 'BAD_REQUEST');
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('scrape_logs')
    .insert({
      source: body.source,
      status: 'running',
      orgs_total: body.orgsTotal ?? 0,
      started_at: new Date().toISOString(),
    })
    .select('id, started_at')
    .single();

  if (error) return apiError(error.message, 500);
  return Response.json({ id: data.id, startedAt: data.started_at });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return apiError('Invalid JSON', 400, 'BAD_REQUEST');
  }
  if (!body.id) return apiError('Missing id', 400, 'BAD_REQUEST');

  const supabase = getServerSupabase();
  const isTerminal =
    body.status === 'completed' || body.status === 'failed' || body.status === 'partial';

  const patch: Record<string, unknown> = { status: body.status };
  if (body.totalScraped !== undefined) patch.total_scraped = body.totalScraped;
  if (body.matchedCount !== undefined) patch.matched_count = body.matchedCount;
  if (body.newCount !== undefined) patch.new_count = body.newCount;
  if (body.orgsScraped !== undefined) patch.orgs_scraped = body.orgsScraped;
  if (body.errorMessage !== undefined) patch.error_message = body.errorMessage;
  if (body.errors !== undefined) patch.errors = body.errors;
  if (isTerminal) {
    patch.completed_at = new Date().toISOString();
    // Let Postgres compute duration_seconds via started_at difference? Easier inline:
    const { data: start } = await supabase
      .from('scrape_logs')
      .select('started_at')
      .eq('id', body.id)
      .maybeSingle();
    if (start?.started_at) {
      patch.duration_seconds = Math.max(
        0,
        Math.round((Date.now() - new Date(start.started_at).getTime()) / 1000)
      );
    }
  }

  const { error } = await supabase.from('scrape_logs').update(patch).eq('id', body.id);
  if (error) return apiError(error.message, 500);
  return Response.json({ ok: true });
}

function apiError(
  message: string,
  status: number,
  code: ApiError['code'] = 'NETWORK_ERROR'
): Response {
  const body: ApiError = { success: false, error: message, code };
  return Response.json(body, { status });
}
