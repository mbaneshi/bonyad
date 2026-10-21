use std::collections::HashMap;

use bonyad_geometry::{Geometry, Kind, LineGeometry, Point2, SurfaceGeometry};
use sqlx::postgres::PgPoolOptions;
use sqlx::{FromRow, PgConnection, PgPool};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::error::StoreError;
use crate::model::{Created, Entity, NewEntity, Project};

// Queries are plain SQL with typed row structs, checked at run time against the real
// schema by the integration tests (`tests/`). SQLx's compile-time macros are not used yet:
// they parse every `.env` in every parent directory and fail on any file they cannot
// read, which breaks builds on machines with an unrelated stray `.env` above the repo.
// The SQL below is macro-ready if that changes.

const FIRST_PROJECT_ID: &str = "select id from bonyad.projects order by created_at, id limit 1";

/// Handle to the database. Cheap to clone (a connection pool underneath).
#[derive(Clone)]
pub struct Store {
    pool: PgPool,
}

#[derive(FromRow)]
struct ProjectRow {
    id: Uuid,
    name: String,
    unit: String,
    frame: String,
}

#[derive(FromRow)]
struct HeadRow {
    id: Uuid,
    kind: String,
    label: Option<String>,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

#[derive(FromRow)]
struct PointRow {
    entity_id: Uuid,
    x: f64,
    y: f64,
}

#[derive(FromRow)]
struct LineRow {
    entity_id: Uuid,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
}

impl Store {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(database_url)
            .await?;
        Ok(Self { pool })
    }

    /// Is the database reachable?
    pub async fn ping(&self) -> Result<(), sqlx::Error> {
        sqlx::query_scalar::<_, i32>("select 1")
            .fetch_one(&self.pool)
            .await
            .map(|_| ())
    }

    /// The single project of this lab.
    pub async fn project(&self) -> Result<Project, StoreError> {
        let row = sqlx::query_as::<_, ProjectRow>(
            "select id, name, unit, frame from bonyad.projects order by created_at, id limit 1",
        )
        .fetch_optional(&self.pool)
        .await?
        .ok_or(StoreError::NoProject)?;
        Ok(Project {
            id: row.id,
            name: row.name,
            unit: row.unit,
            frame: row.frame,
        })
    }

    /// Every entity of the project, oldest first.
    pub async fn entities(&self) -> Result<Vec<Entity>, StoreError> {
        let project = self.project().await?;
        let mut conn = self.pool.acquire().await?;
        load(&mut conn, project.id, None).await
    }

    /// One entity by id.
    pub async fn entity(&self, id: Uuid) -> Result<Entity, StoreError> {
        let project = self.project().await?;
        let mut conn = self.pool.acquire().await?;
        load(&mut conn, project.id, Some(id))
            .await?
            .pop()
            .ok_or(StoreError::NotFound)
    }

    /// Create an entity in one transaction.
    ///
    /// Repeating a create with the same `id` and identical content returns the existing
    /// entity and writes nothing; the same `id` with different content is `IdInUse`. That
    /// makes a retried request harmless without any server-side idempotency bookkeeping.
    pub async fn create(&self, new: NewEntity) -> Result<Created, StoreError> {
        let id = new.id.unwrap_or_else(Uuid::now_v7);
        // A concurrent create of the same id can win the race between our lookup and our
        // insert. The second attempt then finds it and compares content.
        for attempt in 0..2 {
            match self.try_create(id, &new).await {
                Err(StoreError::IdInUse) if attempt == 0 => continue,
                other => return other,
            }
        }
        Err(StoreError::IdInUse)
    }

    async fn try_create(&self, id: Uuid, new: &NewEntity) -> Result<Created, StoreError> {
        let mut tx = self.pool.begin().await?;
        let project_id = sqlx::query_scalar::<_, Uuid>(FIRST_PROJECT_ID)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::NoProject)?;

        if let Some(existing) = load(&mut tx, project_id, Some(id)).await?.pop() {
            return if existing.geometry == new.geometry && existing.label == new.label {
                Ok(Created {
                    entity: existing,
                    already_existed: true,
                })
            } else {
                Err(StoreError::IdInUse)
            };
        }

