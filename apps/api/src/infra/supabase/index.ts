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
import WebSocket from 'ws';
import { config } from '../../config/index.js';

/**
 * Why a WebSocket implementation is supplied to a client that never opens one.
 *
 * `createClient` builds a `RealtimeClient` in its constructor, unconditionally, and on Node
 * below 22 there is no global `WebSocket` for it to find — so it **throws at construction**,
 * before any call is made. This project targets `node >= 20` (root `package.json` engines) and
 * runs on 20.x, so without this the server cannot create a Supabase client at all. It was
 * found by running the API, not by any test: every sign-in returned `500`.
 *
 * ADR-001 says "No Supabase Realtime", and that is unchanged — nothing here subscribes to a
 * channel, and REQ-036's refresh-on-focus stays a property of the browser's data-fetching
 * layer. This satisfies the constructor so it stops throwing; it does not adopt Realtime.
 *
 * Remove this when the project's minimum Node is 22, where `WebSocket` is global.
 */
/** Derived from `createClient` rather than an imported name, so it cannot drift from the SDK. */
type RealtimeOptions = NonNullable<NonNullable<Parameters<typeof createClient>[2]>['realtime']>;

const realtimeTransport: RealtimeOptions = {
  // `ws`'s constructor is structurally close to the browser `WebSocket` the SDK's types ask
  // for, but not identical — its `onerror` carries a plain `Event` where the DOM type carries
  // an `ErrorEvent`. Nothing here ever opens a socket, so the difference is unreachable. One
  // cast, in one place, rather than type gymnastics that hide what is happening.
  transport: WebSocket as unknown as NonNullable<RealtimeOptions['transport']>,
};

let client: SupabaseClient | undefined;

/**
 * The service-role client. Every rule in this system is enforced in Express, so this client
 * is trusted completely — which is exactly why nothing outside this file may hold it.
 */
export function supabase(): SupabaseClient {
  client ??= createClient(config().SUPABASE_URL, config().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: realtimeTransport,
  });
  return client;
}

let authClient: SupabaseClient | undefined;

/**
 * The **anon-key** client, used for exactly one thing: verifying a submitted password against
 * Supabase Auth on the server (ADR-003).
 *
 * It is deliberately not the service-role client. A failed password attempt must never execute
 * on a key that bypasses every RLS policy in the project — and the anon key is all that a
 * credential check needs, because GoTrue authenticates the credential itself.
 *
 * `persistSession: false` matters here: this client is shared across requests in one process,
 * and a persisted session would leak one caller's identity into the next caller's attempt.
 */
export function supabaseAuthClient(): SupabaseClient {
  authClient ??= createClient(config().SUPABASE_URL, config().SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: realtimeTransport,
  });
  return authClient;
}

/** Test seam: install a stub without reaching for the real project. */
export function setSupabaseForTesting(value: SupabaseClient | undefined): void {
  client = value;
}

/** Test seam for the anon-key client. */
export function setSupabaseAuthClientForTesting(value: SupabaseClient | undefined): void {
  authClient = value;
}
