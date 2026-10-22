/** Downloads pinned sources into .cache/ and verifies sha256 against sources.lock.json.
 *  `bun run fetch` verifies; `bun run fetch --update-lock` (re)writes the lock. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { PINS, WEB, rawUrl } from "./sources";

export const ROOT = join(import.meta.dir, "..");
export const CACHE = process.env.GIS_HARVEST_CACHE ?? join(ROOT, ".cache");
const LOCK = join(ROOT, "sources.lock.json");

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export async function ensure(update: boolean): Promise<void> {
  const lock: Record<string, string> = existsSync(LOCK) ? JSON.parse(await readFile(LOCK, "utf8")) : {};
  for (const p of PINS) {
    for (const f of p.files) {
      const key = `${p.id}:${f}`;
      const dest = join(CACHE, p.id, f);
      let bytes: Uint8Array;
      if (existsSync(dest)) {
        bytes = new Uint8Array(await readFile(dest));
      } else {
        const res = await fetch(rawUrl(p, f));
        if (!res.ok) throw new Error(`${res.status} for ${rawUrl(p, f)}`);
        bytes = new Uint8Array(await res.arrayBuffer());
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, bytes);
      }
      const h = sha(bytes);
      if (update) lock[key] = h;
      else if (lock[key] !== h) throw new Error(`sha256 mismatch for ${key}: ${h} != ${lock[key]}`);
    }
  }
  for (const w of WEB) {
    const key = `web:${w.file}`;
    const dest = join(CACHE, "web", w.file);
    let bytes: Uint8Array;
    if (existsSync(dest)) bytes = new Uint8Array(await readFile(dest));
    else {
      const res = await fetch(w.url);
      if (!res.ok) throw new Error(`${res.status} for ${w.url}`);
      bytes = new Uint8Array(await res.arrayBuffer());
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, bytes);
    }
    const h = sha(bytes);
    if (update) lock[key] = h;
    else if (lock[key] !== h) throw new Error(`sha256 mismatch for ${key}: ${h} != ${lock[key]}`);
  }
  if (update) await writeFile(LOCK, JSON.stringify(lock, Object.keys(lock).sort(), 2) + "\n");
  console.log(`ok: ${Object.keys(lock).length} pinned files in ${CACHE}`);
}

if (import.meta.main) await ensure(process.argv.includes("--update-lock"));

/** Read a pinned file from the cache (fetch first). */
export async function readSource(id: string, path: string): Promise<string> {
  const p = join(CACHE, id, path);
  if (!existsSync(p)) throw new Error(`missing ${p}; run 'bun run fetch'`);
  return readFile(p, "utf8");
}
