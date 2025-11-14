import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "../config/env";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const env = loadEnv();
  if (!env.SUPABASE_URL || !(env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) return null;
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY!;
  client = createClient(env.SUPABASE_URL, key, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "gifty/0.1" } },
    // Schema defaults to "public" - no need to specify
  });
  return client;
}


