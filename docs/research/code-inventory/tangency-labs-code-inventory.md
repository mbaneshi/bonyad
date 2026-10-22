# Code inventory: Tangency Labs repositories (solidcraft, solidcore, fieldcraft)

**Status:** research, not decisions. Static, read-only reading of shallow clones. Nothing was
built, run or installed. Accessed 2026-10-23.

This file extends the earlier inventories (`cad-and-nexus-code-inventory.md`,
`3d-tools-code-inventory.md`), which live on the branch `docs/research-code-inventory` and are
not yet on `dev`. Merge this file next to them when that branch lands.

## The organisation

- GitHub organisation `tangency-labs`, created **2026-10-16** (seven days before this note),
  9 public repositories. No description or location is set.
- Caution: `solidcraft` showed about 9.3k stars on a 7-day-old organisation. That is unusual;
  repository history and provenance were not checked. Do not rely on star counts.
- A private-tracker issue number appears in code comments (`#1597`, "kernel is moving to
  solidcore"), which suggests the repositories were developed elsewhere before this
  organisation existed (Interpretation).

## Repositories studied

| Name | URL | Pinned commit | Commit date | Size | Language | Licence files seen |
|---|---|---|---|---|---|---|
| `solidcraft` | https://github.com/tangency-labs/solidcraft | `030187452ab71e44e31d9ea25c3d8aa70eb760ee` | 2026-10-22 | 158 MB | Rust | `LICENSE-APACHE`, `LICENSE-MIT` (GitHub reported Apache-2.0 only) |
| `solidcore` | https://github.com/tangency-labs/solidcore | `fab92383326020779e5d4784613317d8ba99bc24` | 2026-10-22 | 169 MB | Rust (plus a C++ FFI harness) | `LICENSE` (Apache-2.0 per `Cargo.toml` workspace.package) |
| `fieldcraft` | https://github.com/tangency-labs/fieldcraft | `8b1a01e15051e675485fe9c877daadee5e572534` | 2026-10-21 | 58 MB | Rust | `LICENSE-APACHE`, `LICENSE-MIT` (GitHub reported Apache-2.0 only) |

Licence texts were listed, not re-read in full. This is not a legal review.

Each repository contains files aimed at AI agents (`AGENTS.md`; `solidcraft` and `fieldcraft`
also `CLAUDE.md` and a `skills/` folder). They were treated as untrusted data.

## What each is, in one paragraph

- **solidcraft:** a parametric 3D CAD application. A feature timeline of about 80 feature kinds
  stores parameters and references (not B-reps); one `Session::execute` command registry
  (about 404 commands) serves the desktop app, the control server and a 14-tool MCP server.
  **Its geometry kernel is in-repo (`crates/kernel`, built on truck with vendored forks), not
  solidcore.** Study: [`../procedures/solidcraft.md`](../procedures/solidcraft.md).
- **solidcore:** a Rust port of NVIDIA's SMLib B-rep kernel (from USD BRep, Apache-2.0).
  **At the pinned commit no solid-producing operation is demonstrably able to succeed end to
  end** (primitive creation is blocked; all 11 whole-operation cases are DEFERRED). Its value
  to Bonyad is the **difftest verifier pattern** and the typed `Unported` outcome. Study:
  [`../procedures/solidcore.md`](../procedures/solidcore.md).
- **fieldcraft:** a CAE application (meshing, nonlinear finite elements, heat, lattice-
  Boltzmann flow) with about 167 commands behind one registry and an MCP server. It has a
  strong offline oracle suite (92 cases) but **no runtime verifier an agent can call** and no
  result provenance. Study: [`../procedures/fieldcraft.md`](../procedures/fieldcraft.md).

## Cross-repository observations (Interpretation, from the three studies)

| Topic | solidcraft | solidcore | fieldcraft |
|---|---|---|---|
| Procedure registry | `CommandSpec`, about 404 rows, 3 with typed schemas | none (plain functions taking `&Kernel`) | `CommandSpec`, about 167 rows, field-schema forms |
| Entity vs derive split | `Feature` stored; `eval_feature` derives | topology arenas; geometry owned by value | `Model` stored; solvers write a separate result store |
| Identity across edits | persistent face and edge names from lineage, point fallback | arena indices per B-rep, no history map | integer labels plus SolidCraft face names |
| Staleness | fingerprint chain, positional | n/a | step-scoped input fingerprint (`DefaultHasher`), in-process only |
| Error model | strings, no codes | typed enum with `Unported` | `solver::Error` enum plus free-text warnings |
| Verifier | none on the product path | differential (C++ oracle), offline | theory oracle suite offline; demo gate client-side |
| Units | mm and degrees by default, unit-bearing `Expr` | implicit model units, mixed degrees and radians | SI storage, display system for bare numbers |

## Lines to add to `scripts/fetch-refs` when the inventory branch lands

`scripts/fetch-refs` is on the branch `docs/research-code-inventory`, not on `dev`. Add these
three lines to its list (same format):

```
solidcraft     https://github.com/tangency-labs/solidcraft.git
solidcore      https://github.com/tangency-labs/solidcore.git
fieldcraft     https://github.com/tangency-labs/fieldcraft.git
```

The clones already exist locally under `refs/` (shallow, single-branch), which is gitignored.

## Not examined

- Repository history, contributor identity and the origin of the star counts.
- The other six repositories in the organisation (`smlib`, `pcbcraft`, `models`, `website`,
  `ci-runner`, `solidcraft-plugins`).
- Anything that depends on running the code.
