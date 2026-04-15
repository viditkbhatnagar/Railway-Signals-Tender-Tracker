import { NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import type { ApiError, Keyword } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest): Promise<Response> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('keywords')
    .select('id, keyword, category, is_active, created_at')
    .order('category', { ascending: true })
    .order('keyword', { ascending: true });
  if (error) return apiError(error.message, 500);
  return Response.json({ keywords: (data ?? []) as Keyword[] });
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: { keyword?: unknown };
  try {
    body = (await req.json()) as { keyword?: unknown };
  } catch {
    return apiError('Invalid JSON', 400, 'BAD_REQUEST');
  }
  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
  if (!keyword) return apiError('Missing keyword', 400, 'BAD_REQUEST');
  if (keyword.length > 120) return apiError('Keyword too long (max 120 chars)', 400, 'BAD_REQUEST');

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('keywords')
    .insert({ keyword, category: 'custom', is_active: true })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      return apiError('Keyword already exists', 409, 'BAD_REQUEST');
    }
    return apiError(error.message, 500);
  }
  return Response.json({ keyword: data as Keyword });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  let id: string | null = req.nextUrl.searchParams.get('id');
  let keyword: string | null = req.nextUrl.searchParams.get('keyword');
  if (!id && !keyword) {
    try {
      const body = (await req.json()) as { id?: string; keyword?: string };
      id = body.id ?? null;
      keyword = body.keyword ?? null;
    } catch {
      /* allow query-only */
    }
  }
  if (!id && !keyword) return apiError('Provide id or keyword', 400, 'BAD_REQUEST');

  const supabase = getServerSupabase();
  const q = supabase.from('keywords').delete();
  const { error } = id ? await q.eq('id', id) : await q.eq('keyword', keyword!);
  if (error) return apiError(error.message, 500);
  return Response.json({ ok: true });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  let body: { id?: string; keyword?: string; is_active?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return apiError('Invalid JSON', 400, 'BAD_REQUEST');
  }
  if (!body.id && !body.keyword) return apiError('Provide id or keyword', 400, 'BAD_REQUEST');
  if (body.is_active === undefined) return apiError('Missing is_active', 400, 'BAD_REQUEST');

  const supabase = getServerSupabase();
  const q = supabase.from('keywords').update({ is_active: body.is_active });
  const { error } = body.id ? await q.eq('id', body.id) : await q.eq('keyword', body.keyword!);
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
