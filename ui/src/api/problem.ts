import type { components } from "./generated/schema";

type Violation = components["schemas"]["Violation"];

/** A failed API call. `status` is 0 when no response arrived at all. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly violations: Violation[] = [],
  ) {
    super(code);
    this.name = "ApiError";
  }
}

/** Reads an RFC 9457 body defensively: anything unexpected still becomes an ApiError. */
export function fromProblem(status: number, body: unknown): ApiError {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const code = typeof b.code === "string" ? b.code : status >= 500 ? "internal_error" : "unknown";
  const violations = Array.isArray(b.violations) ? (b.violations as Violation[]) : [];
  return new ApiError(status, code, violations);
}