        let inserted = sqlx::query(
            "insert into bonyad.entities (id, project_id, kind, label) values ($1, $2, $3, $4)",
        )
        .bind(id)
        .bind(project_id)
        .bind(new.geometry.kind().as_str())
        .bind(&new.label)
        .execute(&mut *tx)
        .await;
        match inserted {
            Ok(_) => {}
            Err(sqlx::Error::Database(e)) if e.is_unique_violation() => {
                return Err(StoreError::IdInUse);
            }
            Err(e) => return Err(e.into()),
        }
        insert_geometry(&mut tx, id, &new.geometry).await?;

        let entity = load(&mut tx, project_id, Some(id))
            .await?
            .pop()
            .ok_or_else(|| StoreError::Corrupt("created entity vanished".into()))?;
        tx.commit().await?;
        Ok(Created {
            entity,
            already_existed: false,
        })
    }

    /// Replace an entity's geometry. The kind of an entity never changes.
    pub async fn replace_geometry(
        &self,
        id: Uuid,
        geometry: &Geometry,
    ) -> Result<Entity, StoreError> {
        let mut tx = self.pool.begin().await?;
        let project_id = sqlx::query_scalar::<_, Uuid>(FIRST_PROJECT_ID)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or(StoreError::NoProject)?;

        let kind = sqlx::query_scalar::<_, String>(
            "select kind from bonyad.entities where id = $1 for update",
        )
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(StoreError::NotFound)?;
        let existing = kind_from_str(&kind)?;
        if existing != geometry.kind() {
            return Err(StoreError::KindMismatch {
                existing,
                got: geometry.kind(),
            });
        }

        update_geometry(&mut tx, id, geometry).await?;
        sqlx::query("update bonyad.entities set updated_at = now() where id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        let entity = load(&mut tx, project_id, Some(id))
            .await?
            .pop()
            .ok_or(StoreError::NotFound)?;
        tx.commit().await?;
        Ok(entity)
    }

    /// Delete an entity; its geometry rows go with it.
    pub async fn delete(&self, id: Uuid) -> Result<(), StoreError> {
        let result = sqlx::query("delete from bonyad.entities where id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            Err(StoreError::NotFound)
        } else {
            Ok(())
        }
    }
}

fn kind_from_str(kind: &str) -> Result<Kind, StoreError> {
    match kind {
        "point" => Ok(Kind::Point),
        "line" => Ok(Kind::Line),
        "surface" => Ok(Kind::Surface),
        other => Err(StoreError::Corrupt(format!(
            "unknown entity kind {other:?}"
        ))),
    }
}

/// Load entities (all of the project, or just `only`) with their geometry: one query for the
/// entity rows and one per geometry table, assembled here, never one query per entity.
async fn load(
    conn: &mut PgConnection,
    project_id: Uuid,
    only: Option<Uuid>,
) -> Result<Vec<Entity>, StoreError> {
    let heads = sqlx::query_as::<_, HeadRow>(
        "select id, kind, label, created_at, updated_at
         from bonyad.entities
         where project_id = $1 and ($2::uuid is null or id = $2)
         order by created_at, id",
    )
    .bind(project_id)
    .bind(only)
    .fetch_all(&mut *conn)
    .await?;

    let mut points: HashMap<Uuid, Point2> = sqlx::query_as::<_, PointRow>(
        "select p.entity_id, p.x, p.y
         from bonyad.points p join bonyad.entities e on e.id = p.entity_id
         where e.project_id = $1 and ($2::uuid is null or e.id = $2)",
    )
    .bind(project_id)
    .bind(only)
    .fetch_all(&mut *conn)
    .await?
    .into_iter()
    .map(|r| (r.entity_id, Point2::new(r.x, r.y)))
    .collect();

    let mut lines: HashMap<Uuid, LineGeometry> = sqlx::query_as::<_, LineRow>(
        "select l.entity_id, l.x1, l.y1, l.x2, l.y2
         from bonyad.lines l join bonyad.entities e on e.id = l.entity_id
         where e.project_id = $1 and ($2::uuid is null or e.id = $2)",
    )
    .bind(project_id)
    .bind(only)
    .fetch_all(&mut *conn)
    .await?
    .into_iter()
    .map(|r| {
        (
            r.entity_id,
            LineGeometry {
                a: Point2::new(r.x1, r.y1),
                b: Point2::new(r.x2, r.y2),
            },
        )
    })
    .collect();

    let mut rings: HashMap<Uuid, Vec<Point2>> = HashMap::new();
    for r in sqlx::query_as::<_, PointRow>(
        "select v.entity_id, v.x, v.y
         from bonyad.surface_vertices v join bonyad.entities e on e.id = v.entity_id
         where e.project_id = $1 and ($2::uuid is null or e.id = $2)
         order by v.entity_id, v.position",
    )
    .bind(project_id)
    .bind(only)
    .fetch_all(&mut *conn)
    .await?
    {
        rings
            .entry(r.entity_id)
            .or_default()
            .push(Point2::new(r.x, r.y));
    }

    heads
        .into_iter()
        .map(|h| {
            let missing = |what: &str| {
                StoreError::Corrupt(format!("{what} entity {} has no geometry row", h.id))
            };
            let geometry = match kind_from_str(&h.kind)? {
                Kind::Point => {
                    Geometry::Point(points.remove(&h.id).ok_or_else(|| missing("point"))?)
                }
                Kind::Line => Geometry::Line(lines.remove(&h.id).ok_or_else(|| missing("line"))?),
                // A surface with no vertex rows is possible only by bypassing validation; it
                // loads as an empty ring, which validation then reports as too few vertices.
                Kind::Surface => Geometry::Surface(SurfaceGeometry {
                    vertices: rings.remove(&h.id).unwrap_or_default(),
                }),
            };
            Ok(Entity {
                id: h.id,
                label: h.label,
                geometry,
                created_at: h.created_at,
                updated_at: h.updated_at,
            })
        })
        .collect()
}

