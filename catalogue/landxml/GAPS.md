# LandXML 1.2 catalogue: gaps and judgement calls

Counts (from `bun run check`, 2026-10-23): 170 types (65 object, 102 child, 3 abstract), 1,730 fields,
283 enum fields with 1,590 values, 30 types flagged `needs_review`. All 1,219 XSD attributes and every
XSD element are represented; no dangling `ref_to`, `base` or `parent`.

## Not covered, and why
1. **Foreign-namespace content.** The XSD allows `xs:any` / `xs:anyAttribute` in `LandXML`, `Application`, `Author`, `CoordinateSystem` (and `FieldNote`, kept as free text). Not modelled: the content is by definition not described by the schema. Listed per type in `notes`.
2. **Single parent.** The format allows one `parent`. 20 types occur under more than one container in the XSD (for example `Monuments` inside `Survey` and `SurveyHeader`); the first container is used and the others are named in `notes`, with `needs_review`.
3. **Unbounded choices.** 10 types inline elements that sit inside an unbounded `xs:choice`; they are modelled as at most once each (flagged `needs_review`). A file that repeats such an element loses nothing at the XSD level but cannot be stored in these columns.
4. **Container linkage is not in the XSD.** Types that contain other types, derive from a base or are a base are stored as `object` and carry a nullable `container` reference (format rules 5 and 8 forbid a `child` with a `base` or with children). This reference is added by the harvester and is marked as such in `source_ref`. `Feature` additionally has `owner`, because the XSD lists it under nearly every element.
5. **Units and conversion.** Lengths, areas and volumes are kept in the file's declared unit (the `Units` element is stored as data); angles are `angle` (radians) with the conversion stated in `meaning`. No conversion is performed by the catalogue. Plain `xs:double` attributes whose dimension the XSD does not state stay `float` rather than being guessed.
6. **Coordinate order.** Coordinate text "northing easting [elevation]" is stored as `point3` with x = easting, y = northing (field `coordinates`; `position` is reserved by the format). A consumer must not assume x = first value.
7. **Redundant attributes.** The XSD carries values derivable from other data (line length, curve delta, parcel area ...). They are kept because the format carries them, and flagged in `meaning` as claims to verify, never as authority (`src/redundant.ts`, a judgement list).
8. **Meanings** come from the XSD's own `xs:documentation`; where it has none the `meaning` says so rather than inventing one. LandXML.org prose documentation (doc12.zip, Spec.html) was not used.
9. **Constraints.** `xs:key` / `xs:keyref` were used only to type name references as `ref`; `xs:unique` and cross-element rules are not carried over.
10. **Licence.** The generated YAML is not committed, see `SOURCES.md`.
