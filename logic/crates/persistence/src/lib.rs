//! Persistence for the first slice: SQLx typed SQL (no ORM), one transaction per operation.
//!
//! The database owns integrity (keys, kinds, finite numbers). This crate does not decide
//! what a valid shape is: callers validate with `bonyad-geometry` first, and a shape that
//! slips through is still stopped by the database constraints.

mod error;
mod model;
mod store;

pub use error::StoreError;
pub use model::{Created, Entity, NewEntity, Project};
pub use store::Store;
