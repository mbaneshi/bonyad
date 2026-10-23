# IFC 4.3 catalogue: hand review

Ten entries chosen at random (python `random.seed(4043)` over the sorted list of 1004 file names), each compared by hand against its block in `IFC4x3_RC4.exp` (attribute names, order, optionality, types, inheritance, skipped inverse/derived attributes). The descriptions were read against the Markdown documentation. Date: 2026-10-23.

| # | Entry | Result |
|---|---|---|
| 1 | `ifc.light_fixture_type` (symbol) | OK. Base `flow_terminal_type`; one attribute `PredefinedType` (required enum), literals carry documentation text. |
| 2 | `ifc.parameterized_profile_def` (abstract) | OK. Base `profile_def`; `Position` optional ref to `axis2_placement2d`; SUPERTYPE OF list kept in notes. |
| 3 | `ifc.recurrence_pattern_time_periods` (child) | OK. EXPRESS is `OPTIONAL LIST [1:?] OF IfcTimePeriod` on `IfcRecurrencePattern`; child with ref to `ifc.time_period`, optionality and order recorded in notes. Parent has the 3 SET-of-integer attributes as nullable int arrays and the 4 scalar fields, as in the source. |
| 4 | `ifc.property_enumeration` (object) | Found one defect, fixed: `EnumerationValues` is `LIST OF UNIQUE IfcValue` (a value SELECT). It becomes `array of text`, but the lossy mapping was not recorded in `source_ref`. Now it is. `Unit : OPTIONAL IfcUnit` maps to nullable `ref any` (select of three unrelated entities), correct. The UNIQUE rule is not mapped, as documented. |
| 5 | `ifc.topology_representation` (object) | OK. Empty field list, base `shape_model`; the source has only WHERE rules. |
| 6 | `ifc.window_lining_properties` (symbol) | OK. 12 attributes in source order; `LiningDepth` positive, three NonNegative lengths, four NormalisedRatio with `unit_interval`, `ShapeAspectStyle` ref, three plain lengths. WHERE rules dropped. |
| 7 | `ifc.material_layer_set_material_layers` (child) | OK. `LIST [1:?] OF IfcMaterialLayer`; ordered child with ref. Parent notes list the derived `TotalThickness` as not stored. |
| 8 | `ifc.geometric_representation_sub_context` (object) | OK. 4 own attributes (`ParentContext`, optional positive `TargetScale`, `TargetView` enum, optional `UserDefinedTargetView`); the four DERIVE redeclarations of inherited attributes are named in notes and not stored. |
| 9 | `ifc.center_line_profile_def` (symbol) | OK. One attribute `Thickness`, positive length; base `arbitrary_open_profile_def`. |
| 10 | `ifc.indexed_colour_map` (object) | OK. `MappedTo` ref, `Opacity` optional unit-interval ratio, `Colours` ref, `ColourIndex` as `array of int` (the IfcPositiveInteger check is not carried on array elements). |

Result: 9 of 10 correct on first generation, 1 defect found and fixed in the tool (item 4). Two cosmetic defects in `meaning` text (a trailing "may include:" fragment) were found while reading and fixed in the tool before the final run.

Limits of this review: it checks structure against the schema file and sampled descriptions against the docs; it does not prove the 1004 entries are free of errors. `bun run src/check.ts` validates all of them against the contract mechanically.
