import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}. Add it to .env.local (see .env.example).`
    );
  }
  return value;
}

let browserClient: SupabaseClient | null = null;
let serverClient: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient;
  browserClient = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', SUPABASE_ANON_KEY),
    { auth: { persistSession: false } }
  );
  return browserClient;
}

export function getServerSupabase(): SupabaseClient {
  if (serverClient) return serverClient;
  serverClient = createClient(
    requireEnv('SUPABASE_URL', SUPABASE_URL),
    requireEnv('SUPABASE_SERVICE_KEY', SUPABASE_SERVICE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return serverClient;
}
