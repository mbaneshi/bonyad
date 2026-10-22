# IFC 4.3 harvest

bun + strict TypeScript. Parses the buildingSMART IFC4.3 EXPRESS schema and writes one catalogue YAML per entity type (contract: catalogue format v0), plus `GAPS.md`. Zod validates every entry and the whole set (unique codes, resolvable `base`/`parent`/`ref_to`, unique field names across bases). Gate: `bun test`.

Licence note: the generated YAML is **not committed** (see `catalogue/ifc/SOURCES.md`).

## Reproduce
```bash
git clone https://github.com/buildingSMART/IFC4.3.x-development.git /tmp/ifc43 && git -C /tmp/ifc43 checkout 2b8baa0a14d5ed1a9f99ef9443bdcb63a0cb0ab1
cd tools/harvest/ifc && bun install
bun run src/main.ts /tmp/ifc43/reference_schemas/IFC4x3_RC4.exp /tmp/ifc43/docs/schemas ../../../catalogue/ifc 2b8baa0a14d5ed1a9f99ef9443bdcb63a0cb0ab1 ../../../catalogue/ifc
bun run src/check.ts ../../../catalogue/ifc     # counts: kinds, fields, abstract types, enums
bun test
```
(The downloaded files are untrusted data: only read, never executed.)

## Mapping rules
- `code` = `ifc.` + snake_case of the name without `Ifc` (`IfcAlignment2DHorizontal` -> `ifc.alignment2d_horizontal`). One file per type, named after the table.
- `base` = the single EXPRESS supertype (no IFC entity has two). Base fields are not repeated.
- `kind`: `abstract` = ABSTRACT SUPERTYPE; `entity` = descends from IfcProduct or IfcRepresentationItem; `symbol` = descends from IfcTypeObject, IfcMaterialDefinition, IfcProfileDef, IfcPresentationStyle, IfcPropertySetDefinition or IfcPropertyTemplateDefinition; `object` = the rest (relationships, resources, units, placements...). A judgement, not stated by the schema.
- Field types: REAL/NUMBER -> `float`, INTEGER -> `int`, STRING -> `text`, BINARY -> `blob`, BOOLEAN/LOGICAL -> `bool`; IfcLengthMeasure (and the Positive/NonNegative variants, with `check`) -> `length`; IfcPlaneAngleMeasure -> `angle`; area, volume, ratio likewise; IfcDate -> `date`; IfcDateTime/IfcTimeStamp -> `timestamp`. Enumerations -> `enum` with documented values. Entity references -> `ref` + `ref_to`; entity SELECTs -> `ref` to the common ancestor or `any`.
- Aggregates: of scalars -> `array`; of anything else -> a `child` type `<table>_<attribute>` with a single `item` field (LIST order = row order, SET = unordered, noted in `notes`; the generator supplies the ordinal).
- INVERSE and DERIVE attributes, WHERE/UNIQUE rules, functions: skipped, listed in `notes`/`GAPS.md`.
- `meaning` text comes from the development documentation; nothing is invented. Missing text becomes an explicit placeholder and is listed in `GAPS.md`.
