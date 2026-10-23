#!/usr/bin/env bun
// bun run validate <dir>...     validate every YAML under the directories
// bun run generate <schema-dir> [--out <root>] [--check]
// bun run generate-all [--out <root>] [--check]
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { generateCoverage, type CoverageSection } from "./coverage.ts";
import { loadModels, type FileProblem, type Model } from "./model.ts";
import { REPO_ROOT, buildOutputs } from "./outputs.ts";

function report(problems: FileProblem[]): void {
  for (const p of problems) console.error(`${p.file}: ${p.reason}`);
}

function parseFlags(args: string[]): { positional: string[]; out: string; check: boolean } {
  const positional: string[] = [];
  let out = REPO_ROOT;
  let check = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === "--out") out = resolvePath(args[++i] ?? "");
    else if (a === "--check") check = true;
    else positional.push(a);
  }
  return { positional, out, check };
}

/** Write (or, with check, compare) generated files; returns the paths that differ. */
function sync(root: string, files: Map<string, string>, check: boolean): string[] {
  const differing: string[] = [];
  for (const [rel, content] of [...files.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const abs = join(root, rel);
    const current = existsSync(abs) ? readFileSync(abs, "utf8") : undefined;
    if (current === content) continue;
    differing.push(rel);
    if (!check) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
  }
  return differing;
}

function schemaDirs(catalogueRoot: string): { dir: string; golden: boolean }[] {
  const dirs: { dir: string; golden: boolean }[] = [];
  const subdirs = (d: string) =>
    readdirSync(d)
      .sort()
      .filter((n) => statSync(join(d, n)).isDirectory());
  if (!existsSync(catalogueRoot)) return dirs;
  for (const n of subdirs(catalogueRoot)) {
    if (n === "_golden") for (const g of subdirs(join(catalogueRoot, n))) dirs.push({ dir: join(catalogueRoot, n, g), golden: true });
    else if (!n.startsWith("_") && !n.startsWith(".")) dirs.push({ dir: join(catalogueRoot, n), golden: false });
  }
  return dirs;
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  const { positional, out, check } = parseFlags(rest);

  if (cmd === "validate") {
    if (positional.length === 0) {
      console.error("usage: bun run validate <dir>...");
      return 2;
    }
    let types = 0;
    const all: FileProblem[] = [];
    for (const dir of positional) {
      const r = loadModels(resolvePath(dir));
      all.push(...r.problems);
      types += r.models.reduce((a, m) => a + m.types.length, 0);
    }
    if (all.length > 0) {
      report(all);
      console.error(`FAILED: ${all.length} problem(s)`);
      return 1;
    }
    console.log(`OK: ${types} type(s) valid`);
    return 0;
  }

  if (cmd === "generate") {
    const dir = positional[0];
    if (!dir) {
      console.error("usage: bun run generate <schema-dir> [--out <root>] [--check]");
      return 2;
    }
    const abs = resolvePath(dir);
    const r = loadModels(abs);
    if (r.problems.length > 0) {
      report(r.problems);
      return 1;
    }
    const golden = abs.split("/").includes("_golden");
    const files = new Map<string, string>();
    for (const m of r.models) for (const [k, v] of await buildOutputs(m, golden)) files.set(k, v);
    const diff = sync(out, files, check);
    for (const d of diff) console.log(`${check ? "differs" : "wrote"}: ${d}`);
    return check && diff.length > 0 ? 1 : 0;
  }

  if (cmd === "generate-all") {
    const catalogueRoot = resolvePath(positional[0] ?? join(REPO_ROOT, "catalogue"));
    const files = new Map<string, string>();
    const real: Model[] = [];
    const fixtures: Model[] = [];
    const problems: FileProblem[] = [];
    for (const { dir, golden } of schemaDirs(catalogueRoot)) {
      const r = loadModels(dir);
      problems.push(...r.problems);
      for (const m of r.models) {
        (golden ? fixtures : real).push(m);
        if (r.problems.length === 0) for (const [k, v] of await buildOutputs(m, golden)) files.set(k, v);
      }
    }
    if (problems.length > 0) {
      report(problems);
      return 1;
    }
    const sections: CoverageSection[] = [
      { title: "Schemas", models: real },
      { title: "Test fixtures (golden)", models: fixtures },
    ];
    files.set("catalogue/COVERAGE.md", generateCoverage(sections));
    const diff = sync(out, files, check);
    for (const d of diff) console.log(`${check ? "differs" : "wrote"}: ${d}`);
    if (check && diff.length > 0) {
      console.error("generated files are out of date: run `cd tools/catalogue && bun run generate-all` and commit");
      return 1;
    }
    if (check) console.log(`OK: ${files.size} generated file(s) are current`);
    return 0;
  }

  console.error("commands: validate <dir>... | generate <schema-dir> [--out root] [--check] | generate-all [catalogue-root] [--out root] [--check]");
  return 2;
}

process.exit(await main());
