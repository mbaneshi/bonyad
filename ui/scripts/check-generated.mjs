// Fails when src/api/generated/schema.d.ts is not what the contract generates.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "bonyad-gen-")), "schema.d.ts");
execFileSync("pnpm", ["exec", "openapi-typescript", "../contracts/openapi.json", "-o", out], { stdio: "ignore" });
const same = readFileSync(out, "utf8") === readFileSync("src/api/generated/schema.d.ts", "utf8");
if (!same) {
  console.error("src/api/generated/schema.d.ts is stale: run `pnpm gen:api` and commit it.");
  process.exit(1);
}
console.log("generated client is current");
