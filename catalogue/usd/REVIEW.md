# Review: schema `usd`

10 entries drawn with a seeded shuffle (Python `random.Random(42)` over the sorted file list) and checked by hand against the
`schema.usda` files at the pinned commit `bc32a655a41770f8ded78ef43789b044be1ba5ea`. Date: 2026-10-23. Result: two defects found and fixed; the rest correct. Five of the ten were read field by field against the source (marked *); the other six were checked for kind, base and the fields named below only.

| Entry | Checked against | Result |
|---|---|---|
| `capsule_1` * | `usdGeom/schema.usda` class `Capsule_1` | DEFECT: sentence splitting cut at "i.e." so the type meaning and three field meanings began with "e. ". Fixed in `src/text.ts` (abbreviations are protected); regenerated. Fields, defaults (1, 0.5, 0.5, "Z") and base `gprim` correct. The `_1` suffix is flagged `needs_review`, as the source does not say what it versions. |
| `geom_subset` * | class `GeomSubset` | Enum `elementType` (face, point, edge, segment, tetrahedron) with default `face`; `indices` fallback `[]` kept in the text. OK. |
| `shadow_api` * | `usdLux/schema.usda` class `ShadowAPI` | Five `inputs:shadow:*` properties, defaults (true, black, -1, -1, 1) correct. Kind `object` (API schema). OK. |
| `points` * | class `Points` | `widths` float[], `ids` int64[] -> `bigint`; base `PointBased`. Meaning has a stray space where an HTML link was stripped. OK, cosmetic. |
| `distant_light` | `usdLux` class `DistantLight` | `inputs:angle` default 0.53 is documented "in degrees"; the catalogue keeps the number and says so in the text (format rule 3 asks for radians at the boundary; the source states degrees, so this is flagged for the owner). `needs_review` set. |
| `skeleton_rest_transforms` | `usdSkel` class `Skeleton`, `restTransforms` | `matrix4d[]` becomes ordered child rows of `matrix4`. Row-major vs column-major is not stated in the source; the existing format convention applies. OK. |
| `material_x_config_api` | `usdMtlx` class `MaterialXConfigAPI` | Kind `object`, base `APISchemaBase` as in `inherits`; one text field `config:mtlx:version`. Not read further. |
| `particle_field_kernel_base_api` | `usdVol` class `ParticleFieldKernelBaseAPI` | Kind `object`, base `APISchemaBase`, `apiSchemaType = singleApply`. No fields in source or catalogue. Not read further. |
| `light_api` * | `usdLux` class `LightAPI` | DEFECT: the three `light:materialSyncMode` values had no meanings although the source lists them as `- name: text` bullets. Fixed in `valueMeanings` (unmarked bullets now parsed); 135 value meanings across the catalogue were affected for the better. Properties and defaults correct; built-in `CollectionAPI` instances recorded in notes. OK. |
| `geom_model_api` | `usdGeom` class `GeomModelAPI` | Kind `object`, base `APISchemaBase`; the `model:*` properties are present with enum, bool and vector3 types. Not read further. |

Systemic points, not tied to one entry:

- Tokens without a per-value description get the standard sentence "the schema gives no per-value description" rather than an invented one.
- Array attributes of an abstract class without fields (`PointBased.points` and the like) are flat float arrays on that class (see `GAPS.md`).
- Quaternion component order is not stated in `schema.usda`; those fields are `needs_review`.
