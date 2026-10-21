//! Validation errors with stable machine-readable codes.

use std::fmt;

use serde::{Deserialize, Serialize};

/// Stable codes. The server maps these to the `violations[].code` field of its
/// problem+json errors, and the UI maps them to localized messages. Do not rename.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum ViolationCode {
    /// A coordinate is NaN or infinite.
    NonFiniteCoordinate,
    /// A line's endpoints coincide.
    ZeroLengthLine,
    /// A surface has fewer than three vertices.
    TooFewVertices,
    /// A surface has no area: coincident consecutive vertices, or all vertices collinear.
    DegenerateSurface,
    /// A surface boundary crosses or touches itself.
    SelfIntersectingSurface,
    /// A replacement geometry has a different kind from the entity it replaces.
    KindMismatch,
}

impl ViolationCode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::NonFiniteCoordinate => "non_finite_coordinate",
            Self::ZeroLengthLine => "zero_length_line",
            Self::TooFewVertices => "too_few_vertices",
            Self::DegenerateSurface => "degenerate_surface",
            Self::SelfIntersectingSurface => "self_intersecting_surface",
            Self::KindMismatch => "kind_mismatch",
        }
    }
}

/// One rule that a geometry breaks.
///
/// `path` locates the offending part inside the geometry, for example `x`, `b`,
/// `vertices[2].y` or `vertices`. It is empty when the whole value is at fault.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "openapi", derive(utoipa::ToSchema))]
pub struct Violation {
    pub code: ViolationCode,
    pub path: String,
    pub message: String,
}

impl Violation {
    pub(crate) fn new(
        code: ViolationCode,
        path: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            code,
            path: path.into(),
            message: message.into(),
        }
    }
}

impl fmt::Display for Violation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.path.is_empty() {
            write!(f, "{}: {}", self.code.as_str(), self.message)
        } else {
            write!(
                f,
                "{} at {}: {}",
                self.code.as_str(),
                self.path,
                self.message
            )
        }
    }
}

impl std::error::Error for Violation {}
