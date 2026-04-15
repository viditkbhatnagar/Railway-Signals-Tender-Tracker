import { NextRequest } from 'next/server';
import { submitIREPSOtp } from '@/lib/ireps-scraper';
import { deserializeJar, serializeJar } from '@/lib/fetch-utils';
import { decryptSession, encryptSession } from '@/lib/encryption';
import type { ApiError } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface RequestBody {
  sessionToken: string;
  mobileNumber: string;
  countryCode?: string;
  otp: string;
  captchaInput: string;
}

interface SessionState {
  jar: string;
  jsessionid: string;
  strutsToken: string;
  formAction: string;
  captchaVer: string;
  authenticated: boolean;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return badRequest('Invalid JSON');
  }

  for (const f of ['sessionToken', 'mobileNumber', 'otp', 'captchaInput'] as const) {
    if (!body[f]) return badRequest(`Missing ${f}`);
  }
  if (!/^\d{10}$/.test(body.mobileNumber)) {
    return badRequest('mobileNumber must be 10 digits (Indian mobile)');
  }

  let state: SessionState;
  try {
    state = JSON.parse(decryptSession(body.sessionToken)) as SessionState;
  } catch {
    return badRequest('Invalid sessionToken (run /api/ireps/init-session again)');
  }

  const jar = await deserializeJar(state.jar);

  let result;
  try {
    result = await submitIREPSOtp({
      jar,
      jsessionid: state.jsessionid,
      strutsToken: state.strutsToken,
      formAction: state.formAction,
      captchaVer: state.captchaVer,
      captchaInput: body.captchaInput,
      mobileNumber: body.mobileNumber,
      countryCode: body.countryCode ?? '91',
      otp: body.otp,
    });
  } catch (err) {
    const apiErr: ApiError = {
      success: false,
      error: err instanceof Error ? err.message : 'OTP submission failed',
      code: 'NETWORK_ERROR',
    };
    return Response.json(apiErr, { status: 502 });
  }

  if (!result.authenticated) {
    return Response.json(
      {
        success: false,
        error: result.errorMessage ?? 'Authentication failed',
        code: 'UNAUTHORIZED',
      } satisfies ApiError,
      { status: 401 }
    );
  }

  // Re-serialise the jar (now contains authenticated JSESSIONID + any extras)
  // and seal as authToken. Valid for the rest of the day per IREPS policy.
  const authToken = encryptSession(
    JSON.stringify({
      jar: await serializeJar(jar),
      jsessionid: state.jsessionid,
      authenticated: true,
    })
  );
  // OTP is "valid for full day" per IREPS — cap at midnight IST conservatively
  // by using +20h from now.
  const expiresAt = Date.now() + 20 * 60 * 60 * 1000;

  return Response.json({ success: true, authToken, expiresAt });
}

function badRequest(message: string): Response {
  const body: ApiError = { success: false, error: message, code: 'BAD_REQUEST' };
  return Response.json(body, { status: 400 });
}
