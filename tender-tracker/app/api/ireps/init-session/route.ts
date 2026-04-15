import { NextRequest } from 'next/server';
import { initIREPSSession } from '@/lib/ireps-scraper';
import { serializeJar } from '@/lib/fetch-utils';
import { encryptSession } from '@/lib/encryption';
import type { ApiError } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(_req: NextRequest): Promise<Response> {
  try {
    const r = await initIREPSSession();
    const sessionToken = encryptSession(
      JSON.stringify({
        jar: await serializeJar(r.jar),
        jsessionid: r.jsessionid,
        strutsToken: r.strutsToken,
        formAction: r.formAction,
        captchaVer: r.captchaVer,
        authenticated: false,
      })
    );

    return Response.json({
      sessionToken,
      // Frontend renders the captcha image; user types the answer.
      captchaImage: r.captchaImage, // base64 (image/jpeg)
      captchaAudio: r.captchaAudio, // base64 (audio/wav) for accessibility
      ready: true,
    });
  } catch (err) {
    const body: ApiError = {
      success: false,
      error: err instanceof Error ? err.message : 'IREPS init failed',
      code: 'NETWORK_ERROR',
    };
    return Response.json(body, { status: 502 });
  }
}
