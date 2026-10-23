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

The generated catalogue (one YAML per entity, restructured names, kinds, mapped types) is plausibly an adaptation, so whether redistributing it is allowed under either text is not settled. Decision (2026-10-23, issue #54):
- The maintainer decided the generated YAML is safe to publish, and `catalogue/ifc/*.yaml` is now committed. No written consent from buildingSMART was obtained; this is the maintainer's risk decision, not a licence grant.
- Attribution: the entities, attribute names, enumerations and descriptions derive from buildingSMART International's IFC 4.3 documentation. See `NOTICE`.
- An earlier commit (`c1b26c7`) briefly pushed this YAML to a public branch before it was removed; the maintainer accepts that exposure.
- If buildingSMART objects, remove `catalogue/ifc/*.yaml` and restore the ignore rule; the harvester regenerates everything from the pinned commit.

This is an engineering decision, not legal advice.
