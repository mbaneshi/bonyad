# logic: the Rust workspace

Engineering logic. Toolchain pinned in `rust-toolchain.toml`; dependency versions pinned
exactly; `Cargo.lock` is committed.

| Crate | Role | I/O |
|---|---|---|
| `crates/geometry` | Concrete geometry types, validation errors, length / area / perimeter | **none** |
| `persistence` | SQLx queries and mapping | database (next step) |
| `server` | axum API, error mapping, OpenAPI | network (next step) |

There is deliberately no `core` crate: shared abstractions are extracted when an
implemented case needs them.

```bash
cd logic
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

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
Each carries a `path` such as `b.x` or `vertices[2].y`.

Tolerances are named constants (`ZERO_LENGTH_EPS`, `ZERO_AREA_EPS`, both `1e-9`).
Self-intersection uses exact floating-point orientation tests, so a vertex that lies only
*nearly* on another edge passes; that limit is accepted at this scale.

**Degenerate is not "zero net area".** A symmetric bow-tie has a net signed area of 0 yet
is self-intersecting, so "degenerate" means every vertex lies on one line, and
self-intersection is checked after it.
