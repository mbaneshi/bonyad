//! Concrete geometry values.
//!
//! Independent geometry: a [`LineGeometry`] owns its two endpoints and a
//! [`SurfaceGeometry`] owns its ordered boundary. Equal coordinates elsewhere imply
//! no connection. Units are not stored here: they belong to the project.

use serde::{Deserialize, Serialize};

/// A 2D point in the project's local Cartesian frame.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point2 {
    pub x: f64,
    pub y: f64,
}

impl Point2 {
    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub(crate) fn is_finite(self) -> bool {
        self.x.is_finite() && self.y.is_finite()
    }
}

/// A straight segment that owns its two endpoints.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct LineGeometry {
    pub a: Point2,
    pub b: Point2,
}

/// A planar polygon that owns its ordered boundary.
///
/// The ring is **open**: it lists `A, B, C`, not `A, B, C, A`. The closing edge from the
/// last vertex back to the first is implied. No holes, no curves.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SurfaceGeometry {
    pub vertices: Vec<Point2>,
}

/// What kind of entity a geometry belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Point,
    Line,
    Surface,
}

impl Kind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Point => "point",
            Self::Line => "line",
            Self::Surface => "surface",
        }
    }
}

/// A geometry of any kind. Serializes with a `kind` tag, for example
/// `{"kind":"point","x":1.0,"y":1.0}`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Geometry {
    Point(Point2),
    Line(LineGeometry),
    Surface(SurfaceGeometry),
}

impl Geometry {
    pub const fn kind(&self) -> Kind {
        match self {
            Self::Point(_) => Kind::Point,
            Self::Line(_) => Kind::Line,
            Self::Surface(_) => Kind::Surface,
        }
    }
}
