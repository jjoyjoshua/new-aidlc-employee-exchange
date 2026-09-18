/**
 * US-001's slice of the wire contract, and nothing else.
 *
 * Wire casing is camelCase everywhere; the database is snake_case and the mapping happens in
 * the module's response builder (`app-architecture.md`, ADR-002).
 */
import { z } from 'zod';
import { newPasswordSchema } from './password.js';

/** `db-design.md` §1.1 — the `user_role` enum. */
export const userRoleSchema = z.enum(['employee', 'admin']);
export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * The one definition of "a plausible sign-in submission".
 *
 * The browser parses with it for US-001/AC-05; the route parses with it at the edge. The *same
 * object* — which is the concrete payoff of ADR-002 on the very first story.
 *
 * Email is trimmed (US-001 edge cases, matching the treatment BR-001.8 gives desk numbers).
 * The password is never trimmed, normalised or case-folded.
 *
 * **V-12 is deliberately not applied here.** V-12 is the policy for *setting* a password
 * (REQ-018, REQ-021, US-004). Enforcing it at sign-in would make a 5-character attempt return
 * `400` while a wrong 12-character attempt returns `401` — a distinguishable path that tells an
 * attacker the policy, and it would lock out any account whose stored credential predates a
 * policy change. `max(200)` is a wire bound against a pathological body, not a rule.
 */
export const signInRequestSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, 'Enter your email address')
      .email('Enter a valid email address'),
    password: z.string().min(1, 'Enter your password').max(200),
  })
  .strict();
export type SignInRequest = z.infer<typeof signInRequestSchema>;

export const sessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  /** Seconds since the epoch, as Supabase reports it. */
  expiresAt: z.number().int().positive(),
});
export type Session = z.infer<typeof sessionSchema>;

export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  role: userRoleSchema,
  /**
   * Shipped from US-001 although US-004 is what acts on it. A changed response shape is Complex
   * by `ai/standards/task-surfaces.md`; adding one boolean later would re-tier a story that
   * would otherwise be Medium, for no reason (US-001/D-08).
   */
  mustChangePassword: z.boolean(),
});
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

/**
 * Responses are **not** `.strict()`.
 *
 * `.strict()` on a response would mean a server that adds a field breaks every tab loaded before
 * the deploy — turning a harmless additive change into an outage. Zod's default `.strip()` still
 * catches the skew ADR-002 protects against: a field that disappeared or changed type. This
 * asymmetry is the rule for all forty endpoints, not a US-001 quirk.
 */
export const signInResponseSchema = z.object({
  session: sessionSchema,
  user: authenticatedUserSchema,
});
export type SignInResponse = z.infer<typeof signInResponseSchema>;

export const sessionResponseSchema = z.object({ user: authenticatedUserSchema });
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/**
 * `POST /api/auth/set-password` (US-004). One field: the confirm field never leaves the
 * browser (design note §2.2 — the server cannot make that guarantee any better than the
 * browser can, and sending it would double the plaintext copies of the credential in the
 * request). The account is the bearer token's; there is no identifier in the body.
 */
export const setPasswordRequestSchema = z.object({ newPassword: newPasswordSchema }).strict();
export type SetPasswordRequest = z.infer<typeof setPasswordRequestSchema>;

/**
 * `{ user }`, plus an **optional** fresh `session` (design note §6.4).
 *
 * Confirmed 2026-09-18 against the real Supabase project: `auth.admin.updateUserById` revokes
 * the caller's existing access token. Without a replacement, AC-07's "continues straight into
 * the product" would fail on the very next request. `session` is present when the server's own
 * re-sign-in with the new password succeeded; if it could not for any reason, the browser's next
 * request simply `401`s and the session guard returns the user to sign-in, where the new
 * password already works (AC-06) — degraded, never a lockout.
 */
export const setPasswordResponseSchema = z.object({
  user: authenticatedUserSchema,
  session: sessionSchema.optional(),
});
export type SetPasswordResponse = z.infer<typeof setPasswordResponseSchema>;
