import { NextRequest } from 'next/server';
import { IREPS_ZONES } from '@/lib/ireps-scraper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest): Promise<Response> {
  return Response.json({ zones: IREPS_ZONES });
}
