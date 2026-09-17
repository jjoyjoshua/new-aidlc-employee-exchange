/**
 * The browser's Supabase client — **the one place in the app allowed to construct one**, and
 * the only file exempted from the lint rule that bans `@supabase/supabase-js` elsewhere.
 *
 * It is built with the **anon key** and used for exactly one thing: **refreshing the access
 * token**. It never reads a table, and it never signs anyone in. All data comes from `/api/*`
 * with the access token sent as a bearer, because every business rule in this system lives in
 * Express ([ADR-001](../../../../knowledge/decisions/ADR-001-server-mediated-supabase-access.md)).
 *
 * **Credentials go to `POST /api/auth/sign-in`, never to `auth.signInWithPassword` from here**
 * ([ADR-003](../../../../knowledge/decisions/ADR-003-express-mediated-sign-in.md)). Supabase
 * Auth has no concept of `user_profiles.is_active`, so a deactivated account signing in from
 * the browser would be issued a real access token *and a real refresh token*, and would only
 * discover the refusal on a second round-trip — a different number of requests, taking a
 * measurably different time, from a different origin. US-001/AC-04 requires an unknown email,
 * a wrong password and a deactivated account to be indistinguishable, and no amount of care in
 * this file collapses those three shapes into one.
 *
 * What this client receives is the session Express returns, handed to `auth.setSession(...)`.
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
