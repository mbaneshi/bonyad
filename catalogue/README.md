# The catalogue

Bonyad describes every engineering entity ONCE, in a neutral YAML file, and generates everything else from
it. The format is `FORMAT.md`; the tool is `tools/catalogue` (bun + strict TypeScript + Zod).

```
catalogue/<schema>/<table>.yaml        what an entity is, field by field, with its source   (hand/harvester written)
        |
        |  bun run validate <dir>     Zod schema + cross-file checks (bases, parents, names, refs)
        v
tools/catalogue  generate-all
        |
        +-- db/generated/<schema>/<schema>.sql            tables in the history-table pattern
        +-- db/generated/<schema>/<schema>.catalogue.sql  core.source / core.entity_type / core.field_doc rows
        +-- docs/design/db/generated/<schema>.dbml        diagram
        +-- logic/generated/<schema>/                     Rust crate: pure domain types + sqlx row types
        +-- catalogue/COVERAGE.md                         types, fields, kinds, fidelity, needs_review per schema
```

Everything under a `generated/` directory and `COVERAGE.md` is output: never edit it by hand, change the YAML
and regenerate. Generation is deterministic (sorted, rustfmt-formatted); `just catalogue-check` fails if the
committed output is not what the generator produces now.

## Commands

```bash
just catalogue-check      # validate catalogue/, generated files are current, bun test
just catalogue-generate   # regenerate everything, then commit the result
just catalogue-golden     # golden test against scratch databases in the bonyad-db container
just logic-check          # lints the generated Rust (fmt, clippy -D warnings, tests)

cd tools/catalogue
bun run validate ../../catalogue/ifc          # file and reason for every error, non-zero exit on errors
bun run generate ../../catalogue/ifc          # one schema (add --out <dir> to write elsewhere, --check to only compare)
bun run generate-all
bun test                                      # the quality gate for the tool (no tsc gate)
```

## What the generated SQL looks like

The exact pattern of migration `20261023000005_phase1_entity_spine.sql` (the golden test proves it for the
16 `acad` tables):

- every entity table is keyed `(entity_id, revision_id)`; a `kind` column pins the table's own type code
  (`check (kind = 'x.y')`) and a composite foreign key points at `core.entity_version`, or at the base type's
  table when the type derives from one (then only the type's own fields are in the table);
- a base type (or a concrete type with subtypes) has `type_code` with a CHECK listing its concrete subtypes
  and `unique (entity_id, revision_id, type_code)`;
- child tables are keyed `(entity_id, revision_id, position)` and cascade from the parent row;
- floats and measures are `core.finite`; composites expand to `_x/_y/_z`, matrix4 to `_m00`..`_m33`;
  refs are `uuid` with a foreign key to `core.entity(id) on delete cascade`;
- append-only triggers (`core.forbid_history_rewrite`), table and column comments.

The `core` spine must already exist (it is in the migration; the generated SQL does not recreate it).

## Adding an entity type

1. Read the source (public, machine-readable only). Write `catalogue/<schema>/<table>.yaml` per `FORMAT.md`.
   Never invent; mark doubt with `needs_review: true`.
2. `just catalogue-generate`, look at the diff, `just catalogue-check`, commit YAML and generated output together.
3. Provenance: add the source to `catalogue/<schema>/SOURCES.md`, list gaps in `GAPS.md`, spot-check in `REVIEW.md`.

## Evolution rule (while there is no real data)

Applied migrations are never edited. The generated SQL under `db/generated/` is the *current full description*
of a schema; it is not itself applied by `sqlx migrate`. When a schema is first adopted, its generated SQL is
copied into a NEW migration (`db/migrations/<timestamp>_<schema>.sql`). Changing a schema later means a new
generation: regenerate, and write a NEW migration that moves the live database there (drop and recreate while
the database holds only lab data, an `alter` migration once it holds real data). Never edit a migration that has
been applied, and never apply generated SQL straight to the working database.

## The golden test

`catalogue/_golden/acad/` restates the 16 hand-written `acad` tables of migration `20261023000005`.
`catalogue/_golden/features/` is a synthetic fixture that exercises what `acad` does not (multi-level
hierarchy, `type_code` tables, every field type, nullable composites, SQL/Rust reserved words).
Golden output is generated under `_golden/` paths (`db/generated/_golden/`, `logic/generated/golden-*`) so it
never collides with a real schema of the same name.

`tools/catalogue/scripts/golden-equivalence.sh` (`just catalogue-golden`):

1. creates two scratch databases in `bonyad-db` (never touching `postgres`) and drops them on exit;
2. `ref` gets the whole migration; `gen` gets the migration's `core` part plus the generated `acad.sql`;
3. fingerprints both with `schema-fingerprint.sql` (columns with type, domain, nullability, default and position;
   primary key, unique, foreign key and check constraints as Postgres prints them; triggers) and requires the
   fingerprints to be equal. Constraint names are ignored; the order of values inside an `in (...)` list is not
   significant;
4. applies the `features` fixture and its seed rows and smoke-tests it (wrong-table row refused, check enforced,
   history is append-only); applies the seed twice to prove it is idempotent.
