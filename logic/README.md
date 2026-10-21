# logic: the Rust workspace

Engineering logic. Toolchain pinned in `rust-toolchain.toml`; dependency versions pinned
exactly (see `[workspace.dependencies]`); `Cargo.lock` is committed.

| Crate | Role | I/O |
|---|---|---|
| `crates/geometry` | Concrete geometry types, validation errors, length / area / perimeter | **none** |
| `crates/persistence` | Typed SQL over PostgreSQL; one transaction per operation | database |
| `crates/server` | axum API, problem+json errors, request ids, OpenAPI | network (`127.0.0.1`) |

There is deliberately no `core` crate: shared abstractions are extracted when an
implemented case needs them. Dependencies flow one way: `server` → `persistence` →
`geometry`, and `geometry` knows nothing about the other two.

## Running it

The tests and the server need the local database (`just up`, then `just migrate` and
`just seed` from the main checkout). From any worktree:

```bash
just logic-check   # cargo fmt --check, clippy -D warnings, and every test
just serve         # API on 127.0.0.1:58080
just openapi       # regenerate contracts/openapi.json after an intentional API change
```

`DATABASE_URL` is built from the main checkout's `.env`. The server refuses to listen on a
non-loopback address (there is no authentication yet) unless `BONYAD_ALLOW_NON_LOOPBACK=1`.

## The API

Seven operations, one path each: validate the geometry, persist in one transaction, return
the accepted result. A rejected request changes nothing.

| Operation | Request |
|---|---|
| `GetProject` | `GET /v1/project` |
| `CreatePoint` / `CreateLine` / `CreateSurface` | `POST /v1/points`, `/v1/lines`, `/v1/surfaces` |
| `UpdateGeometry` | `PUT /v1/entities/{id}/geometry` |
| `DeleteEntity` | `DELETE /v1/entities/{id}` |
| `MeasureEntity` | `GET /v1/entities/{id}/measure` |

Plus `GET /healthz` and `GET /openapi.json`. Errors are `application/problem+json` with a
stable `code` (`invalid_geometry`, `not_found`, `id_in_use`, `not_measurable`,
`invalid_request`, `project_not_seeded`, `database_unavailable`, `internal_error`); geometry
failures also list every `violations[]` entry with its code and path. Every response carries
`x-request-id`.

**Retries.** `Create*` accept an optional client-chosen `id`. The same id and content returns
the existing entity (200); the same id with different content is `id_in_use` (409).

**Contract.** `contracts/openapi.json` is generated from the code and committed; a test
fails if it drifts.

## Tests

All tests run against a real PostgreSQL: each `#[sqlx::test]` gets its own freshly migrated
database, so tests never share rows and nothing is mocked. They include the database's own
guarantees (kind pinning, finite numbers, key uniqueness) tested directly with SQL.

## SQLx macros are not used (yet)

The queries are plain SQL with typed row structs, checked against the real schema by those
tests. SQLx's compile-time `query!` macros are deliberately not used: SQLx 0.9 parses **every**
`.env` file in every parent directory and fails the build on any it cannot read, so one
unrelated stray `.env` above the repository breaks compilation. The SQL is macro-ready; they
can be enabled (with a committed `.sqlx/` cache) once that is not a hazard.

## `bonyad-geometry`

Independent geometry: a line owns its two endpoints; a surface owns its ordered, open ring
of vertices (`A, B, C`, closed implicitly). Equal coordinates elsewhere imply no connection.

| Function | Result |
|---|---|
| `validate(&Geometry)` | `Ok(())` or every violation found |
| `validate_replacement(kind, &Geometry)` | the same, plus `kind_mismatch` |
| `length`, `area`, `perimeter`, `signed_area` | `f64`, in project units |
| `measure(&Geometry)` | `Some(Measure)`, or `None` for a point |

Violation codes are stable API: `non_finite_coordinate`, `zero_length_line`,
`too_few_vertices`, `degenerate_surface`, `self_intersecting_surface`, `kind_mismatch`.
Each carries a `path` such as `b.x` or `vertices[2].y`. The optional `openapi` feature adds
schema derives (a derive macro only; no I/O) so the API's shapes are defined once.

Tolerances are named constants (`ZERO_LENGTH_EPS`, `ZERO_AREA_EPS`, both `1e-9`).
Self-intersection uses exact floating-point orientation tests, so a vertex that lies only
*nearly* on another edge passes; that limit is accepted at this scale.

**Degenerate is not "zero net area".** A symmetric bow-tie has a net signed area of 0 yet
is self-intersecting, so "degenerate" means every vertex lies on one line, and
self-intersection is checked after it.
