# LandXML 1.2 catalogue: hand review

Ten entries drawn at random (Python `random.seed(41)` over the sorted file list) and checked by hand
against `LandXML-1.2.xsd` (SHA-256 in `SOURCES.md`). Date: 2026-10-23.

| Entry | Checked against | Result |
|---|---|---|
| `passing_lane` | XSD `PassingLane` (line 4317) | OK: 6 attributes with the right types (`station` -> length, `sideofRoadType` -> enum); the Feature child is the generalised `feature`. |
| `monument` | XSD `Monument` (line 2578) | OK: 13 attributes; `name` required, `pntRef`/`featureRef` typed as references. |
| `feature_dictionary` | XSD `FeatureDictionary` (line 1192) | OK: `name`, `version`; `DocFileRef` is its own child type. |
| `curve2` | XSD `Curve2` (line 4701) | OK: a role wrapper whose only child is `Curve`; modelled as an object based on `curve`, no own fields. |
| `personnel` | XSD `Personnel` (line 1864) | OK: `name`, `role`, `regType`, `regNumber`. |
| `test_observation` | XSD `TestObservation` (line 2197) | OK: extends `RawObservationType`; four `setup*Rod*` doubles kept as `float` (no unit stated). |
| `instrument_details` | XSD `InstrumentDetails` (line 1902) | OK: `id` plus the double attributes; `Corrections` is a child type; `FieldNote` kept as text. |
| `surfaces` | XSD `Surfaces` (line 2599) | OK: `name`, `desc`, `state`; `Surface` children attach to it. |
| `imperial` | XSD `Imperial` (line 1588) | OK: the 14 unit attributes as enums; parent is the root because `Units` is a pure wrapper (dropped). |
| `administrative_date` | XSD `AdministrativeDate` (line 1806) | OK: both attributes required; `adminDate` is `date`; `adminDateType` kept as text because the XSD type is an unrestricted xs:string. |

Mechanical checks: `bun run check` (all 1,219 attributes present, zero dangling references) and the
`tools/catalogue` validator (`170 type(s) valid`).
