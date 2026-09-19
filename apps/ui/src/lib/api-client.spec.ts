import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from '@desk-booking/contracts';
import { createApiClient } from './api-client.js';

/**
 * US-001/AC-07 and ADR-002 follow-up 3.
 *
 * The three failure shapes this layer has to keep apart:
 *
 *   - the server answered with our error body      -> a typed rejection the screen switches on
 *   - the server could not be reached at all       -> unavailable
 *   - the server answered with something we cannot parse -> ALSO unavailable (US-001/D-04)
 *
 * The third is the one that has no obvious home, which is why ADR-002 asked for it to be
 * decided once here rather than per screen.
 */

const schema = z.object({ value: z.string() });

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const client = (token?: string) =>
  createApiClient({ baseUrl: '', getAccessToken: () => token, timeoutMs: 10_000 });

describe('apiClient — a successful response (US-001/AC-01)', () => {
  it('parses the body through the contract schema (US-001/AC-01)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { value: 'hello' }));

    const result = await client().request('/api/thing', schema);

    expect(result).toEqual({ kind: 'ok', data: { value: 'hello' } });
  });

  it('attaches the bearer token when there is one (US-001/AC-03)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { value: 'hello' }));

    await client('a-token').request('/api/thing', schema);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer a-token');
  });

  it('sends no Authorization header when there is no session (US-001/AC-05)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { value: 'hello' }));

    await client().request('/api/thing', schema);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
  });
});

describe('apiClient — the server rejected us (US-001/AC-04)', () => {
  it('returns a typed rejection carrying the stable code (US-001/AC-04)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { statusCode: 401, code: 'invalid_credentials', message: 'no' }),
    );

    const result = await client().request('/api/thing', schema);

    expect(result).toEqual({ kind: 'error', status: 401, code: 'invalid_credentials', message: 'no' });
  });

  it('accepts a code it has never seen rather than crashing (US-001/AC-07)', async () => {
    // A tab loaded before a deploy must still be able to READ an error from the server that
    // came after it. This is ADR-002's version-skew failure pointed the other way.
    fetchMock.mockResolvedValue(
      jsonResponse(429, { statusCode: 429, code: 'rate_limited', message: 'slow down' }),
    );

    const result = await client().request('/api/thing', schema);

    expect(result.kind).toBe('error');
    expect(result.kind === 'error' && result.code).toBe('rate_limited');
  });

  it('passes an optional details object through untyped (US-019/AC-04, ADR-009)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        statusCode: 422,
        code: 'desk_has_upcoming_bookings',
        message: 'x',
        details: { upcomingBookings: 3 },
      }),
    );

    const result = await client().request('/api/thing', schema);

    expect(result.kind === 'error' && result.details).toEqual({ upcomingBookings: 3 });
  });

  it('leaves details undefined when the body carries none — every other error body is unaffected (US-019/AC-04, ADR-009)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { statusCode: 401, code: 'invalid_credentials', message: 'no' }),
    );

    const result = await client().request('/api/thing', schema);

    expect(result.kind === 'error' && result.details).toBeUndefined();
  });
});

