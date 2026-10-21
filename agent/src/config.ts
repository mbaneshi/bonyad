import { z } from "zod";

const int = (def: number) => z.coerce.number().int().positive().default(def);

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  BONYAD_API: z.string().default("http://127.0.0.1:58080"),
  BONYAD_AGENT_BIND: z.string().default("127.0.0.1:58090"),
  BONYAD_ALLOW_NON_LOOPBACK: z.string().optional(),
  BONYAD_MODEL: z.string().default("claude-opus-5-5"),
  BONYAD_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  BONYAD_REFUSAL_FALLBACK: z.enum(["on", "off"]).default("on"),
  BONYAD_MAX_STEPS: int(12),
  BONYAD_MAX_TOOL_CALLS: int(30),
  BONYAD_RUN_TIMEOUT_MS: int(120_000),
  BONYAD_MAX_TOKENS: int(16_000),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const e = Env.parse(env);
  const [host, port] = splitBind(e.BONYAD_AGENT_BIND);
  if (!isLoopback(host) && e.BONYAD_ALLOW_NON_LOOPBACK !== "1") {
    throw new Error(
      `refusing to listen on ${host}: there is no authentication yet. Set BONYAD_ALLOW_NON_LOOPBACK=1 to override.`,
    );
  }
  return {
    databaseUrl: e.DATABASE_URL,
    apiBase: e.BONYAD_API.replace(/\/$/, ""),
    host,
    port,
    model: e.BONYAD_MODEL,
    effort: e.BONYAD_EFFORT,
    refusalFallback: e.BONYAD_REFUSAL_FALLBACK === "on",
    maxTokens: e.BONYAD_MAX_TOKENS,
    limits: { maxSteps: e.BONYAD_MAX_STEPS, maxToolCalls: e.BONYAD_MAX_TOOL_CALLS, wallMs: e.BONYAD_RUN_TIMEOUT_MS },
  };
}

export type Limits = Config["limits"];

function splitBind(bind: string): [string, number] {
  const i = bind.lastIndexOf(":");
  const port = Number(bind.slice(i + 1));
  if (i < 0 || !Number.isInteger(port)) throw new Error(`BONYAD_AGENT_BIND must be host:port, got ${bind}`);
  return [bind.slice(0, i).replace(/^\[|\]$/g, ""), port];
}

export function isLoopback(host: string): boolean {
  return host === "localhost" || host === "::1" || host.startsWith("127.");
}
