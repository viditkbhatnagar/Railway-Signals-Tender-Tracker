import { NextRequest } from 'next/server';
import { fetchOrgListing } from '@/lib/cppp-scraper';
import { serializeJar } from '@/lib/fetch-utils';
import { encryptSession } from '@/lib/encryption';
import type { CPPPInitResponse, ApiError } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest): Promise<Response> {
  try {
    const { orgs, totalTenders, jar } = await fetchOrgListing();
    const sessionId = encryptSession(await serializeJar(jar));

    const body: CPPPInitResponse = {
      sessionId,
      orgs,
      totalOrgs: orgs.length,
      totalTenders,
    };
    return Response.json(body);
  } catch (err) {
    const body: ApiError = {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      code: 'NETWORK_ERROR',
    };
    return Response.json(body, { status: 502 });
  }
}
