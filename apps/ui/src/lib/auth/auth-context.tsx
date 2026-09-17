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
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
  /** Overridden in tests. Defaults to the real client. */
  client?: ApiClient;
  /** Where the session goes on success. Defaults to the browser's Supabase client. */
  onSession?: (session: Session) => void | Promise<void>;
}

const defaultClient = () =>
  createApiClient({
    baseUrl: import.meta.env['VITE_API_BASE_URL'] ?? '',
    // US-001 has no stored session to read yet; US-003 is the story that gives this a body.
    getAccessToken: () => undefined,
    timeoutMs: 10_000,
  });

export function AuthProvider({ children, client, onSession }: AuthProviderProps) {
  const [user, setUser] = useState<AuthenticatedUser | undefined>(undefined);
  const api = useMemo(() => client ?? defaultClient(), [client]);

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
      setUser(result.data.user);
      return { kind: 'ok', user: result.data.user };
    },
    [api, onSession],
  );

  const value = useMemo<AuthContextValue>(() => ({ user, signIn }), [user, signIn]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside an AuthProvider');
  return value;
}
