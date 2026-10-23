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
    measure_entity {
        key: "drawing.measure_entity", version: 1, kind: Calculation, effect: Pure,
        input { entity: EntityRef }
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
