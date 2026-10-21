use bonyad_geometry::Kind;

/// Why a store operation did not happen. A failed operation leaves nothing behind: every
/// operation is a single transaction.
#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    /// The database has no project row; the seed has not been run.
    #[error("no project exists; seed the database")]
    NoProject,
    /// No entity has this id.
    #[error("entity not found")]
    NotFound,
    /// The id is already used by an entity with different content.
    #[error("id is already in use by a different entity")]
    IdInUse,
    /// A replacement geometry has a different kind from the entity it replaces.
    #[error("expected a {} geometry, got a {}", .existing.as_str(), .got.as_str())]
    KindMismatch { existing: Kind, got: Kind },
    /// Rows that should agree do not (for example an entity without its geometry row).
    #[error("inconsistent data: {0}")]
    Corrupt(String),
    /// The database refused or failed.
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}
