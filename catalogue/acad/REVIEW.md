# Review of catalogue/acad

Ten entries drawn at random (Python `random.seed(39)`, `random.sample` over the sorted file list) and checked by hand against the pinned sources (ACadSharp `29137f3`, ezdxf `7b20261`). Findings marked FIXED were corrected in the harvest and the catalogue regenerated; the verdicts are for the final files.

| Entry | Checked against | Result |
|---|---|---|
| `cad_wipeout_base` | `Entities/CadWipeoutBase.cs` | OK. All coded properties are present with the right group codes (70, 71, 90, 280 to 283, 290, 340, 10/11/12/13). Group 91 (clip vertices) is the child `cad_wipeout_base_clip_boundary_vertex`. Group 360 is `internal` and hidden in ACadSharp, so it is not stored. Note: `clip_type` (71) is computed from the vertex count in ACadSharp but is an explicit group in DXF, so it is kept. |
| `dimension_diameter` | `Entities/DimensionDiameter.cs` | OK. `angle_vertex` (15/25/35) and `leader_length` (40); the `Center` property is derived and correctly absent. |
| `hatch_path_edge_polyline_vertex` | `Entities/Hatch.BoundaryPath.Polyline.cs` | FIXED. ACadSharp stores X, Y and the bulge together in one `XYZ`, so the first harvest produced a misleading `point3`. Now `point` (point2) plus `bulge` (group 42). The nesting (path, edge) is carried by `path_index` and `edge_index`. |
| `attribute_base` | `Entities/AttributeBase.cs` | OK. Codes 2 (tag), 70 (flags), 71, 74 (vertical alignment) and 280 are present; the TEXT group codes are copied in so that the migrated `acad.text` table stays exactly as it is. |
| `blockvisibilityparameter_state_expression` | `Objects/Evaluations/BlockVisibilityParameter.State.cs` | OK. One reference per expression (group 333, count 95); `state_index` is a structural key because nested children are not supported. |
| `dbcolor` | `Objects/BookColor.cs` | FIXED. The meaning text said "1.255 index" (a string-replace slip); now "1 to 255". Only groups 62 and 420 are coded in ACadSharp; `ColorName` and `BookName` carry no group code and are not stored. `needs_review` stays true: the class has no description. |
| `hatch_path_edge_spline_fit_point` | `Entities/Hatch.BoundaryPath.Spline.cs` | OK. `List<XY> FitPoints` under group 97, so point2. |
| `vertex2d` | `Entities/Vertex2D.cs`, `Vertex.cs` | OK. Fields copied from the abstract `Vertex` (groups 10/20/30, 40, 41, 42, 50, 70); the angle (50) is converted to radians and says so. Group 91 of `Vertex` is flagged Ignored in ACadSharp (invalid in some versions) and is not stored. |
| `planesurface` | `Entities/PlaneSurface.cs` | OK. No own group codes in ACadSharp (it only sets the subclass marker); the fields come from `acad.surface`. The meaning is a placeholder and `needs_review` is set. |
| `appid` | `Tables/AppId.cs`, `Tables/TableEntry.cs` | FIXED. `name` (group 2) was nullable; `TableEntry.Name` throws on an empty value, so it is now required. |

Outcome: 7 entries correct as harvested, 3 corrected. Two of the three fixes were general (a string-replace slip, nullable names), so the whole catalogue was regenerated, not just these files.
