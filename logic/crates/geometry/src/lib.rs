//! Concrete 2D geometry for the first slice: types, validation, calculations.
//!
//! This crate is **pure**: no database, network, async runtime or framework. Everything
//! here is a deterministic function of its inputs, so it is tested without any service
//! running and can be called from the server, tests and tools alike.
//!
//! There is deliberately no shared "core" abstraction yet; concrete types live here until
//! an implemented case needs something more general.

mod measure;
mod types;
mod validate;
mod violation;

pub use measure::{Measure, area, length, measure, perimeter, signed_area};
pub use types::{Geometry, Kind, LineGeometry, Point2, SurfaceGeometry};
pub use validate::{ZERO_AREA_EPS, ZERO_LENGTH_EPS, validate, validate_replacement};
pub use violation::{Violation, ViolationCode};