async fn insert_geometry(
    conn: &mut PgConnection,
    id: Uuid,
    geometry: &Geometry,
) -> Result<(), StoreError> {
    match geometry {
        Geometry::Point(p) => {
            sqlx::query("insert into bonyad.points (entity_id, x, y) values ($1, $2, $3)")
                .bind(id)
                .bind(p.x)
                .bind(p.y)
                .execute(&mut *conn)
                .await?;
        }
        Geometry::Line(l) => {
            sqlx::query(
                "insert into bonyad.lines (entity_id, x1, y1, x2, y2) values ($1, $2, $3, $4, $5)",
            )
            .bind(id)
            .bind(l.a.x)
            .bind(l.a.y)
            .bind(l.b.x)
            .bind(l.b.y)
            .execute(&mut *conn)
            .await?;
        }
        Geometry::Surface(s) => {
            sqlx::query("insert into bonyad.surfaces (entity_id) values ($1)")
                .bind(id)
                .execute(&mut *conn)
                .await?;
            insert_vertices(conn, id, s).await?;
        }
    }
    Ok(())
}

async fn update_geometry(
    conn: &mut PgConnection,
    id: Uuid,
    geometry: &Geometry,
) -> Result<(), StoreError> {
    match geometry {
        Geometry::Point(p) => {
            sqlx::query("update bonyad.points set x = $2, y = $3 where entity_id = $1")
                .bind(id)
                .bind(p.x)
                .bind(p.y)
                .execute(&mut *conn)
                .await?;
        }
        Geometry::Line(l) => {
            sqlx::query(
                "update bonyad.lines set x1 = $2, y1 = $3, x2 = $4, y2 = $5 where entity_id = $1",
            )
            .bind(id)
            .bind(l.a.x)
            .bind(l.a.y)
            .bind(l.b.x)
            .bind(l.b.y)
            .execute(&mut *conn)
            .await?;
        }
        Geometry::Surface(s) => {
            sqlx::query("delete from bonyad.surface_vertices where entity_id = $1")
                .bind(id)
                .execute(&mut *conn)
                .await?;
            insert_vertices(conn, id, s).await?;
        }
    }
    Ok(())
}

async fn insert_vertices(
    conn: &mut PgConnection,
    id: Uuid,
    surface: &SurfaceGeometry,
) -> Result<(), StoreError> {
    let positions: Vec<i32> = (0..surface.vertices.len())
        .map(|i| i32::try_from(i).unwrap_or(i32::MAX))
        .collect();
    let xs: Vec<f64> = surface.vertices.iter().map(|p| p.x).collect();
    let ys: Vec<f64> = surface.vertices.iter().map(|p| p.y).collect();
    sqlx::query(
        "insert into bonyad.surface_vertices (entity_id, position, x, y)
         select $1, t.position, t.x, t.y from unnest($2::int4[], $3::float8[], $4::float8[]) as t(position, x, y)",
    )
    .bind(id)
    .bind(&positions)
    .bind(&xs)
    .bind(&ys)
    .execute(&mut *conn)
    .await?;
    Ok(())
}
