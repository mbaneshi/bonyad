//! The contract vocabulary shared by every procedure.
//!
//! What the research says this must carry (see `docs/research/procedures/*.md`):
//! - an explicit **kind** and **effect** per procedure (pure / produces new / consumes /
//!   mutates in place), not a drawing variable or a comment;
//! - a **three-way outcome**: accepted, rejected with stable codes, or *undetermined*
//!   ("cannot evaluate yet"), so that "unchecked" is never counted as "pass";
//! - tolerance, frame and seed as **explicit input** ([`Ctx`]), never ambient state;
//! - **provenance with a read set** (entity and revision pairs), so staleness is computed,
//!   not flagged.

use std::fmt;
use std::hash::{Hash, Hasher};
use std::marker::PhantomData;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ---------------------------------------------------------------- typed identity

/// A kind of entity. The name is stable and appears in provenance.
pub trait EntityKind {
    const NAME: &'static str;
}

/// Typed identity: `Id<Body>` cannot be passed where `Id<Alignment>` is expected.
pub struct Id<K> {
    uuid: Uuid,
    _kind: PhantomData<fn() -> K>,
}
impl<K> Id<K> {
    pub const fn new(uuid: Uuid) -> Self {
        Id { uuid, _kind: PhantomData }
    }
    pub const fn uuid(&self) -> Uuid {
        self.uuid
    }
}
impl<K: EntityKind> Id<K> {
    /// The untyped reference, for read sets and dependency lists.
    pub fn any(&self) -> AnyRef {
        AnyRef { kind: K::NAME, uuid: self.uuid }
    }
}
impl<K> Clone for Id<K> {
    fn clone(&self) -> Self {
        *self
    }
}
impl<K> Copy for Id<K> {}
impl<K> PartialEq for Id<K> {
    fn eq(&self, other: &Self) -> bool {
        self.uuid == other.uuid
    }
}
impl<K> Eq for Id<K> {}
impl<K> Hash for Id<K> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.uuid.hash(state)
    }
}
impl<K> fmt::Debug for Id<K> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Id({})", self.uuid)
    }
}
impl<K> Serialize for Id<K> {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        self.uuid.serialize(s)
    }
}
impl<'de, K> Deserialize<'de> for Id<K> {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Uuid::deserialize(d).map(Id::new)
    }
}

/// An untyped reference: entity kind name plus id.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
pub struct AnyRef {
    pub kind: &'static str,
    pub uuid: Uuid,
}

/// The revision of one entity (or of the project head).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Revision(pub u64);

// ------------------------------------------------------ explicit context (not ambient)

wire! {
    /// Length unit of the project frame. Geometry values do not carry units; the frame does.
    #[derive(Copy, Eq)]
    pub enum LengthUnit { Metre }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum AngleUnit { Radian }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum Axes { XEastYNorthZUp }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum VerticalReference { Local }
}

wire! {
    /// The project frame: what the numbers in every input mean.
    #[derive(Copy)]
    pub struct Frame {
        pub length_unit: LengthUnit,
        pub angle_unit: AngleUnit,
        pub axes: Axes,
        pub vertical_reference: VerticalReference,
    }
}
impl Frame {
    pub const LOCAL_METRES: Frame = Frame {
        length_unit: LengthUnit::Metre,
        angle_unit: AngleUnit::Radian,
        axes: Axes::XEastYNorthZUp,
        vertical_reference: VerticalReference::Local,
    };
}

wire! {
    /// Tolerances passed to every procedure. Lengths are in the frame's length unit,
    /// angles in radians. A procedure must not read a global tolerance.
    #[derive(Copy)]
    pub struct Tolerance {
        pub length: f64,
        pub angle: f64,
        pub relative: f64,
    }
}
impl Default for Tolerance {
    fn default() -> Self {
        Tolerance { length: 1e-6, angle: 1e-9, relative: 1e-9 }
    }
}

wire! {
    /// Everything ambient that a procedure may depend on, made explicit and recorded in
    /// provenance. `seed` fixes any randomness; `input_revision` is the project revision
    /// the typed input was built from.
    #[derive(Copy)]
    pub struct Ctx {
        pub frame: Frame,
        pub tolerance: Tolerance,
        pub seed: u64,
        pub input_revision: Revision,
    }
}
impl Ctx {
    pub const fn local_metres(input_revision: Revision) -> Ctx {
        Ctx {
            frame: Frame::LOCAL_METRES,
            tolerance: Tolerance { length: 1e-6, angle: 1e-9, relative: 1e-9 },
            seed: 0,
            input_revision,
        }
    }
}

// --------------------------------------------------- what a procedure is, as data

wire! {
    /// The role of a procedure in the system.
    #[derive(Copy, Eq, Hash)]
    pub enum Kind {
        /// Reads stored state; computes nothing new.
        Query,
        /// Derives a value from typed input; changes nothing.
        Calculation,
        /// Checks conditions and reports; the independent-evaluator role.
        Validator,
        /// Changes the model (versioned, checked against an expected revision).
        Command,
        /// Builds a derived entity or cached result from stored recipes.
        Derivation,
        /// Crosses the system boundary: files, external engines.
        External,
    }
}