describe('apiClient — the service is unavailable (US-001/AC-07)', () => {
  it('maps a transport failure to unavailable (US-001/AC-07)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await client().request('/api/thing', schema);

    expect(result).toEqual({ kind: 'unavailable' });
  });

  it('maps a 500 to unavailable, not to a rejection (US-001/AC-07)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, { statusCode: 500, code: 'internal_error', message: 'oops' }),
    );

    const result = await client().request('/api/thing', schema);

    expect(result).toEqual({ kind: 'unavailable' });
  });

  it('maps a 503 to unavailable (US-001/AC-07)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(503, { statusCode: 503, code: 'service_unavailable', message: 'down' }),
    );

    const result = await client().request('/api/thing', schema);

    expect(result).toEqual({ kind: 'unavailable' });
  });

  it('maps a response that fails the schema to unavailable (US-001/D-04)', async () => {
    // ADR-002 follow-up 3, decided once here: a server answering WRONGLY is honestly described
    // by "we can't reach the booking service right now". It is not a crash and not a white
    // screen, and it needs no new state and no new copy on any of the ten screens.
    fetchMock.mockResolvedValue(jsonResponse(200, { value: 42 }));

    const result = await client().request('/api/thing', schema);

    expect(result).toEqual({ kind: 'unavailable' });
  });

  it('maps a body that is not JSON at all to unavailable (US-001/AC-07)', async () => {
    // A proxy's HTML error page is the realistic version of this.
    fetchMock.mockResolvedValue(new Response('<html>502 Bad Gateway</html>', { status: 200 }));

    const result = await client().request('/api/thing', schema);

    expect(result).toEqual({ kind: 'unavailable' });
  });

  it('maps an error body that is not our error shape to unavailable (US-001/AC-07)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'something else entirely' }));

    const result = await client().request('/api/thing', schema);

    expect(result).toEqual({ kind: 'unavailable' });
  });
});

/**
 * US-002/FR-14 — `requestNoContent` shares transport, timeout, abort and error mapping with
 * `request`; it differs only in succeeding on a genuinely empty response instead of parsing one
 * against a schema. US-002 is the first story that sends a `204`.
 */
describe('apiClient.requestNoContent — a 204 succeeds (US-002/AC-02)', () => {
  it('resolves ok on an empty 204 (US-002/AC-02)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const result = await client().requestNoContent('/api/auth/sign-out', { method: 'POST' });

    expect(result).toEqual({ kind: 'ok', data: undefined });
  });

  it('attaches the bearer token, same as request() (US-002/AC-02)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await client('a-token').requestNoContent('/api/auth/sign-out', { method: 'POST' });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer a-token');
  });

  it('maps a transport failure to unavailable, same as request() (US-002)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await client().requestNoContent('/api/auth/sign-out', { method: 'POST' });

    expect(result).toEqual({ kind: 'unavailable' });
  });

  it('maps a 5xx to unavailable rather than success (US-002)', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 500, code: 'internal_error', message: 'oops' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await client().requestNoContent('/api/auth/sign-out', { method: 'POST' });

    expect(result).toEqual({ kind: 'unavailable' });
  });

  it('maps our error body on a 4xx to a typed rejection (US-002)', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 401, code: 'no_session', message: 'no' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await client().requestNoContent('/api/auth/sign-out', { method: 'POST' });

    expect(result).toEqual({ kind: 'error', status: 401, code: 'no_session', message: 'no' });
  });

  it('treats an unexpected non-empty 2xx body as unavailable, not as success (US-002)', async () => {
    // A 204 arriving where a schema was expected is a contract violation on `request()`;
    // a BODY arriving where 204-or-empty was expected is the same violation the other way.
    fetchMock.mockResolvedValue(new Response('{"unexpected":true}', { status: 200 }));

    const result = await client().requestNoContent('/api/auth/sign-out', { method: 'POST' });

    expect(result).toEqual({ kind: 'unavailable' });
  });
});

describe('apiClient — the request takes too long (US-001/AC-07, NFR-02)', () => {
  it('aborts after the timeout and reports unavailable (US-001/AC-07)', async () => {
    // No NFR names a client timeout, so AC-07's "times out" clause would be untestable without
    // one. 10s is long enough not to cut off a slow phone connection (US-001/D-06).
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );

    const pending = createApiClient({
      baseUrl: '',
      getAccessToken: () => undefined,
      timeoutMs: 20,
    }).request('/api/thing', schema);

    await expect(pending).resolves.toEqual({ kind: 'unavailable' });
  });

  it('passes an abort signal so a caller can cancel in flight (US-001/AC-06)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { value: 'hello' }));

    await client().request('/api/thing', schema);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
