import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateCoverage } from "../src/coverage.ts";
import { loadModels } from "../src/model.ts";
import { buildOutputs, REPO_ROOT } from "../src/outputs.ts";
import { sourceId } from "../src/seed.ts";
import { tempCatalogue, typeYaml } from "./helpers.ts";

const GOLDEN = resolve(REPO_ROOT, "catalogue/_golden");

async function outputsOf(dir: string, golden = true) {
  const r = loadModels(dir);
  expect(r.problems).toEqual([]);
  const files = new Map<string, string>();
  for (const m of r.models) for (const [k, v] of await buildOutputs(m, golden)) files.set(k, v);
  return files;
}

describe("determinism", () => {
  test("generating twice gives byte-identical output", async () => {
    for (const s of ["acad", "features"]) {
      const a = await outputsOf(join(GOLDEN, s));
      const b = await outputsOf(join(GOLDEN, s));
      expect([...a.keys()]).toEqual([...b.keys()]);
      for (const [k, v] of a) expect(b.get(k)).toBe(v);
    }
  });

  test("the CLI writes the same tree twice and the committed files are current", async () => {
    const cli = resolve(import.meta.dir, "../src/cli.ts");
    const run = async (...args: string[]) => {
      const p = Bun.spawn(["bun", cli, ...args], { stdout: "pipe", stderr: "pipe" });
      const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
      return { out, err, code };
    };
    const outA = mkdtempSync(join(tmpdir(), "gen-a-"));
    const outB = mkdtempSync(join(tmpdir(), "gen-b-"));
    expect((await run("generate-all", "--out", outA)).code).toBe(0);
    expect((await run("generate-all", "--out", outB)).code).toBe(0);
    const tree = (d: string): Record<string, string> => {
      const o: Record<string, string> = {};
      const walk = (p: string) => {
        for (const n of readdirSync(p).sort()) {
          const q = join(p, n);
          if (statSync(q).isDirectory()) walk(q);
          else o[q.slice(d.length)] = readFileSync(q, "utf8");
        }
      };
      walk(d);
      return o;
    };
    expect(tree(outA)).toEqual(tree(outB));
    // the second run on top of the first changes nothing (check mode is clean)
    expect((await run("generate-all", "--out", outA, "--check")).code).toBe(0);
    // and what is committed in the repo is what the generator produces now
    const committed = await run("generate-all", "--check");
    expect(committed.err + committed.out).toContain("OK");
    expect(committed.code).toBe(0);
  }, 60_000);
});

