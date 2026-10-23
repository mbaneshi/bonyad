# Catalogue format v0

The contract every harvester follows. One YAML file per entity type, at
`catalogue/<schema>/<table>.yaml`. The catalogue is the single description of an entity: tables, Rust
types, diagrams and seed rows are GENERATED from it (see `README.md`). `tools/catalogue` validates
exactly what this page says (`cd tools/catalogue && bun run validate ../../catalogue`); if the two ever
disagree the validator is the bug, tell the owner.

## Top level

| key | required | meaning |
|---|---|---|
| `code` | yes | `<schema>.<table>`, lowercase `[a-z0-9_]`, starting with a letter. One schema per SOURCE FORMAT: `acad`, `ifc`, `landxml`, `usd`, `gltf`, `gis`. `table` is the snake_case of the source's own name (LINE -> `line`, IfcWall -> `wall`, 3DFACE -> `face3d`). Must equal the file path. |
| `name` | yes | the source's own spelling (`LINE`, `IfcWall`, `Mesh`) |
| `kind` | yes | `entity` (a placed, instantiable thing) / `symbol` (a definition or table entry: layer, block, material, style) / `object` (non-graphical dictionary-like object) / `child` (ordered rows owned by a parent, e.g. vertices) / `abstract` (no instances of its own; a base type, see rule 8) |
| `base` | no | code of the parent type in the SOURCE's own hierarchy, same schema. Base fields are NOT repeated in the child. |
| `parent` | child only | code of the owning type (same schema; must itself have a table and not be a child) |
| `fidelity` | yes | `faithful` (the application's own format, e.g. DXF for AutoCAD) or `proxy` (an open standard the application reads and writes, e.g. IFC for Revit) |
| `source` | yes | `{document, section, url, version, accessed_on, licence}`. `document`, `accessed_on` (`YYYY-MM-DD`) and `licence` are required; `section`, `url`, `version` may be omitted if the source has none. |
| `meaning` | yes | 1 to 2 plain sentences, written for an engineer and an LLM |
| `fields` | yes | list, see below. May be `[]` only for an `abstract` type or a type with a `base`. |
| `needs_review` | no | `true` when you are not sure; say why in `notes` |
| `notes` | no | free text |

No other keys are allowed (a typo is an error, not silently ignored).

## Field

| key | required | meaning |
|---|---|---|
| `name` | yes | snake_case column name, `[a-z][a-z0-9_]*`; unique within the type including its bases |
| `type` | yes | scalars: `text`, `int` (32 bit), `bigint`, `float`, `bool`, `date`, `timestamp` (with time zone). Measures: `length`, `angle` (always radians; convert degrees at the source boundary and say so in `meaning`), `area`, `volume`, `ratio`. Composites (expand to `_x/_y/_z` columns): `point2`, `point3`, `vector3`, `matrix4` (16 columns `_m00` to `_m33`, row-major, index = 4 * row + column; if the source is column-major say so in `meaning`, nothing transposes). `ref` (a stable id of another entity; set `ref_to` to a code or `any`). `enum` (set `values`). `array` (set `of`: a scalar or measure type). `blob` (opaque binary payload, e.g. ACIS data). No JSON columns. |
| `nullable` | no, default false | |
| `default` | no | a literal that fits the type. Composites take a list (`[0, 0, 1]`; matrix4: 16 numbers). `ref`, `array` and `blob` take no default. |
| `unit` | no | for a plain numeric with a unit that is not a measure (e.g. `percent`) |
| `meaning` | yes | one short sentence |
| `source_ref` | no | where the source defines it (DXF group code, IFC attribute position, USD attribute name, XSD path) |
| `ref_to` | for `ref` | a type code, or `any`. Documentation and a Rust-side validity rule; the database stores a plain foreign key to `core.entity(id)` (design call 4 of the phase 1 design). |
| `values` | for `enum` | non-empty list of `{value, meaning}`, values unique. Stored as text with a CHECK. |
| `of` | for `array` | element type (a scalar or measure) |
| `check` | no | one of `positive`, `non_negative`, `non_zero`, `unit_interval`. On a composite it applies to every component. |
| `min`, `max` | no | numeric bounds (inclusive). Either one, or both. Not together with `check`. |
| `min_items` | no | for `array`: minimum number of elements |
| `maps` | no | RESERVED for cross-format mapping later (file exchange). Do not fill it now; the validator refuses a non-empty value. |

## Rules

1. Never invent. Only what the source defines. If the source is unclear, set `needs_review: true` and explain; if you cannot read it at all, list it in `GAPS.md`.
2. Never store derived values (areas, lengths computed from other fields). Authoritative data only.
3. Lengths are in the project's declared unit, angles are radians. Convert at the source boundary and record that in `meaning`.
4. Inheritance: put fields once, on the base type, and point `base` at it.
5. Ordered sub-rows (vertices, control points, faces) are `kind: child` types with `parent`, not arrays, unless they are plain arrays of scalars. A child's key is `(entity_id, revision_id, position)`; `position` is added for you. A child cannot itself be a parent (nested children are not supported yet: model the inner level as an array or as a second child of the same parent).
6. Every type and field carries a `meaning`. A type without a source is invalid.
7. Provenance and licence are part of the data: also write `catalogue/<schema>/SOURCES.md` (every source with URL, version or commit, licence, access date), `GAPS.md` (what you could not cover and why) and `REVIEW.md` (10 randomly chosen entries checked by hand against the source, with the result).
8. **Abstract types.** An `abstract` type with no fields only groups: it gets no table and its subtypes attach to the nearest ancestor that has one. An `abstract` type WITH fields gets a shared table (class-table inheritance) whose `type_code` column lists every concrete subtype; it must have at least one. A concrete type that other types derive from also gets a `type_code` column (its own code is in the list).
9. Reserved column names: `entity_id`, `revision_id`, `kind`, `type_code` (and `position` in a child). If the source has an attribute with one of these names, rename the field and say why in `notes`. Postgres reserved words (`end`, `order`, ...) are fine; they are quoted for you.
10. Coordinates that the source names separately (DXF POINT group codes 10, 20, 30) may be three `length` fields called `x`, `y`, `z`; use a composite when the source treats them as one value.
11. YAML flow style: a `meaning` (or any text) containing a comma, colon or brace inside `{ ... }` must be quoted, otherwise the YAML parser splits it.

## What is generated

For each schema: `db/generated/<schema>/<schema>.sql` (tables), `<schema>.catalogue.sql` (`core.source`, `core.entity_type`, `core.field_doc` seed rows), `docs/design/db/generated/<schema>.dbml`, the Rust crate `logic/generated/<schema>/`, and one line per schema in `catalogue/COVERAGE.md`.
Column mapping: `text` -> `text`, `int` -> `integer`, `bigint` -> `bigint`, `float` and every measure -> `core.finite`, `bool` -> `boolean`, `date` -> `date`, `timestamp` -> `timestamptz`, `ref` -> `uuid` with a foreign key to `core.entity(id)`, `enum` -> `text` with a CHECK, `array` -> `<elem>[]`, `blob` -> `bytea`.

## Example (the golden fixture `catalogue/_golden/acad/line.yaml`)

```yaml
code: acad.line
name: LINE
kind: entity
base: acad.graphic_entity
fidelity: faithful
source: {document: "DXF reference (entities and group codes)", section: "LINE", accessed_on: 2026-10-23, licence: "n/a: test fixture"}
meaning: A straight segment between two 3D points.
fields:
  - {name: start, type: point3, meaning: Start point, source_ref: "group codes 10, 20, 30"}
  - {name: end, type: point3, meaning: End point, source_ref: "group codes 11, 21, 31"}
  - {name: thickness, type: length, default: 0, meaning: Extrusion thickness along the normal, source_ref: "group code 39"}
  - {name: normal, type: vector3, default: [0, 0, 1], meaning: Extrusion direction, source_ref: "group codes 210, 220, 230"}
```

## Changes against the v0 draft the harvesters started from (all additive: valid v0 files stay valid)

1. `abstract` types with fields get a shared table (rule 8); the draft said "never stored".
2. New optional field keys `min`, `max`, `min_items`.
3. `check` applies per component on composites; composite defaults are lists.
4. Rules 5 (child key, no nested children), 9 (reserved names), 10, 11 and the matrix4 column names are spelled out.
5. The validator is strict: unknown keys, a `source` without `licence`/`accessed_on`, or a non-empty `maps` are errors.