wire! {
    /// Ownership shape, taken from the three shapes the research found in kernels:
    /// pure, consume-and-produce, and in-place mutation.
    #[derive(Copy, Eq, Hash)]
    pub enum Effect {
        /// Reads inputs, changes nothing.
        Pure,
        /// Creates new entities; inputs are untouched.
        ProducesNew,
        /// Creates new entities and the inputs no longer exist afterwards.
        ConsumesInputs,
        /// Changes existing entities.
        MutatesInPlace,
        /// Reads a file or external resource.
        ReadsExternal,
        /// Writes a file or external resource.
        WritesExternal,
    }
}

/// Static description of one procedure. Generated by `procedures!`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct ProcedureSpec {
    /// `domain.name`, lower case, stable.
    pub key: &'static str,
    /// Bumped whenever input, output, error codes or semantics change.
    pub version: u32,
    pub kind: Kind,
    pub effect: Effect,
    pub input_fields: &'static [&'static str],
    pub output_fields: &'static [&'static str],
    pub error_codes: &'static [&'static str],
}

/// An error enum with stable string codes.
pub trait ProcedureError: Copy {
    fn code(self) -> &'static str;
}

/// A procedure as a type: associated input, output and error types plus its [`ProcedureSpec`].
pub trait Procedure {
    const SPEC: &'static ProcedureSpec;
    type Input;
    type Output;
    type Error: ProcedureError;
}

/// An implementation of a procedure. Pure with respect to its arguments: everything it may
/// depend on is in `ctx` and `input`.
pub trait Run: Procedure {
    fn run(ctx: &Ctx, input: &Self::Input) -> Outcome<Self::Output, Self::Error>;
}

// ------------------------------------------------------------- three-way outcome

wire! {
    /// A non-fatal observation that travels with a successful result.
    pub struct Warning {
        pub code: String,
        pub path: String,
        pub message: String,
    }
}

wire! {
    /// One reason the input was rejected.
    pub struct Rejection<E> {
        pub error: E,
        pub path: String,
        pub message: String,
    }
}

wire! {
    #[derive(Copy, Eq)]
    pub enum UndeterminedReason {
        /// The operation exists in the contract but not yet in the implementation.
        NotImplemented,
        /// An iterative method stopped without converging.
        DidNotConverge,
        /// The input is valid but does not say enough to decide.
        InputInsufficient,
        /// The input is outside the range the procedure has been validated for.
        OutsideValidatedRange,
    }
}

wire! {
    /// One reason the procedure could not decide.
    pub struct Undetermined {
        pub reason: UndeterminedReason,
        pub path: String,
        pub message: String,
    }
}

wire! {
    /// Three-way result. `Undetermined` is not a failure and not a pass: it means "cannot
    /// evaluate", and a verifier must never count it as accepted.
    #[serde(tag = "status")]
    pub enum Outcome<T, E> {
        Ok { value: T, warnings: Vec<Warning> },
        Rejected { violations: Vec<Rejection<E>> },
        Undetermined { reasons: Vec<Undetermined> },
    }
}

wire! {
    #[derive(Copy, Eq, Hash)]
    pub enum Verdict { Accept, Reject, Unknown }
}

impl<T, E> Outcome<T, E> {
    pub fn ok(value: T) -> Self {
        Outcome::Ok { value, warnings: Vec::new() }
    }
    pub fn reject(error: E, path: impl Into<String>, message: impl Into<String>) -> Self {
        Outcome::Rejected {
            violations: vec![Rejection { error, path: path.into(), message: message.into() }],
        }
    }
    pub fn verdict(&self) -> Verdict {
        match self {
            Outcome::Ok { .. } => Verdict::Accept,
            Outcome::Rejected { .. } => Verdict::Reject,
            Outcome::Undetermined { .. } => Verdict::Unknown,
        }
    }
    pub fn into_value(self) -> Option<T> {
        match self {
            Outcome::Ok { value, .. } => Some(value),
            _ => None,
        }
    }
}

// ------------------------------------------------------------ provenance and staleness

wire! {
    pub struct ProcedureId {
        pub key: String,
        pub version: u32,
    }
}

wire! {
    /// One entity the procedure read, at the revision it read.
    pub struct ReadRef {
        pub kind: String,
        pub id: Uuid,
        pub revision: Revision,
    }
}

wire! {
    /// How trustworthy a computed result is. Assigned by an independent verifier, never by
    /// the procedure that produced the result.
    #[derive(Copy, Eq, Hash)]
    pub enum Assurance { Proven, Checked, Estimated, Unknown }
}

wire! {
    /// What a result needs in order to be explained and reproduced.
    pub struct Provenance {
        pub procedure: ProcedureId,
        pub ctx: Ctx,
        /// Entities read, with the revision of each. This is the dependency record.
        pub reads: Vec<ReadRef>,
        /// Content hash of the canonical input (hex). Computed by the harness.
        pub input_hash: String,
    }
}

wire! {
    /// A stored result: provenance, the three-way outcome, and an assurance level.
    pub struct ResultRecord<T, E> {
        pub provenance: Provenance,
        pub outcome: Outcome<T, E>,
        pub assurance: Assurance,
    }
}

impl<T, E> ResultRecord<T, E> {
    /// A result is stale when any entity it read has a different revision now, or no longer
    /// exists. Unrelated edits do not make it stale. `current` returns the present revision
    /// of an entity, or `None` if it is gone.
    pub fn is_stale(&self, current: impl Fn(&ReadRef) -> Option<Revision>) -> bool {
        self.provenance.reads.iter().any(|r| current(r) != Some(r.revision))
    }
}
