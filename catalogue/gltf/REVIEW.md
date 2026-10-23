# Review: schema `gltf`

10 entries drawn with a seeded shuffle (Python `random.Random(42)` over the sorted file list) and checked by hand against the
JSON Schema files at the pinned commit `7cee0fcddd5730e90d488bfb5aa2e52171483dde`. Date: 2026-10-23. Result: no entry left unfixed; three defects found by this review were fixed in the harvester and the catalogue regenerated.

| Entry | Checked against | Result |
|---|---|---|
| `material_khr_materials_ior` | `KHR_materials_ior/schema/material.KHR_materials_ior.schema.json` | Field, default 1.5 and `float` type correct. DEFECT: the schema's `oneOf` of two ranges (exactly 0, or at least 1) was dropped silently. Fixed: the range is now in the field text ("not enforced"). |
| `mesh_primitive_khr_gaussian_splatting` | KHR_gaussian_splatting schema | Four enums, defaults `perspective` and `cameraDistance` correct; open `string` alternative noted. Value meanings are the neutral "listed in the schema" wording on purpose (extension text withheld). OK. |
| `khr_interactivity_graph_node` | KHR_interactivity `graph.node.schema.json` | Correct, but it owns child rows, so it was promoted from `child` to `object` with `owner` and `index` (format rule 5 forbids nested children). Recorded in its notes. OK. |
| `material_khr_materials_emissive_strength` | KHR_materials_emissive_strength schema | Default 1, minimum 0 -> `non_negative`. OK. |
| `material_pbr_metallic_roughness` | `material.pbrMetallicRoughness.schema.json` | Defaults and `unit_interval` checks correct; `baseColorFactor` is a 4-array, so its default moved into the text (arrays take no default). OK. |
| `camera_orthographic` | `camera.orthographic.schema.json` | All four fields required in the source and non-nullable here; `zfar` exclusiveMinimum 0 -> `positive`, `znear` minimum 0 -> `non_negative`. OK. |
| `animation_sampler` | `animation.sampler.schema.json` | `input` and `output` resolve to `gltf.accessor`; `interpolation` default LINEAR, three values with the schema's own descriptions. OK. |
| `khr_lights_punctual_light_spot` | `KHR_lights_punctual/schema/light.spot.schema.json` | DEFECT: cone angles ("Angle in radians") were typed `float`. Fixed: now `angle`. Ranges (draft-04 boolean `exclusiveMaximum`/`exclusiveMinimum`) read correctly. |
| `mesh_primitive_khr_draco_mesh_compression` | KHR_draco_mesh_compression schema | `bufferView` resolves to `gltf.buffer_view`. Promoted to `object` (owns the attribute rows). OK. |
| `khr_interactivity_graph_event` | KHR_interactivity `graph.event.schema.json` | `id` text; the event's value sockets are child rows. OK. |

Defect found by the validator rather than by hand: reference targets were wrong for three fields (`scene.nodes` pointed at its own child, `accessor.sparse.indices.bufferView` at `buffer`). Fixed in `src/convert.ts` (a type is never its own target; "buffer view" is read as one noun). The resolved table is in `SOURCES.md`.

Not covered by this sample: the other 73 entries. `needs_review` is set on every entry the harvester itself was unsure about.
