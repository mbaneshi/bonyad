//! 2D sketching and geometric constraint solving.
//! Sources: SolidCraft's sketch solver (Levenberg-Marquardt, `SolveReport`), SolveSpace.

use crate::prelude::*;

wire! {
    #[derive(Copy, Eq)]
    pub enum SolveStatus { Solved, Failed }
}
wire! {
    pub enum ConstraintKind {
        Coincident { a: u32, b: u32 },
        PointOnCurve { point: u32, curve: u32 },
        Horizontal { curve: u32 },
        Vertical { curve: u32 },
        Parallel { a: u32, b: u32 },
        Perpendicular { a: u32, b: u32 },
        Tangent { a: u32, b: u32 },
        EqualLength { a: u32, b: u32 },
        Fixed { point: u32 },
        Distance { a: u32, b: u32, value: Expr },
        Angle { a: u32, b: u32, value: Expr },
        Radius { curve: u32, value: Expr },
    }
}
wire! {
    pub struct SolvedPoint { pub id: u32, pub position: Point2 }
}

procedures! {
    /// Solve a sketch's constraints. Pure: returns the solved coordinates; applying them is a
    /// separate command, so a failed solve cannot damage the sketch.
    solve {
        key: "sketch.solve", version: 1, kind: Calculation, effect: Pure,
        input {
            sketch: Id<Sketch>,
            /// Points held in place during the solve (for example during a drag).
            hold: Vec<u32>,
        }
        output {
            status: SolveStatus,
            /// Remaining degrees of freedom.
            dof: u32,
            iterations: u32,
            max_residual: f64,
            /// Constraints that conflict (not a minimal conflict set).
            failing: Vec<u32>,
            redundant: Vec<u32>,
            /// Points whose orientation flipped.
            folded: Vec<u32>,
            solved: Vec<SolvedPoint>,
        }
        errors {
            SketchMissing = "sketch_missing",
            ConstraintMalformed = "constraint_malformed",
            TooManyVariables = "too_many_variables",
            NonFiniteValue = "non_finite_value",
        }
    }
    /// Apply a solved result to the sketch.
    apply_solution {
        key: "sketch.apply_solution", version: 1, kind: Command, effect: MutatesInPlace,
        input { sketch: Id<Sketch>, solved: Vec<SolvedPoint>, expected: Expected }
        output { new_revision: Revision }
        errors {
            SketchMissing = "sketch_missing",
            RevisionConflict = "revision_conflict",
            PointMissing = "point_missing",
        }
    }
    /// Add a constraint.
    add_constraint {
        key: "sketch.add_constraint", version: 1, kind: Command, effect: MutatesInPlace,
        input { sketch: Id<Sketch>, constraint: ConstraintKind, expected: Expected }
        output { constraint_id: u32, new_revision: Revision }
        errors {
            SketchMissing = "sketch_missing",
            RevisionConflict = "revision_conflict",
            ReferenceMissing = "reference_missing",
            Redundant = "redundant",
            Conflicting = "conflicting",
        }
    }
    /// Change a driving dimension.
    set_dimension {
        key: "sketch.set_dimension", version: 1, kind: Command, effect: MutatesInPlace,
        input { sketch: Id<Sketch>, constraint_id: u32, value: Expr, expected: Expected }
        output { new_revision: Revision }
        errors {
            SketchMissing = "sketch_missing",
            RevisionConflict = "revision_conflict",
            ConstraintMissing = "constraint_missing",
            NotADimension = "not_a_dimension",
            ExpressionInvalid = "expression_invalid",
        }
    }
    /// Close a sketch's loops into profiles.
    find_profiles {
        key: "sketch.find_profiles", version: 1, kind: Calculation, effect: Pure,
        input { sketch: Id<Sketch> }
        output { profiles: Vec<Ring2>, loose_ends: Vec<Point2> }
        errors {
            SketchMissing = "sketch_missing",
            NoClosedLoop = "no_closed_loop",
        }
    }
}
