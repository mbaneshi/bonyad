import type { BuiltCall, Route } from "./tools";

export type ApiOutcome = {
  ok: boolean;
  /** 0 when no response arrived at all. */
  status: number;
  /** The decoded response body (an entity, a measure, or a problem+json error). */
  body: unknown;
  requestId: string;
};

/** What the loop needs from the Rust API. Tests can substitute their own. */
export interface ApiExecutor {
  execute(route: Route, call: BuiltCall, requestId: string, signal?: AbortSignal): Promise<ApiOutcome>;
}

/** The only write path: the same HTTP API the UI uses. The agent has no database access to it. */
export class HttpApi implements ApiExecutor {
  constructor(
    private readonly base: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  async execute(route: Route, call: BuiltCall, requestId: string, signal?: AbortSignal): Promise<ApiOutcome> {
    let path = route.template;
    for (const [k, v] of Object.entries(call.params)) path = path.replace(`{${k}}`, encodeURIComponent(v));
    // Creates carry a derived id and updates replace whole geometry, so one retry after a
    // transport failure is safe. A delete is not retried: a second one would report not_found.
    const attempts = route.method === "DELETE" ? 1 : 2;
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await this.fetchImpl(this.base + path, {
          method: route.method,
          headers: {
            "x-request-id": requestId,
            ...(call.body !== undefined ? { "content-type": "application/json" } : {}),
          },
          ...(call.body !== undefined ? { body: JSON.stringify(call.body) } : {}),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs),
        });
        const text = await res.text();
        let body: unknown = null;
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            body = { code: "internal_error", detail: "the API returned a body that is not JSON" };
          }
        }
        return { ok: res.ok, status: res.status, body: body ?? { deleted: true }, requestId };
      } catch (err) {
        last = err;
      }
    }
    return {
      ok: false,
      status: 0,
      body: { code: "network", title: "The API could not be reached", detail: String(last) },
      requestId,
    };
  }
}
