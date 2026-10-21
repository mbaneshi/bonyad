//! Request and response shapes. Geometry types come straight from `bonyad-geometry` (through
//! its `openapi` feature), so each shape is defined once.

use bonyad_geometry::{Geometry, Point2};
use bonyad_persistence::{Entity, Project};
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Serialize, ToSchema)]
pub struct Health {
    pub status: String,
    pub database: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ProjectView {
    pub id: Uuid,
    pub name: String,
    /// The length unit of every coordinate (`m`).
    pub unit: String,
    /// The coordinate frame (`local-cartesian`).
    pub frame: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct EntityView {
    pub id: Uuid,
    pub label: Option<String>,
    /// Tagged by `kind`: `point`, `line` or `surface`.
    pub geometry: Geometry,
    /// RFC 3339.
    pub created_at: String,
    /// RFC 3339.
    pub updated_at: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ProjectResponse {
    pub project: ProjectView,
    pub entities: Vec<EntityView>,
}

/// `id` is optional. Supplying it makes a retried request harmless: the same id with the same
/// content returns the existing entity (200), and the same id with different content is
/// `id_in_use` (409).
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreatePointRequest {
    pub id: Option<Uuid>,
    pub label: Option<String>,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateLineRequest {
    pub id: Option<Uuid>,
    pub label: Option<String>,
    pub a: Point2,
    pub b: Point2,
}

/// The ring is open (`A, B, C`); the closing edge is implied.
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateSurfaceRequest {
    pub id: Option<Uuid>,
    pub label: Option<String>,
    pub vertices: Vec<Point2>,
}

/// What a measurement returns, tagged by `kind`. Units come from the project.
#[derive(Debug, Serialize, ToSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MeasureResponse {
    Line {
        entity_id: Uuid,
        length: f64,
        unit: String,
    },
    Surface {
        entity_id: Uuid,
        area: f64,
        area_unit: String,
        perimeter: f64,
        unit: String,
    },
}

impl From<Project> for ProjectView {
    fn from(p: Project) -> Self {
        Self {
            id: p.id,
            name: p.name,
            unit: p.unit,
            frame: p.frame,
        }
    }
}

fn rfc3339(t: OffsetDateTime) -> String {
    t.format(&Rfc3339).unwrap_or_default()
}

impl From<Entity> for EntityView {
    fn from(e: Entity) -> Self {
        Self {
            id: e.id,
            label: e.label,
            geometry: e.geometry,
            created_at: rfc3339(e.created_at),
            updated_at: rfc3339(e.updated_at),
        }
    }
}
