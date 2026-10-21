import { AnthropicProvider } from "./anthropic-provider";
import { FakeProvider } from "./fake-provider";
import { HttpApi } from "./api";
import { loadConfig } from "./config";
import { createHandler } from "./server";
import { Store } from "./store";

const log = (message: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: "INFO", message, ...fields }));

const config = loadConfig();
const store = Store.connect(config.databaseUrl);
await store.ping();
await store.failOrphanedRuns();

// BONYAD_FAKE_SCRIPT=<file.json> replaces the model with a scripted one (a JSON array of
// turns, one per model request; BONYAD_FAKE_LOOP=1 replays it from the start when it runs
// out). It exists for browser tests; never set it for real use.
const fakeScript = process.env.BONYAD_FAKE_SCRIPT;
if (fakeScript) log("WARNING: running with a scripted FakeProvider, not a real model", { script: fakeScript });
const provider = fakeScript
  ? new FakeProvider(JSON.parse(await Bun.file(fakeScript).text()), { loop: process.env.BONYAD_FAKE_LOOP === "1" })
  : new AnthropicProvider({
      model: config.model,
      effort: config.effort,
      maxTokens: config.maxTokens,
      refusalFallback: config.refusalFallback,
    });
const handler = createHandler({ store, provider, api: new HttpApi(config.apiBase), limits: config.limits });

Bun.serve({
  hostname: config.host,
  port: config.port,
  idleTimeout: 120, // SSE streams outlive the default 10s idle limit; heartbeats keep them warm
  fetch: handler.fetch,
});
log("listening", { bind: `${config.host}:${config.port}`, model: config.model, api: config.apiBase });
