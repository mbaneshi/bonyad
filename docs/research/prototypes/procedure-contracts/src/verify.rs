//! The independent-evaluator procedures: what decides whether a result is acceptable.
//! Sources: solidcore's difftest (three-way verdict, comparator self-test), FieldCraft's
//! oracle cases (cited source, tolerance with a mandatory reason, known failure), smlib's
//! lesson that a success status is not evidence, and the Hybrid rule that a model proposes
//! and an evaluator decides.
//!
//! These procedures never run the thing they judge; they receive its recorded outcome.

use crate::prelude::*;

wire! {
    /// A tolerance that must say why it is that size.
    pub struct ToleranceSpec {
        pub relative: f64,
        pub absolute: f64,
        /// Mandatory. An empty reason is rejected.
        pub reason: String,
    }
}
wire! {
    /// One reference check, in the style of an oracle case.
    pub struct OracleCase {
        /// Citation for the reference value (a standard, a paper, a hand calculation).
        pub source: String,
        pub quantity: String,
        /// JSON pointer into the recorded output where the measured value lives.
        pub measure_pointer: String,
        pub reference: f64,
        pub tolerance: ToleranceSpec,
        /// Present when the case is known to fail; recorded, not hidden by widening.
        pub known_failure: Option<String>,
    }
}
wire! {
    pub struct CheckResult {
        pub quantity: String,
        pub measured: Option<f64>,
        pub reference: f64,
        pub error: Option<f64>,
        pub allowed: f64,
        pub verdict: Verdict,
    }
}
wire! {
    /// How two outputs are compared.
    pub struct ComparisonRule {
        /// Floats compare equal when within this relative tolerance; everything else exactly.
        pub relative_tolerance: f64,
        /// Per-key absolute floors, only where a unit documents one.
        pub absolute_floors: Vec<(String, f64)>,
    }
}
wire! {
    pub struct Mismatch { pub path: String, pub candidate: String, pub reference: String }
}
wire! {
    /// Counters that expose a comparison that proved nothing.
    pub struct ComparisonCounters {
        pub compared: u32,
        pub identical: u32,
        pub mismatched: u32,
        /// Both sides succeeded but only status was compared.
        pub vacuous: u32,
        /// Candidate could not be evaluated; neither pass nor fail.
        pub deferred: u32,
    }
}
wire! {
    pub struct StaleRead { pub read: ReadRef, pub current_revision: Option<Revision> }
}

procedures! {
    /// Compare recorded outputs against reference values with cited sources and written
    /// tolerances. The verdict is accept only if every non-known-failure case passes.
    verify_against_reference {
        key: "verify.verify_against_reference", version: 1, kind: Validator, effect: Pure,
        input { record: Id<Record>, cases: Vec<OracleCase> }
        output { checks: Vec<CheckResult>, verdict: Verdict }
        errors {
            RecordMissing = "record_missing",
            NoCases = "no_cases",
            ReasonMissing = "reason_missing",
            ToleranceNegative = "tolerance_negative",
            PointerNotFound = "pointer_not_found",
            SourceMissing = "source_missing",
        }
    }
    /// Compare a candidate's recorded output with a reference executor's (differential check).
    compare_differential {
        key: "verify.compare_differential", version: 1, kind: Validator, effect: Pure,
        input { candidate: Id<Record>, reference: Id<Record>, rule: ComparisonRule }
        output { counters: ComparisonCounters, mismatches: Vec<Mismatch>, verdict: Verdict }
        errors {
            RecordMissing = "record_missing",
            RuleInvalid = "rule_invalid",
            KeySetsDiffer = "key_sets_differ",
        }
    }
    /// Is a stored result stale? Compares its read set with the current revisions: an
    /// unrelated edit does not stale it.
    check_staleness {
        key: "verify.check_staleness", version: 1, kind: Validator, effect: Pure,
        input { record: Id<Record> }
        output { stale: bool, changed: Vec<StaleRead> }
        errors { RecordMissing = "record_missing", ReadSetEmpty = "read_set_empty" }
    }
    /// Test the comparator itself: perturb one output item per case and require every
    /// perturbation to be caught. A comparator that misses one proves nothing.
    selftest_comparator {
        key: "verify.selftest_comparator", version: 1, kind: Validator, effect: Pure,
        input { rule: ComparisonRule, sample: Id<Record> }
        output { perturbations: u32, caught: u32, missed: Vec<String>, verdict: Verdict }
        errors { RecordMissing = "record_missing", RuleInvalid = "rule_invalid", NothingToPerturb = "nothing_to_perturb" }
    }
    /// Decide an assurance level from independent verdicts. A result no verifier checked
    /// is `unknown`, never `checked`.
    assign_assurance {
        key: "verify.assign_assurance", version: 1, kind: Calculation, effect: Pure,
        input {
            record: Id<Record>,
            verdicts: Vec<Verdict>,
            /// True only when the result is backed by a proof rather than a check.
            proven: bool,
        }
        output { assurance: Assurance }
        errors { RecordMissing = "record_missing", ContradictoryVerdicts = "contradictory_verdicts" }
    }
}
