# Engineering research

Status: **research, not decisions.** Nothing here changes the architecture, schema,
dependencies or code. A finding becomes a change only through an RFC and founder review
(see `CONTRIBUTING.md`). Tracked in issue #17, Project 24.

**Guiding question** (manifesto §8): *what existing knowledge can we preserve and reuse,
what new concept is genuinely necessary, and what experiment would prove it?*

## Executive summary (batch 1)

- **The first slice already expresses most of what LandXML 1.2 needs for points, lines
  and parcels.** A LandXML `Line` can carry its endpoints inline, which is exactly
  Bonyad's "a line owns its endpoints" rule. The same schema also lets a line *reference*
  a named point (`pntRef`); that is the explicit binding the reduced slice deferred.
  This is evidence that binding is a real, standard concept, not a Bonyad invention.
- **Three concepts are missing, not wrong:** a coordinate-axis convention (LandXML is
  *north, east*; GeoJSON is *longitude, latitude*; Bonyad is x, y), a declared
  coordinate reference system (CRS) per project, and uncertainty on a point. All three
  appear in LandXML and in the ISO 19111 model.
- **Planar area is safe at small scale, and the safe range is measurable.** In a local
  equidistant frame, a 1 km polygon's planar and geodesic areas agree to 1e-13
  (relative); at 10 km they differ by 2e-10; at 100 km by 2e-7. A *projected* CRS adds
  its own scale distortion, which this batch did not test (hypothesis H1).
- **A reusable calculation exists with the right licence.** Karney's geodesic area is
  implemented in `geographiclib-rs` (MIT) and used by the `geo` crate (MIT OR Apache-2.0).
  Bonyad's geometry crate should stay planar and pure; geodesic area belongs behind a
  procedure interface when a geographic CRS arrives (recommendation R3).
- **Coverage is thin by design.** Of eight disciplines, surveying and 2D geometry have a
  deep study; the other six have a verified-source inventory only. See `coverage.md`.

Decisions needed from the founder: none for this batch. Section 6 of
`proposals/next-batch.md` lists three questions that shape batch 2.

## Method

1. Read the repository first: manifesto, ADR 0001 (proposed), ADR 0002 (proposed, PR #9),
   the first-slice design, the geometry crate and migration on `dev`.
2. Prefer primary sources: the schema file, the specification text, the maintainer's
   documentation, source and package registries. Marketing pages and popularity do not
   count as evidence.
3. Label every claim:

   | Label | Meaning |
   |---|---|
   | **Verified** | Directly supported by a source we opened; the source is cited |
   | **Interpretation** | Our reading of verified evidence |
   | **Hypothesis** | Needs an experiment; the experiment is named |
   | **Unknown** | Evidence unavailable or insufficient (including sources that refused access) |

4. Record URL, version or commit, and access date. All access dates in batch 1 are
   2026-10-21.
5. Keep three bodies of knowledge separate: **A** formats and exchange (`formats/`),
   **B** standards and semantics (`standards/`), **C** procedures and prior art
   (`procedures/`, `prior-art/`). Procedures are subjects in their own right.
6. Restricted standards are summarised within permitted limits and linked, never copied.
7. Reference cases are run, not asserted; each records the exact command and version.

## Index

| Path | What it holds |
|---|---|
| [`coverage.md`](coverage.md) | Discipline x body-of-knowledge matrix; gaps |
| [`formats/landxml-1.2.md`](formats/landxml-1.2.md) | LandXML 1.2 schema study (A) |
| [`standards/crs-iso19111-ogc.md`](standards/crs-iso19111-ogc.md) | Coordinate reference systems, ISO 19111 / OGC 18-005r5 (B) |
| [`procedures/polygon-area.md`](procedures/polygon-area.md) | Planar vs geodesic polygon area, with a reference case (C) |
| [`prior-art/inventory.md`](prior-art/inventory.md) | Cross-discipline inventory of formats and implementations |
| [`mappings/point-line-surface.md`](mappings/point-line-surface.md) | Mapping to the current slice |
| [`proposals/next-batch.md`](proposals/next-batch.md) | Adoption recommendations, experiments, next batch |
