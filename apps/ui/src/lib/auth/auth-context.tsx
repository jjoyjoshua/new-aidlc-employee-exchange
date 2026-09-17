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
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  signInResponseSchema,
  type AuthenticatedUser,
  type Session,
} from '@desk-booking/contracts';
import { createApiClient, type ApiClient, type ApiResult } from '../api-client.js';

/** What a sign-in attempt tells the screen. The screen maps these to SCR-001's states. */
export type SignInResult =
  | { kind: 'ok'; user: AuthenticatedUser }
  | { kind: 'rejected' }
  | { kind: 'unavailable' };

export interface AuthContextValue {
  user: AuthenticatedUser | undefined;
  signIn(email: string, password: string, signal?: AbortSignal): Promise<SignInResult>;
  /**
   * Ends the session server-side, then forgets it in this tab (US-002). Proceeds to clear
   * `user` regardless of what the server answered — a transport failure must not strand
   * someone on a signed-in screen (US-002/D-04); there is no UI state for a failed sign-out.
   */
  signOut(): Promise<void>;
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
}

const defaultOnSignOut = async (): Promise<void> => {
  const { supabaseBrowserClient } = await import('../supabase-client.js');
  await supabaseBrowserClient.auth.signOut({ scope: 'local' });
};

export function AuthProvider({ children, client, onSession, onSignOut }: AuthProviderProps) {
  const [user, setUser] = useState<AuthenticatedUser | undefined>(undefined);
  /**
   * The access token for the life of this tab, and nothing more durable than that (US-002/§6.2).
   * Reading a session back from storage on a cold boot is US-003's; after a reload this ref is
   * empty, there is no in-memory `user`, and `RequireSession` already redirects to sign-in.
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
  }, [api, onSignOut]);

  const value = useMemo<AuthContextValue>(() => ({ user, signIn, signOut }), [user, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside an AuthProvider');
  return value;
}
