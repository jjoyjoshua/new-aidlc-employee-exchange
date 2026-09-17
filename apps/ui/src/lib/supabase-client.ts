/**
 * The browser's Supabase client — **the one place in the app allowed to construct one**, and
 * the only file exempted from the lint rule that bans `@supabase/supabase-js` elsewhere.
 *
 * It is built with the **anon key** and used for exactly two things: signing in, and
 * refreshing the token. **It never reads a table.** All data comes from `/api/*` with the
 * access token sent as a bearer, because every business rule in this system lives in Express
 * ([ADR-001](../../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md)).
 *
 * Reading a table from here is not a shortcut — it routes around every rule, and
 * `ai/standards/task-surfaces.md` classifies it as an ADR-001 violation rather than a tier.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env['VITE_SUPABASE_URL'];
const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'];

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. The browser gets the anon key ' +
      'only — the service-role key is server-side and must never be bundled.',
  );
}

export const supabaseBrowserClient = createClient(url, anonKey);