describe("SQL shape", () => {
  test("golden acad: key tables follow the history pattern", async () => {
    const sql = (await outputsOf(join(GOLDEN, "acad"))).get("db/generated/_golden/acad/acad.sql") as string;
    expect(sql).toContain("create table acad.line (");
    expect(sql).toContain("kind        text not null default 'acad.line' check (kind = 'acad.line')");
    expect(sql).toContain("foreign key (entity_id, revision_id, kind)\n        references acad.graphic_entity (entity_id, revision_id, type_code) on delete cascade");
    expect(sql).toContain("foreign key (entity_id, revision_id, kind)\n        references core.entity_version (entity_id, revision_id, type_code) on delete cascade");
    expect(sql).toContain("unique (entity_id, revision_id, type_code)");
    expect(sql).toContain("primary key (entity_id, revision_id, position)");
    expect(sql).toContain("foreign key (entity_id, revision_id)\n        references acad.lwpolyline (entity_id, revision_id) on delete cascade");
    expect(sql).toContain("vertex_indices integer[] not null check (cardinality(vertex_indices) >= 3)");
    expect(sql).toContain("create trigger acad_line_append_only before update or delete on acad.line for each row execute function core.forbid_history_rewrite();");
    expect(sql).toContain("scale_z        core.finite not null default 1 check (scale_z <> 0)");
    expect(sql).toContain("comment on table acad.line is 'LINE: A straight segment between two 3D points.';");
    // base fields are not duplicated in children
    const line = sql.slice(sql.indexOf("create table acad.line ("), sql.indexOf("create table", sql.indexOf("create table acad.line (") + 10));
    expect(line).not.toContain("layer_id");
  });

  test("a multi-level hierarchy attaches to the nearest tabled ancestor and lists every concrete code", async () => {
    const sql = (await outputsOf(join(GOLDEN, "features"))).get("db/generated/_golden/features/features.sql") as string;
    expect(sql).not.toContain("create table features.building_element");
    expect(sql).toContain("'features.beam', 'features.wall', 'features.wall_standard'");
    const wall = sql.slice(sql.indexOf("create table features.wall ("), sql.indexOf("create table features.wall_layer"));
    expect(wall).toContain("type_code in (");
    expect(wall).toContain("'features.wall', 'features.wall_standard'");
    expect(wall).toContain("references features.element (entity_id, revision_id, type_code)");
    expect(sql).toContain("end_x");
    expect(sql).toContain('"order"');
  });

  test("enum, array, ref, date, blob and matrix4 columns", async () => {
    const sql = (await outputsOf(join(GOLDEN, "features"))).get("db/generated/_golden/features/features.sql") as string;
    expect(sql).toContain("check (type in ('straight', 'curved', 'polygonal-x', '2d'))");
    expect(sql).toMatch(/tolerances\s+core\.finite\[\] not null/);
    expect(sql).toMatch(/host\s+uuid references core\.entity \(id\) on delete cascade/);
    expect(sql).toMatch(/built_on\s+date,/);
    expect(sql).toMatch(/payload\s+bytea,/);
    expect(sql).toContain("placement_m33");
    expect(sql).toContain("default 'it''s'");
  });
});

describe("seed, coverage and Rust", () => {
  test("seed rows are idempotent and source ids are stable", async () => {
    const seed = (await outputsOf(join(GOLDEN, "acad"))).get("db/generated/_golden/acad/acad.catalogue.sql") as string;
    expect(seed.match(/on conflict/g)).toHaveLength(3);
    const s = { document: "d", accessed_on: "2026-10-23", licence: "l" };
    expect(sourceId("x", s)).toBe(sourceId("x", { ...s }));
    expect(sourceId("x", s)).not.toBe(sourceId("y", s));
    expect(sourceId("x", s)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test("domain types never mention sqlx; rows do", async () => {
    const out = await outputsOf(join(GOLDEN, "features"));
    const domain = out.get("logic/generated/golden-features/src/domain.rs") as string;
    const rows = out.get("logic/generated/golden-features/src/rows.rs") as string;
    expect(domain).not.toContain("sqlx");
    expect(rows).toContain("::sqlx::FromRow");
    expect(domain).toContain("pub r#type: WallType");
    expect(domain).toContain("pub self_: i32");
    expect(domain).toContain('#[serde(rename = "polygonal-x")]');
    expect(domain).toContain("V2d");
  });

  test("coverage counts types, kinds, fidelity and needs_review", () => {
    const root = tempCatalogue({
      "s/a.yaml": typeYaml("s.a", { extra: ["needs_review: true", "notes: unsure about x"] }),
      "s/b.yaml": typeYaml("s.b", { kind: "symbol" }),
    });
    const md = generateCoverage([{ title: "Schemas", models: loadModels(root).models }]);
    expect(md).toContain("| `s` | 2 | 1 | 1 | 0 | 0 | 0 | 2 | 0 | 2 | 2 | 1 |");
    expect(md).toContain("- `s.a`: unsure about x");
  });

  test("an empty catalogue produces a clean report", () => {
    expect(generateCoverage([{ title: "Schemas", models: [] }])).toContain("_No schemas yet._");
  });

  test("two Rust names that collide are refused", async () => {
    const root = tempCatalogue({
      "s/a_row.yaml": typeYaml("s.a_row"),
      "s/a.yaml": typeYaml("s.a", { fields: ["  - {name: b, type: int, meaning: x}"] }),
    });
    const r = loadModels(root);
    expect(r.problems).toEqual([]);
    await expect(buildOutputs(r.models[0] as never, false)).rejects.toThrow("Rust name");
  });
});
