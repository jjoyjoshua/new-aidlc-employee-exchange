/**
 * The one way this application talks to the server.
 *
 * ADR-001 routes every piece of data through `/api/*`, and ADR-002 makes the browser parse every
 * response against the shared contract at runtime — because a tab loaded before a deploy holds a
 * description that stopped being true, and types are erased at runtime so it has no way to
 * notice. The symptom is not an error; it is `undefined` rendered into a screen.
 *
 * Configured once. REQ-036's refresh-on-focus is a property of this layer rather than a
 * per-screen concern, even though nothing uses it until US-012.
 */
import { errorBodySchema, type ZodType } from '@desk-booking/contracts';

export type ApiResult<T> =
  | { kind: 'ok'; data: T }
  /**
   * The server answered with our error body. Switch on `code`, with a default branch.
   *
   * `details` (US-019/AC-04, ADR-009) is present only where a specific refusal carries a fact the
   * caller must render — undefined for every other error in the system. Passed through UNTYPED;
   * the typed reading lives beside the endpoint that expects it (e.g. `deskBlockedDetailsSchema`),
   * never here — this layer must not learn any one rule's vocabulary.
   */
  | { kind: 'error'; status: number; code: string; message: string; details?: Record<string, unknown> }
  /**
   * The server could not be reached, took too long, answered 5xx, or answered something this
   * build cannot parse. One outcome for all four, on purpose — see `request`.
   */
  | { kind: 'unavailable' };

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken: () => string | undefined;
  timeoutMs: number;
}

export function createApiClient({ baseUrl, getAccessToken, timeoutMs }: ApiClientOptions) {
  /**
   * The half every request shares: attach the bearer, time it out, let a caller abort it, and
   * turn a transport failure into `unavailable`. `request` and `requestNoContent` (US-002)
   * differ only in what a *successful* response means — a body to parse, or none at all — so
   * that is the only thing left to each of them.
   */
  async function send(
    path: string,
    init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  ): Promise<{ kind: 'response'; response: Response } | { kind: 'unavailable' }> {
    // Two reasons a request ends early: the caller cancelled it (US-001/AC-06's double-submit
    // guard) or it ran out of time (US-001/D-06). Both must abort the same fetch.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    init.signal?.addEventListener('abort', () => controller.abort());

    const headers = new Headers({ 'content-type': 'application/json' });
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers,
        signal: controller.signal,
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      return { kind: 'response', response };
    } catch {
      // Network failure, DNS failure, timeout, or the caller's own abort. None of them are an
      // answer about the request, so none of them may read as a rejection (AC-07).
      return { kind: 'unavailable' };
    } finally {
      clearTimeout(timer);
    }
  }

  /** The error-body mapping every non-2xx response goes through, `request` and `requestNoContent` alike. */
  async function readErrorBody(response: Response): Promise<ApiResult<never>> {
    // 5xx is our side failing, not an answer the user can act on differently from an outage.
    if (response.status >= 500) return { kind: 'unavailable' };

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // A proxy's HTML error page is the realistic version of this.
      return { kind: 'unavailable' };
    }

    const error = errorBodySchema.safeParse(body);
    // An error body we cannot even recognise is not a rejection we can explain. Treating it
    // as one would put an unexplained code in front of a user.
    if (!error.success) return { kind: 'unavailable' };

    return {
      kind: 'error',
      status: response.status,
      code: error.data.code,
      message: error.data.message,
      ...(error.data.details === undefined ? {} : { details: error.data.details }),
    };
  }

  async function request<T>(
    path: string,
    schema: ZodType<T>,
    init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  ): Promise<ApiResult<T>> {
    const sent = await send(path, init);
    if (sent.kind === 'unavailable') return { kind: 'unavailable' };
    const { response } = sent;

    if (!response.ok) return readErrorBody(response);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // A proxy's HTML error page is the realistic version of this.
      return { kind: 'unavailable' };
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      /**
       * **US-001/D-04, closing ADR-002 follow-up 3.** A failed response parse is treated exactly
       * as a 5xx: it lands on the screen's existing service-unavailable state.
       *
       * The alternative — a dedicated "bad response" state on all ten screens — adds copy for a
       * failure the user cannot act on differently. And throwing to an error boundary turns a
       * recoverable condition into a white screen. ST-05's message is already honest about a
       * server that is answering wrongly.
       *
       * The field path is logged because it is the only thing that makes this debuggable; a
       * silent `unavailable` here would be indistinguishable from a real outage in a bug report.
       */
      console.warn('[api] response did not match the contract', {
        path,
        issues: parsed.error.issues.map((issue) => issue.path.join('.')),
      });
      return { kind: 'unavailable' };
    }

    return { kind: 'ok', data: parsed.data };
  }

  /**
   * US-002 — for an endpoint whose success has nothing to say (`204`). Succeeds only on a
   * genuinely empty `2xx` body; anything else on the success path is as much a contract
   * violation as a `204` arriving where `request()` expected a schema-shaped body, and is
   * mapped the same way: `unavailable`.
   */
  async function requestNoContent(
    path: string,
    init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  ): Promise<ApiResult<void>> {
    const sent = await send(path, init);
    if (sent.kind === 'unavailable') return { kind: 'unavailable' };
    const { response } = sent;

    if (!response.ok) return readErrorBody(response);

    const text = await response.text();
    if (text.length > 0) {
      console.warn('[api] expected an empty body, got one', { path });
      return { kind: 'unavailable' };
    }

    return { kind: 'ok', data: undefined };
  }

  return { request, requestNoContent };
}

export type ApiClient = ReturnType<typeof createApiClient>;
