/**
 * Who is signed in, and the one way to change that.
 *
 * ADR-003: credential submission goes to **our** server, never to Supabase Auth. The browser's
 * Supabase client keeps exactly one job — refreshing the access token — and it is handed the
 * session our server returns.
 *
 * The role lives here only for rendering. It is never the authorization decision: every admin
 * surface is refused by `requireAdmin` on the server (US-001/AC-03), and `RequireRole` in the
 * browser is convenience on top of that.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ERROR_CODES,
  sessionResponseSchema,
  setPasswordResponseSchema,
  signInResponseSchema,
  type AuthenticatedUser,
  type Session,
} from '@desk-booking/contracts';
import { createApiClient, type ApiClient, type ApiResult } from '../api-client.js';

/** NFR-009 cold-boot rehydration. What a stored (browser-persisted) session hands back —
 *  just enough to ask the server whether it still holds. */
export interface StoredSession {
  accessToken: string;
}

/** What a sign-in attempt tells the screen. The screen maps these to SCR-001's states. */
export type SignInResult =
  | { kind: 'ok'; user: AuthenticatedUser }
  | { kind: 'rejected' }
  | { kind: 'unavailable' };

/**
 * US-004. `same-as-current` is the one refusal SCR-010 renders as its own state (ST-03);
 * everything else collapses to `failed` — ST-06's copy is true for a 400, a 403, a 503 and a
 * transport failure alike, and inventing a state for a `400` AC-04 already makes unreachable
 * would be copy for a situation no user can act on differently (design note §7.3).
 */
export type SetPasswordResult =
  | { kind: 'ok'; user: AuthenticatedUser }
  | { kind: 'same-as-current' }
  | { kind: 'failed' };

export interface AuthContextValue {
  user: AuthenticatedUser | undefined;
  /**
   * NFR-009. `'booting'` while the stored session (if any) is being confirmed with the server —
   * `RequireSession` holds rather than redirecting during this phase, or every cold boot would
   * flash sign-in before rehydration finishes (US-003 design note §5.2). Derived, not a second
   * source of truth: once booting ends, `signedIn` is exactly `user !== undefined`.
   */
  status: 'booting' | 'signedIn' | 'signedOut';
  signIn(email: string, password: string, signal?: AbortSignal): Promise<SignInResult>;
  /**
   * Ends the session server-side, then forgets it in this tab (US-002). Proceeds to clear
   * `user` regardless of what the server answered — a transport failure must not strand
   * someone on a signed-in screen (US-002/D-04); there is no UI state for a failed sign-out.
   */
  signOut(): Promise<void>;
  /**
   * `POST /api/auth/set-password` (US-004). On `ok`, sets `user` from the response — with the
   * mark cleared — **before** resolving, so `RequireSession`/`RequirePasswordChange` see the
   * change on the very next render. Does not navigate; the screen does (design note §7.3).
   */
  setPassword(newPassword: string): Promise<SetPasswordResult>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
  /** Overridden in tests. Defaults to the real client. */
  client?: ApiClient;
  /** Where the session goes on success. Defaults to the browser's Supabase client. */
  onSession?: (session: Session) => void | Promise<void>;
  /**
   * Forgets the session in the browser's own Supabase client once the server has ended it.
   * Overridden in tests. Defaults to `supabaseBrowserClient.auth.signOut({ scope: 'local' })` —
   * `'local'` because the server has already done the revocation (US-002/D-03); this only
   * clears what supabase-js holds in this tab's storage. Loaded lazily so a test that never
   * signs out never needs `VITE_SUPABASE_*` to be set.
   */
  onSignOut?: () => void | Promise<void>;
  /**
   * NFR-009 cold-boot rehydration. Overridden in tests. Defaults to reading back what
   * `supabaseBrowserClient` already persists and refreshes on its own — nothing new is stored,
   * this only reads it (US-003 design note §5.1). Loaded lazily so a test that stubs this prop
   * never needs `VITE_SUPABASE_*` to be set.
   */
  getStoredSession?: () => Promise<StoredSession | undefined>;
}

const defaultOnSignOut = async (): Promise<void> => {
  const { supabaseBrowserClient } = await import('../supabase-client.js');
  await supabaseBrowserClient.auth.signOut({ scope: 'local' });
};

const defaultGetStoredSession = async (): Promise<StoredSession | undefined> => {
  const { supabaseBrowserClient } = await import('../supabase-client.js');
  const { data } = await supabaseBrowserClient.auth.getSession();
  return data.session ? { accessToken: data.session.access_token } : undefined;
};

