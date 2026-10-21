// The e2e stack runs on its own ports so it never collides with `just serve` / `just ui`.
export const PORTS = { api: 58180, agent: 58190, ui: 55273 } as const;
export const DB_NAME = "bonyad_e2e";

/** The admin connection (DATABASE_URL) pointed at the throwaway e2e database. */
export function e2eDatabaseUrl(): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set. Run through `just e2e` (it reads the local stack's .env) or export it (CI does).");
  const url = new URL(base);
  url.pathname = `/${DB_NAME}`;
  return url.toString();
}
