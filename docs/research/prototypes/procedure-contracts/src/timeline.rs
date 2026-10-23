//! The parametric timeline. Source: SolidCraft's feature timeline.
//!
//! The unifying idea: **a feature is a stored procedure call** (procedure key, version and
//! its typed input), not a stored result. The B-rep is derived by replaying the timeline;
//! rebuilding is `timeline.rebuild`. This is what keeps "recipe" and "result" apart.

use crate::prelude::*;

wire! {
    /// One failed feature in a rebuild, with the stable code of the procedure that rejected it.
    pub struct FailedFeature {
        pub feature: Id<Feature>,
        pub position: u32,
        pub procedure: ProcedureId,
        pub error_code: String,
        pub message: String,
    }
}

procedures! {
    /// Append or insert a feature: a procedure call kept as data.
    add_feature {
        key: "timeline.add_feature", version: 1, kind: Command, effect: MutatesInPlace,
        input {
            design: Id<Design>,
            /// The procedure this feature replays, by key and version.
            procedure: ProcedureId,
            /// Canonical JSON of that procedure's `Input`. Parsed against its typed input;
            /// an unknown key is an error.
            input_json: String,
            position: Option<u32>,
            expected: Expected,
        }
        output { feature: Id<Feature>, new_revision: Revision, rebuild_from: u32 }
        errors {
            DesignMissing = "design_missing",
            RevisionConflict = "revision_conflict",
            ProcedureUnknown = "procedure_unknown",
            ProcedureVersionUnsupported = "procedure_version_unsupported",
            ProcedureNotAFeature = "procedure_not_a_feature",
            InputMalformed = "input_malformed",
            PositionOutOfRange = "position_out_of_range",
        }
    }
    /// Suppress or restore a feature without deleting it.
    suppress_feature {
        key: "timeline.suppress_feature", version: 1, kind: Command, effect: MutatesInPlace,
        input { design: Id<Design>, feature: Id<Feature>, suppressed: bool, expected: Expected }
        output { new_revision: Revision, rebuild_from: u32, dependants_affected: Vec<Id<Feature>> }
        errors {
            DesignMissing = "design_missing",
            FeatureMissing = "feature_missing",
            RevisionConflict = "revision_conflict",
        }
    }
    /// Remove a feature. Refused while a later feature references what it created.
    remove_feature {
        key: "timeline.remove_feature", version: 1, kind: Command, effect: MutatesInPlace,
        input { design: Id<Design>, feature: Id<Feature>, expected: Expected }
        output { new_revision: Revision, rebuild_from: u32 }
        errors {
            DesignMissing = "design_missing",
            FeatureMissing = "feature_missing",
            RevisionConflict = "revision_conflict",
            FeatureInUse = "feature_in_use",
        }
    }
    /// Move a feature earlier or later in the timeline.
    reorder_feature {
        key: "timeline.reorder_feature", version: 1, kind: Command, effect: MutatesInPlace,
        input { design: Id<Design>, feature: Id<Feature>, new_position: u32, expected: Expected }
        output { new_revision: Revision, rebuild_from: u32 }
        errors {
            DesignMissing = "design_missing",
            FeatureMissing = "feature_missing",
            RevisionConflict = "revision_conflict",
            PositionOutOfRange = "position_out_of_range",
            WouldBreakDependency = "would_break_dependency",
        }
    }
    /// Roll the active end of the timeline back to a position (features after it are skipped).
    roll_back_to {
        key: "timeline.roll_back_to", version: 1, kind: Command, effect: MutatesInPlace,
        input { design: Id<Design>, position: Option<u32>, expected: Expected }
        output { new_revision: Revision, features_skipped: u32 }
        errors {
            DesignMissing = "design_missing",
            RevisionConflict = "revision_conflict",
            PositionOutOfRange = "position_out_of_range",
        }
    }
    /// Change a named design parameter that features reference by expression.
    set_design_parameter {
        key: "timeline.set_design_parameter", version: 1, kind: Command, effect: MutatesInPlace,
        input { design: Id<Design>, name: String, value: Expr, expected: Expected }
        output { new_revision: Revision, features_affected: Vec<Id<Feature>>, rebuild_from: u32 }
        errors {
            DesignMissing = "design_missing",
            RevisionConflict = "revision_conflict",
            ParameterMissing = "parameter_missing",
            ExpressionInvalid = "expression_invalid",
            UnitMismatch = "unit_mismatch",
            ParameterCycle = "parameter_cycle",
        }
    }
    /// Replay the timeline from a position. Reuses unchanged results (content-addressed) and
    /// reports how many were recomputed versus restored. A failed feature fails only the
    /// features that depend on it.
    rebuild {
        key: "timeline.rebuild", version: 1, kind: Derivation, effect: ProducesNew,
        input { design: Id<Design>, from_position: Option<u32>, live_drag: bool }
        output {
            recomputed: u32,
            restored: u32,
            skipped: u32,
            failed: Vec<FailedFeature>,
            /// Features left stale on purpose during a live drag.
            stale: Vec<Id<Feature>>,
        }
        errors {
            DesignMissing = "design_missing",
            PositionOutOfRange = "position_out_of_range",
            ProcedureUnknown = "procedure_unknown",
            TimelineCycle = "timeline_cycle",
        }
    }
}