export function AuthProvider({ children, client, onSession, onSignOut, getStoredSession }: AuthProviderProps) {
  const [user, setUser] = useState<AuthenticatedUser | undefined>(undefined);
  const [status, setStatus] = useState<AuthContextValue['status']>('booting');
  /**
   * The access token for the life of this tab, and nothing more durable than that (US-002/§6.2).
   * Populated either at sign-in or, on a cold boot, once the stored session is confirmed with
   * the server below (US-003).
   */
  const accessTokenRef = useRef<string | undefined>(undefined);
  const api = useMemo(
    () =>
      client ??
      createApiClient({
        baseUrl: import.meta.env['VITE_API_BASE_URL'] ?? '',
        getAccessToken: () => accessTokenRef.current,
        timeoutMs: 10_000,
      }),
    [client],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let stored: StoredSession | undefined;
      try {
        stored = await (getStoredSession ?? defaultGetStoredSession)();
      } catch {
        // Reading the stored session is not itself an answer about it — treat exactly like an
        // unreachable server: render signed out for this boot without deciding anything.
        if (!cancelled) setStatus('signedOut');
        return;
      }
      if (!stored) {
        if (!cancelled) setStatus('signedOut');
        return;
      }

      accessTokenRef.current = stored.accessToken;
      const result = await api.request('/api/auth/session', sessionResponseSchema);
      if (cancelled) return;

      if (result.kind === 'ok') {
        setUser(result.data.user);
        setStatus('signedIn');
        return;
      }

      if (result.kind === 'error') {
        // Any 401 here means "this token is finished" (no_session, session_invalid,
        // account_inactive, session_expired) — the browser never switches on which (US-003
        // design note §4). Forget the browser's own copy so this dead session is not retried
        // on every future boot.
        accessTokenRef.current = undefined;
        try {
          await (onSignOut ?? defaultOnSignOut)();
        } catch {
          // Deliberately swallowed — same as signOut()'s own handling.
        }
        setStatus('signedOut');
        return;
      }

      // unavailable — an outage is not an expiry. The stored session is left exactly as it
      // was; only THIS boot renders as signed out, so a reachable server on the next boot can
      // still succeed (US-003 design note §5.1, step 5).
      accessTokenRef.current = undefined;
      setStatus('signedOut');
    })();

    return () => {
      cancelled = true;
    };
    // Runs once per mount, deliberately: this is the boot sequence, not a re-checkable effect.
  }, []);

  const signIn = useCallback<AuthContextValue['signIn']>(
    async (email, password, signal) => {
      const result: ApiResult<{ session: Session; user: AuthenticatedUser }> = await api.request(
        '/api/auth/sign-in',
        signInResponseSchema,
        { method: 'POST', body: { email, password }, ...(signal ? { signal } : {}) },
      );

      if (result.kind === 'unavailable') return { kind: 'unavailable' };

      if (result.kind === 'error') {
        // Every 4xx this endpoint can produce is a refusal the screen shows the same way.
        // `invalid_request` should be unreachable — AC-05 stops a malformed body in the
        // browser — but if it ever arrives, showing the refusal beats showing nothing.
        return { kind: 'rejected' };
      }

      await onSession?.(result.data.session);
      accessTokenRef.current = result.data.session.accessToken;
      setUser(result.data.user);
      setStatus('signedIn');
      return { kind: 'ok', user: result.data.user };
    },
    [api, onSession],
  );

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    // 1 — while the token is still available to send (US-002/§6.3's ordering).
    await api.requestNoContent('/api/auth/sign-out', { method: 'POST' });
    // 2 — forget the browser's own copy. Errors here do not stop sign-out from completing.
    try {
      await (onSignOut ?? defaultOnSignOut)();
    } catch {
      // Deliberately swallowed — see the docblock on `signOut`.
    }
    // 3 — clear local state, unconditionally.
    accessTokenRef.current = undefined;
    setUser(undefined);
    setStatus('signedOut');
  }, [api, onSignOut]);

  const setPassword = useCallback<AuthContextValue['setPassword']>(
    async (newPassword) => {
      const result = await api.request('/api/auth/set-password', setPasswordResponseSchema, {
        method: 'POST',
        body: { newPassword },
      });

      if (result.kind === 'ok') {
        // design note §6.4, confirmed against the real Supabase project: the password write
        // revokes the token this very request was authorised with. A fresh one travels in the
        // response exactly when the server's own re-sign-in succeeded; handed to `onSession` and
        // stored the same way `signIn` does, or the very next request 401s.
        if (result.data.session) {
          await onSession?.(result.data.session);
          accessTokenRef.current = result.data.session.accessToken;
        }
        setUser(result.data.user);
        return { kind: 'ok', user: result.data.user };
      }

      if (result.kind === 'error' && result.code === ERROR_CODES.password_same_as_current) {
        return { kind: 'same-as-current' };
      }

      // Every other outcome — 400, 403, 503, a transport failure, an unparseable response —
      // is ST-06's one failure state (design note §7.3).
      return { kind: 'failed' };
    },
    [api, onSession],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, signIn, signOut, setPassword }),
    [user, status, signIn, signOut, setPassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside an AuthProvider');
  return value;
}
