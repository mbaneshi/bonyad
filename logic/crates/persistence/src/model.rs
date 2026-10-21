use bonyad_geometry::{Geometry, Kind};
use time::OffsetDateTime;
use uuid::Uuid;

/// The single project of this lab: its unit and coordinate frame.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Project {
    pub id: Uuid,
    pub name: String,
    pub unit: String,
    pub frame: String,
    pub revision: i64,
}

/// A stored entity with its geometry.
#[derive(Debug, Clone, PartialEq)]
pub struct Entity {
    pub id: Uuid,
    pub label: Option<String>,
    pub geometry: Geometry,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

impl Entity {
    pub fn kind(&self) -> Kind {
        self.geometry.kind()
    }
}

/// An entity to create. When `id` is `None` the store generates a time-ordered UUID.
#[derive(Debug, Clone, PartialEq)]
pub struct NewEntity {
    pub id: Option<Uuid>,
    pub label: Option<String>,
    pub geometry: Geometry,
}

/// The result of a create.
#[derive(Debug, Clone, PartialEq)]
pub struct Created {
    pub entity: Entity,
    /// `true` when the same id and content already existed, so nothing was written.
    pub already_existed: bool,
}
