/**
 * Opt-in: one REAL Anthropic stream through scenarios 1 and 2, against a throwaway database
 * and the real Rust API. Spends a little money; routine tests never call the provider.
 *   just agent-smoke
 */
import { AnthropicProvider } from "../src/anthropic-provider";
import { loadConfig } from "../src/config";
import type { RunEvent } from "../src/events";
import { runAgent } from "../src/loop";
import { clearProject, projectEntities, startEnv } from "./helpers";

function hasCredential(): boolean {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  try {
    return Bun.spawnSync(["ant", "auth", "status"], { stdout: "ignore", stderr: "ignore" }).success; // an `ant auth login` profile
  } catch {
    return false; // no `ant` CLI installed
  }
}
if (!hasCredential()) {
  console.error("No Anthropic credential found. Export ANTHROPIC_API_KEY (or run `ant auth login`), then `just agent-smoke`.");
  process.exit(2);
}

const cfg = loadConfig({ ...process.env, DATABASE_URL: process.env.DATABASE_URL });
const env = await startEnv();
const results: string[] = [];
const check = (name: string, ok: boolean, extra = "") => results.push(`${ok ? "PASS" : "FAIL"} ${name} ${extra}`);

try {
  await clearProject(env.apiBase);
  const provider = new AnthropicProvider({ model: cfg.model, effort: cfg.effort, maxTokens: cfg.maxTokens, refusalFallback: cfg.refusalFallback, workspaceId: cfg.workspaceId });
  const deps = { store: env.store, provider, api: env.api, limits: cfg.limits };

  const go = async (message: string, conversationId?: string) => {
    const events: RunEvent[] = [];
    let streamed = "";
    const outcome = await runAgent(
      deps,
      { runId: crypto.randomUUID(), message, ...(conversationId ? { conversationId } : {}) },
      (e) => {
        events.push(e);
        if (e.type === "text_delta") streamed += String(e.data.text);
      },
      new AbortController().signal,
    );
    return { outcome, events, streamed };
  };

  const s1 = await go("Create points A(0,0), B(4,0), C(0,3), a line from A to B, and a triangular surface through A, B and C. Tell me the length and area.");
  const ents1 = await projectEntities(env.apiBase);
  const kinds = ents1.map((e) => e.geometry.kind).sort().join(",");
  check("scenario 1 completed", s1.outcome.status === "completed", JSON.stringify(s1.events.at(-1)?.data));
  check("scenario 1 entities", kinds.includes("surface") && kinds.includes("line") && kinds.split(",").filter((k) => k === "point").length >= 3, kinds);
  check("scenario 1 text streamed", s1.streamed.length > 0);
  check("scenario 1 answer has 4 and 6", /4/.test(s1.streamed) && /6/.test(s1.streamed), s1.streamed.slice(-120));

  const s2 = await go("Move B to (8,0) and recalculate the area of the surface and the length of the line.", s1.outcome.conversationId);
  const surface = (await projectEntities(env.apiBase)).find((e) => e.geometry.kind === "surface");
  check("scenario 2 completed", s2.outcome.status === "completed", JSON.stringify(s2.events.at(-1)?.data));
  check("scenario 2 surface moved", surface?.geometry.vertices.some((v: any) => v.x === 8 && v.y === 0) === true);
  check("scenario 2 answer has 12", /12/.test(s2.streamed), s2.streamed.slice(-120));
} finally {
  await env.teardown();
}
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
