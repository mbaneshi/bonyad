//! Plain value types shared by many procedures. Units are not stored here: they belong to
//! the project frame in [`Ctx`](crate::contract::Ctx). Angles are always radians.

use crate::contract::{Id, Revision};
use crate::entities::Body;

wire! {
    #[derive(Copy)]
    pub struct Point2 { pub x: f64, pub y: f64 }
}
wire! {
    #[derive(Copy)]
    pub struct Point3 { pub x: f64, pub y: f64, pub z: f64 }
}
impl Point3 {
    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Point3 { x, y, z }
    }
}
impl Point2 {
    pub const fn new(x: f64, y: f64) -> Self {
        Point2 { x, y }
    }
}

/// A direction or offset in 3D.
pub type Vector3 = [f64; 3];

wire! {
    pub struct Plane { pub origin: Point3, pub normal: Vector3 }
}
wire! {
    pub struct Axis { pub origin: Point3, pub direction: Vector3 }
}
wire! {
    /// A 4x4 affine transform, row-major. Points and vectors transform differently; a
    /// procedure that takes a `Transform3` says which it applies it to.
    pub struct Transform3 { pub m: [[f64; 4]; 4] }
}
wire! {
    #[derive(Copy)]
    pub struct Aabb3 { pub min: Point3, pub max: Point3 }
}
wire! {
    #[derive(Copy)]
    pub struct Interval { pub min: f64, pub max: f64 }
}
wire! {
    /// An open ring: `A, B, C`, with the closing edge implied (Bonyad's surface convention).
    pub struct Ring2 { pub vertices: Vec<Point2> }
}
wire! {
    /// A parametric expression: a number, a parameter name or a formula, optionally with
    /// units (for example `"30 deg"`, `"wall_height * 2"`). Parsed by the procedure.
    #[serde(transparent)]
    pub struct Expr(pub String);
}

wire! {
    /// A reference to a persistently named face of a body. `pick` is a fallback location,
    /// used only when the name no longer resolves (and then reported as a warning).
    pub struct FaceRef { pub body: Id<Body>, pub name: String, pub pick: Option<Point3> }
}
wire! {
    /// A reference to a persistently named edge. Edges are named by the faces they separate.
    pub struct EdgeRef { pub body: Id<Body>, pub name: String, pub pick: Option<Point3> }
}

wire! {
    /// How a procedure changed the set of bodies.
    pub struct BodyChange {
        pub created: Vec<Id<Body>>,
        pub changed: Vec<Id<Body>>,
        pub removed: Vec<Id<Body>>,
    }
}

wire! {
    /// A distance along an alignment, in the frame's length unit.
    #[derive(Copy)]
    #[serde(transparent)]
    pub struct Station(pub f64);
}

wire! {
    /// An entity and the revision a caller expects it to be at (optimistic concurrency).
    pub struct Expected { pub revision: Revision }
}

wire! {
    /// Boolean combination of solids or meshes.
    #[derive(Copy, Eq)]
    pub enum BoolOp { Union, Difference, Intersection, Merge }
}

wire! {
    /// What a modelling feature does to existing bodies.
    #[derive(Copy, Eq)]
    pub enum SolidOp { NewBody, Join, Cut, Intersect }
}

wire! {
    /// The result of importing or exporting: what was kept, changed or dropped.
    pub struct LossReport { pub items: Vec<LossItem> }
}
wire! {
    pub struct LossItem {
        pub code: String,
        pub severity: LossSeverity,
        pub count: u32,
        pub detail: String,
    }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum LossSeverity { Preserved, Changed, Lost }
}

wire! {
    /// A reference to an entity of any kind (for lists of mixed entities).
    pub struct EntityRef { pub kind: String, pub id: uuid::Uuid }
}
