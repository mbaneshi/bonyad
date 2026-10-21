import { SQL } from "bun";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { HttpApi } from "../src/api";
import { Store } from "../src/store";

export const REPO = resolve(import.meta.dir, "../..");

export type Env = {
  store: Store;
  apiBase: string;
  api: HttpApi;
  teardown: () => Promise<void>;
};

/** A throwaway database (migrations and seed applied) plus a real Rust API bound to it. */
export async function startEnv(): Promise<Env> {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set. Run the tests through `just agent-check` (it reads the local stack's .env).");

  const name = `bonyad_agent_test_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const admin = new SQL(base);
  await admin.unsafe(`create database ${name}`);
  const url = new URL(base);
  url.pathname = `/${name}`;

  const db = new SQL(url.toString());
  for (const dir of ["migrations", "seeds"]) {
    const d = join(REPO, "db", dir);
    for (const f of readdirSync(d).filter((x) => x.endsWith(".sql")).sort()) {
      await db.unsafe(readFileSync(join(d, f), "utf8"));
    }
  }
  await db.close();

  const bin = join(REPO, "logic/target/debug/bonyad-server");
  if (!existsSync(bin)) {
    const b = Bun.spawnSync(["cargo", "build", "-p", "bonyad-server", "--bin", "bonyad-server"], { cwd: join(REPO, "logic"), stderr: "inherit" });
    if (b.exitCode !== 0) throw new Error("cargo build of the API failed");
  }
  const port = await freePort();
  const proc = Bun.spawn([bin], {
    env: { ...process.env, DATABASE_URL: url.toString(), BONYAD_BIND: `127.0.0.1:${port}` },
    stdout: "ignore",
    stderr: "ignore",
  });
  const apiBase = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${apiBase}/healthz`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (i > 100) throw new Error("the API did not start");
    await Bun.sleep(100);
  }

  const store = Store.connect(url.toString());
  return {
    store,
    apiBase,
    api: new HttpApi(apiBase),
    teardown: async () => {
      proc.kill();
      await proc.exited;
      await store.close();
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.close();
    },
  };
}

async function freePort(): Promise<number> {
  const s = Bun.serve({ port: 0, fetch: () => new Response("") });
  const p = s.port as number;
  await s.stop(true);
  return p;
}

export async function projectEntities(apiBase: string): Promise<any[]> {
  return ((await (await fetch(`${apiBase}/v1/project`)).json()) as any).entities;
}

export async function clearProject(apiBase: string) {
  for (const e of await projectEntities(apiBase)) await fetch(`${apiBase}/v1/entities/${e.id}`, { method: "DELETE" });
}

/** Parse a text/event-stream body into events. */
export async function readSse(res: Response): Promise<{ event: string; data: any }[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .map((frame) => {
      const event = /^event: (.+)$/m.exec(frame)?.[1];
      const data = /^data: (.+)$/m.exec(frame)?.[1];
      return event && data ? { event, data: JSON.parse(data) } : null;
    })
    .filter((x): x is { event: string; data: any } => x !== null);
}
