# middleware — the auth chain

**Protected path: any change here is Complex** (`ai/standards/task-surfaces.md`).

Supabase Auth issues the tokens; Express decides what they permit. One middleware runs on
every route except sign-in (`app-architecture.md` §5.1):

1. Verify the access token against Supabase.
2. Load `user_profiles`. **No profile, or `is_active = false` → `401`.** This is what makes
   REQ-005 bite immediately rather than at token expiry.
3. `last_seen_at` older than 30 days → `401` (NFR-009, US-003/AC-03). Otherwise refresh it,
   throttled to once an hour.
4. `must_change_password = true` → `403` with a **distinguishable code** on every route except
   the password-change route and sign-out, so the React app can route to SCR-010 rather than
   show an error (REQ-029, BR-001.17).

Authorization is a **second, explicit** middleware: `requireAdmin` on every `/api/admin/*`
route (V-07). Roles come from `user_profiles.role`, which the server has already loaded —
never from a JWT claim, which goes stale the moment an admin changes somebody's role (REQ-022).

Empty until US-001 fills it.
