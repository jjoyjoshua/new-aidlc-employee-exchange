/**
 * The only module permitted to construct a Supabase client or read the service-role key.
 *
 * That key bypasses every Row Level Security policy in the project. It belongs to the server
 * process, is never sent to the browser, and never appears in a log line
 * ([ADR-001](../../../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md)).
 * The lint config forbids `@supabase/supabase-js` everywhere else, because ADR-001 is
 * worthless if any module can open its own connection.
 *
 * Protected path: any change here is Complex (`ai/standards/task-surfaces.md`).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/index.js';

let client: SupabaseClient | undefined;

/**
 * The service-role client. Every rule in this system is enforced in Express, so this client
 * is trusted completely — which is exactly why nothing outside this file may hold it.
 */
export function supabase(): SupabaseClient {
  client ??= createClient(config().SUPABASE_URL, config().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Test seam: install a stub without reaching for the real project. */
export function setSupabaseForTesting(value: SupabaseClient | undefined): void {
  client = value;
}
