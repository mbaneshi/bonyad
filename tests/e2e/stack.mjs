// Starts the whole product for the browser tests, and tears it down again:
//   throwaway database (migrations + seed) -> Rust API -> agent (scripted model) -> UI dev server.
// Playwright runs this as its webServer. Anything it starts is killed on exit, and the
// database is dropped, even when a test fails.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const PORTS = { api: 58180, agent: 58190, ui: 55273 };
const DB_NAME = "bonyad_e2e";

const base = process.env.DATABASE_URL;
if (!base) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const dbUrl = new URL(base);
dbUrl.pathname = `/${DB_NAME}`;

const log = (m) => console.log(`[e2e stack] ${m}`);
const children = [];
let stopping = false;

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
  try {
    const admin = postgres(base, { max: 1 });
    await admin.unsafe(`drop database if exists ${DB_NAME} with (force)`);
    await admin.end();
  } catch (e) {
    console.error("could not drop the e2e database:", String(e));
  }
  process.exit(code);
}
process.on("SIGTERM", () => void stop(0));
process.on("SIGINT", () => void stop(0));

async function waitFor(url, what, ms = 120_000) {
  const until = Date.now() + ms;
  for (;;) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > until) throw new Error(`${what} did not come up at ${url}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

function start(name, cmd, args, opts) {
  const c = spawn(cmd, args, { ...opts, stdio: ["ignore", "inherit", "inherit"] });
  c.on("exit", (code) => {
    if (!stopping) {
      console.error(`[e2e stack] ${name} exited unexpectedly (${code})`);
      void stop(1);
    }
  });
  children.push(c);
}

try {
  // 1. database
  const admin = postgres(base, { max: 1 });
  await admin.unsafe(`drop database if exists ${DB_NAME} with (force)`);
  await admin.unsafe(`create database ${DB_NAME}`);
  await admin.end();
  const db = postgres(dbUrl.toString(), { max: 1 });
  for (const dir of ["migrations", "seeds"]) {
    const d = join(root, "db", dir);
    for (const f of readdirSync(d).filter((x) => x.endsWith(".sql")).sort()) {
      await db.unsafe(readFileSync(join(d, f), "utf8"));
    }
  }
  await db.end();
  log("database ready");

  // 2. API (CI builds it first; locally build on demand)
  const bin = join(root, "logic/target/debug/bonyad-server");
  if (!existsSync(bin)) {
    log("building the API (first run)");
    const b = spawnSync("cargo", ["build", "-p", "bonyad-server", "--bin", "bonyad-server"], { cwd: join(root, "logic"), stdio: "inherit" });
    if (b.status !== 0) throw new Error("cargo build failed");
  }
  const env = { ...process.env, DATABASE_URL: dbUrl.toString() };
  start("api", bin, [], { env: { ...env, BONYAD_BIND: `127.0.0.1:${PORTS.api}` } });
  await waitFor(`http://127.0.0.1:${PORTS.api}/healthz`, "the API");

  // 3. agent with a scripted model that replays the same scenarios forever
  start("agent", "bun", ["src/main.ts"], {
    cwd: join(root, "agent"),
    env: {
      ...env,
      BONYAD_API: `http://127.0.0.1:${PORTS.api}`,
      BONYAD_AGENT_BIND: `127.0.0.1:${PORTS.agent}`,
      BONYAD_FAKE_SCRIPT: join(here, "fixtures/agent-script.json"),
      BONYAD_FAKE_LOOP: "1",
    },
  });
  await waitFor(`http://127.0.0.1:${PORTS.agent}/healthz`, "the agent");

  // 4. UI
  start("ui", "pnpm", ["exec", "vite"], {
    cwd: join(root, "ui"),
    env: {
      ...process.env,
      BONYAD_API: `http://127.0.0.1:${PORTS.api}`,
      BONYAD_AGENT: `http://127.0.0.1:${PORTS.agent}`,
      BONYAD_UI_PORT: String(PORTS.ui),
    },
  });
  await waitFor(`http://127.0.0.1:${PORTS.ui}/`, "the UI");
  // Vite pre-bundles dependencies on first start; a page loaded before that finishes is reloaded
  // under the test's feet. Wait until the entry module already imports the bundled dependencies.
  const warmUntil = Date.now() + 60_000;
  for (;;) {
    const entry = await (await fetch(`http://127.0.0.1:${PORTS.ui}/src/main.tsx`)).text();
    if (entry.includes("/node_modules/.vite/deps/")) break;
    if (Date.now() > warmUntil) throw new Error("the UI's dependencies were not pre-bundled in time");
    await new Promise((r) => setTimeout(r, 250));
  }
  log("ready");
} catch (e) {
  console.error(String(e));
  await stop(1);
}
// keep running until Playwright stops us
setInterval(() => {}, 1 << 30);
