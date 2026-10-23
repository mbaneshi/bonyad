# IFC 4.3 catalogue: sources and licence decision

## Source
- Repository: https://github.com/buildingSMART/IFC4.3.x-development
- Pinned commit: `2b8baa0a14d5ed1a9f99ef9443bdcb63a0cb0ab1`
- Schema file: `reference_schemas/IFC4x3_RC4.exp` (EXPRESS, IFC4X3_RC4, issue date 2021-07-22)
- Descriptions (`meaning`): `docs/schemas` Markdown at the same commit (describes a later state than RC4; the EXPRESS decides shape).
- Harvester: `tools/harvest/ifc/` (reproduction steps in its README). Known gaps: `GAPS.md`. Hand review: `REVIEW.md`.

## Baseline
IFC4X3_RC4 is the baseline. It is the newest EXPRESS file readable in the public repository. The final releases (ADD1, ADD2, 4.3.2.0) are published on standards.buildingsmart.org, which answered a bot challenge (HTTP 403) and were not read. RC4 stays the accepted baseline until buildingSMART consent is obtained or an open-licence release of the final schema is available.

## Licence reasoning
Two statements conflict:
1. The repository `LICENSE.md` is CC BY-ND 4.0 (attribution, NoDerivatives): adaptations may not be shared.
2. The header of the EXPRESS schema file permits translation with full attribution, but requires consent from buildingSMART for changes.

The generated catalogue (one YAML per entity, restructured names, kinds, mapped types) is plausibly an adaptation, so redistributing it is not clearly allowed under either text. Decision:
- The generated YAML in `catalogue/ifc/` is **gitignored and never committed or pushed** (`catalogue/ifc/.gitignore`).
- What is committed: the harvester code, `GAPS.md`, `REVIEW.md` and this file. Anyone can regenerate the YAML locally from the pinned commit.
- Revisit when buildingSMART consent is obtained or the schema is released under an open licence; then the YAML may be committed with proper attribution.

This is an engineering decision, not legal advice.
