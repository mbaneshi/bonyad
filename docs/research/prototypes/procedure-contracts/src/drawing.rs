//! Bonyad's existing 2D operations (milestones 1 and 2), declared in the same shape as every
//! other procedure. This is the baseline the rest of the catalogue has to fit. The error
//! codes are the exact stable codes of `bonyad-geometry`'s `ViolationCode`, so the contract
//! and the running code agree.

use crate::prelude::*;

wire! {
    /// A geometry of any 2D kind. Serialises with a `kind` tag, as in `bonyad-geometry`.
    #[serde(tag = "kind")]
    pub enum Geometry2 {
        Point { x: f64, y: f64 },
        Line { a: Point2, b: Point2 },
        /// An open ring; the closing edge is implied.
        Surface { vertices: Vec<Point2> },
    }
}
wire! {
    #[serde(tag = "kind")]
    pub enum Measure2 {
        Line { length: f64 },
        Surface { area: f64, perimeter: f64 },
    }
}

procedures! {
    /// Create a point, line or surface. Identity is assigned by the server; a caller-supplied
    /// id makes a retry safe.
    create_entity {
        key: "drawing.create_entity", version: 1, kind: Command, effect: ProducesNew,
        input { geometry: Geometry2, id: Option<uuid::Uuid>, expected_head: Revision }
        output { entity: EntityRef, new_head: Revision }
        errors {
            RevisionConflict = "revision_conflict",
            NonFiniteCoordinate = "non_finite_coordinate",
            ZeroLengthLine = "zero_length_line",
            TooFewVertices = "too_few_vertices",
            DegenerateSurface = "degenerate_surface",
            SelfIntersectingSurface = "self_intersecting_surface",
        }
    }
    /// Replace an entity's geometry wholesale. Checked against the expected revision of the
    /// entity; the accepted change is revisioned.
    update_geometry {
        key: "drawing.update_geometry", version: 1, kind: Command, effect: MutatesInPlace,
        input { entity: EntityRef, geometry: Geometry2, expected: Expected }
        output { new_revision: Revision, new_head: Revision }
        errors {
            EntityMissing = "entity_missing",
            RevisionConflict = "revision_conflict",
            KindMismatch = "kind_mismatch",
            NonFiniteCoordinate = "non_finite_coordinate",
            ZeroLengthLine = "zero_length_line",
            TooFewVertices = "too_few_vertices",
            DegenerateSurface = "degenerate_surface",
            SelfIntersectingSurface = "self_intersecting_surface",
        }
    }
    /// Delete an entity. Refused while another entity references it; nothing cascades.
    delete_entity {
        key: "drawing.delete_entity", version: 1, kind: Command, effect: MutatesInPlace,
        input { entity: EntityRef, expected: Expected }
        output { new_head: Revision }
        errors {
            EntityMissing = "entity_missing",
            RevisionConflict = "revision_conflict",
            EntityInUse = "entity_in_use",
        }
    }
    /// Length, or area and perimeter. A point has nothing to measure.
    ///
    /// The harness resolves `entity` at `ctx.input_revision` and passes the stored
    /// `geometry`; the calculation itself is a pure function of that geometry. `entity` is
    /// what goes into the read set, so staleness still works.
    measure_entity {
        key: "drawing.measure_entity", version: 1, kind: Calculation, effect: Pure,
        input { entity: EntityRef, geometry: Geometry2 }
        output { measure: Measure2, input_revision: Revision }
        errors { EntityMissing = "entity_missing", NotMeasurable = "not_measurable" }
    }
    /// Check a geometry against the stored rules without storing anything.
    validate_geometry {
        key: "drawing.validate_geometry", version: 1, kind: Validator, effect: Pure,
        input { geometry: Geometry2 }
        output { valid: bool }
        errors {
            NonFiniteCoordinate = "non_finite_coordinate",
            ZeroLengthLine = "zero_length_line",
            TooFewVertices = "too_few_vertices",
            DegenerateSurface = "degenerate_surface",
            SelfIntersectingSurface = "self_intersecting_surface",
        }
    }
}

// ------------------------------------------------------------ the real implementations

use bonyad_geometry as real;

impl From<&Geometry2> for real::Geometry {
    fn from(g: &Geometry2) -> Self {
        let p = |q: &Point2| real::Point2::new(q.x, q.y);
        match g {
            Geometry2::Point { x, y } => real::Geometry::Point(real::Point2::new(*x, *y)),
            Geometry2::Line { a, b } => real::Geometry::Line(real::LineGeometry { a: p(a), b: p(b) }),
            Geometry2::Surface { vertices } => real::Geometry::Surface(real::SurfaceGeometry {
                vertices: vertices.iter().map(p).collect(),
            }),
        }
    }
}

impl Run for measure_entity::Spec {
    fn run(ctx: &Ctx, input: &Self::Input) -> Outcome<Self::Output, Self::Error> {
        match real::measure(&(&input.geometry).into()) {
            None => Outcome::reject(
                measure_entity::Error::NotMeasurable,
                "",
                "a point has nothing to measure",
            ),
            Some(real::Measure::Line { length }) => Outcome::ok(measure_entity::Output {
                measure: Measure2::Line { length },
                input_revision: ctx.input_revision,
            }),
            Some(real::Measure::Surface { area, perimeter }) => Outcome::ok(measure_entity::Output {
                measure: Measure2::Surface { area, perimeter },
                input_revision: ctx.input_revision,
            }),
        }
    }
}

fn to_validate_error(code: real::ViolationCode) -> validate_geometry::Error {
    use real::ViolationCode as V;
    use validate_geometry::Error as E;
    match code {
        V::NonFiniteCoordinate => E::NonFiniteCoordinate,
        V::ZeroLengthLine => E::ZeroLengthLine,
        V::TooFewVertices => E::TooFewVertices,
        V::DegenerateSurface => E::DegenerateSurface,
        V::SelfIntersectingSurface => E::SelfIntersectingSurface,
        // Only `validate_replacement` can produce this one; `validate` never does.
        V::KindMismatch => unreachable!("validate() does not return kind_mismatch"),
    }
}

impl Run for validate_geometry::Spec {
    fn run(_ctx: &Ctx, input: &Self::Input) -> Outcome<Self::Output, Self::Error> {
        match real::validate(&(&input.geometry).into()) {
            Ok(()) => Outcome::ok(validate_geometry::Output { valid: true }),
            Err(violations) => Outcome::Rejected {
                violations: violations
                    .into_iter()
                    .map(|v| Rejection { error: to_validate_error(v.code), path: v.path, message: v.message })
                    .collect(),
            },
        }
    }
}
