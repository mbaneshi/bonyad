//! Persistence against a real PostgreSQL database. Each test gets its own freshly migrated
//! database (`#[sqlx::test]`), so tests never see each other's rows. Needs `DATABASE_URL`
//! (see the justfile) and the local stack running (`just up`).

use bonyad_geometry::{Geometry, Kind, LineGeometry, Point2, SurfaceGeometry};
use bonyad_persistence::{NewEntity, Store, StoreError};
use sqlx::PgPool;
use uuid::Uuid;

const PROJECT: &str = "00000000-0000-7000-8000-000000000001";

async fn seeded(pool: PgPool) -> (Store, PgPool) {
    sqlx::query("insert into bonyad.projects (id, name) values ($1::uuid, 'Sample')")
        .bind(PROJECT)
        .execute(&pool)
        .await
        .unwrap();
    (Store::new(pool.clone()), pool)
}

fn point(x: f64, y: f64) -> Geometry {
    Geometry::Point(Point2::new(x, y))
}
fn line(ax: f64, ay: f64, bx: f64, by: f64) -> Geometry {
    Geometry::Line(LineGeometry {
        a: Point2::new(ax, ay),
        b: Point2::new(bx, by),
    })
}
fn surface(points: &[(f64, f64)]) -> Geometry {
    Geometry::Surface(SurfaceGeometry {
        vertices: points.iter().map(|&(x, y)| Point2::new(x, y)).collect(),
    })
}
fn new(geometry: Geometry) -> NewEntity {
    NewEntity {
        id: None,
        label: None,
        geometry,
    }
}

const MIGRATIONS: &str = "../../../db/migrations";

#[sqlx::test(migrations = "../../../db/migrations")]
async fn the_acceptance_example_is_stored_and_read_back(pool: PgPool) {
    let (store, _) = seeded(pool).await;
    let p = store.create(new(point(1.0, 1.0))).await.unwrap();
    let l = store.create(new(line(0.0, 0.0, 4.0, 0.0))).await.unwrap();
    let s = store
        .create(new(surface(&[(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)])))
        .await
        .unwrap();
    assert!(!p.already_existed && !l.already_existed && !s.already_existed);

    let all = store.entities().await.unwrap();
    assert_eq!(all.len(), 3);
    let geometries: Vec<_> = all.iter().map(|e| e.geometry.clone()).collect();
    assert_eq!(
        geometries,
        [
            point(1.0, 1.0),
            line(0.0, 0.0, 4.0, 0.0),
            surface(&[(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)])
        ]
    );
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn vertex_order_is_preserved(pool: PgPool) {
    let (store, _) = seeded(pool).await;
    let ring = [(5.0, 1.0), (0.0, 0.0), (9.0, 9.0), (2.0, 7.0)];
    let created = store.create(new(surface(&ring))).await.unwrap();
    assert_eq!(
        store.entity(created.entity.id).await.unwrap().geometry,
        surface(&ring)
    );
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn moving_a_surface_vertex_persists_and_survives_a_reload(pool: PgPool) {
    let (store, pool) = seeded(pool).await;
    let id = store
        .create(new(surface(&[(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)])))
        .await
        .unwrap()
        .entity
        .id;

    let edited = surface(&[(0.0, 0.0), (8.0, 0.0), (0.0, 3.0)]);
    let updated = store
        .replace_geometry(id, &edited, store.project().await.unwrap().revision)
        .await
        .unwrap();
    assert_eq!(updated.geometry, edited);
    assert!(updated.updated_at >= updated.created_at);

    // A brand-new handle on the same database sees the accepted state.
    let reloaded = Store::new(pool).entity(id).await.unwrap();
    assert_eq!(reloaded.geometry, edited);
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn repeating_a_create_with_the_same_id_and_content_makes_no_duplicate(pool: PgPool) {
    let (store, _) = seeded(pool).await;
    let id = Uuid::now_v7();
    let first = store
        .create(NewEntity {
            id: Some(id),
            label: Some("A".into()),
            geometry: point(1.0, 1.0),
        })
        .await
        .unwrap();
    let again = store
        .create(NewEntity {
            id: Some(id),
            label: Some("A".into()),
            geometry: point(1.0, 1.0),
        })
        .await
        .unwrap();
    assert!(!first.already_existed);
    assert!(again.already_existed);
    assert_eq!(again.entity, first.entity);
    assert_eq!(store.entities().await.unwrap().len(), 1);
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn the_same_id_with_different_content_is_refused_and_changes_nothing(pool: PgPool) {
    let (store, _) = seeded(pool).await;
    let id = Uuid::now_v7();
    store
        .create(NewEntity {
            id: Some(id),
            label: None,
            geometry: point(1.0, 1.0),
        })
        .await
        .unwrap();

    let err = store
        .create(NewEntity {
            id: Some(id),
            label: None,
            geometry: point(2.0, 2.0),
        })
        .await
        .unwrap_err();
    assert!(matches!(err, StoreError::IdInUse));
    assert_eq!(store.entity(id).await.unwrap().geometry, point(1.0, 1.0));
    assert_eq!(store.entities().await.unwrap().len(), 1);
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn a_replacement_must_keep_the_kind(pool: PgPool) {
    let (store, _) = seeded(pool).await;
    let id = store.create(new(point(1.0, 1.0))).await.unwrap().entity.id;
    let err = store
        .replace_geometry(
            id,
            &line(0.0, 0.0, 1.0, 1.0),
            store.project().await.unwrap().revision,
        )
        .await
        .unwrap_err();
    assert!(matches!(
        err,
        StoreError::KindMismatch {
            existing: Kind::Point,
            got: Kind::Line
        }
    ));
    assert_eq!(store.entity(id).await.unwrap().geometry, point(1.0, 1.0));
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn unknown_ids_are_not_found(pool: PgPool) {
    let (store, _) = seeded(pool).await;
    let ghost = Uuid::now_v7();
    assert!(matches!(
        store.entity(ghost).await.unwrap_err(),
        StoreError::NotFound
    ));
    assert!(matches!(
        store
            .replace_geometry(
                ghost,
                &point(0.0, 0.0),
                store.project().await.unwrap().revision
            )
            .await
            .unwrap_err(),
        StoreError::NotFound
    ));
    assert!(matches!(
        store.delete(ghost).await.unwrap_err(),
        StoreError::NotFound
    ));
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn deleting_a_surface_removes_its_vertices(pool: PgPool) {
    let (store, pool) = seeded(pool).await;
    let id = store
        .create(new(surface(&[(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)])))
        .await
        .unwrap()
        .entity
        .id;
    let before: i64 = sqlx::query_scalar("select count(*) from bonyad.surface_vertices")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(before, 3);

    store.delete(id).await.unwrap();
    let after: i64 = sqlx::query_scalar("select count(*) from bonyad.surface_vertices")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(after, 0);
    assert!(store.entities().await.unwrap().is_empty());
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn without_a_seeded_project_there_is_nothing_to_attach_to(pool: PgPool) {
    let store = Store::new(pool);
    assert!(matches!(
        store.project().await.unwrap_err(),
        StoreError::NoProject
    ));
    assert!(matches!(
        store.create(new(point(0.0, 0.0))).await.unwrap_err(),
        StoreError::NoProject
    ));
}

// ---- Database guarantees -------------------------------------------------------------
// Callers validate geometry first, but the database must hold the line on its own.

#[sqlx::test(migrations = "../../../db/migrations")]
async fn a_failed_create_leaves_nothing_behind(pool: PgPool) {
    let (store, pool) = seeded(pool).await;
    // NaN bypasses validation here on purpose: the database refuses it, and the transaction
    // that already inserted the entity row must roll back with it.
    let err = store.create(new(point(f64::NAN, 1.0))).await.unwrap_err();
    assert!(matches!(err, StoreError::Database(_)), "got {err:?}");
    let entities: i64 = sqlx::query_scalar("select count(*) from bonyad.entities")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(entities, 0);
}

async fn raw_entity(pool: &PgPool, kind: &str) -> Uuid {
    let id = Uuid::now_v7();
    sqlx::query("insert into bonyad.entities (id, project_id, kind) values ($1, $2::uuid, $3)")
        .bind(id)
        .bind(PROJECT)
        .bind(kind)
        .execute(pool)
        .await
        .unwrap();
    id
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn a_points_row_cannot_belong_to_a_line_entity(pool: PgPool) {
    let (_, pool) = seeded(pool).await;
    let line_entity = raw_entity(&pool, "line").await;
    let result = sqlx::query("insert into bonyad.points (entity_id, x, y) values ($1, 1, 1)")
        .bind(line_entity)
        .execute(&pool)
        .await;
    assert!(result.is_err());
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn non_finite_numbers_are_refused_everywhere(pool: PgPool) {
    let (_, pool) = seeded(pool).await;
    for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let p = raw_entity(&pool, "point").await;
        let r = sqlx::query("insert into bonyad.points (entity_id, x, y) values ($1, $2, 1)")
            .bind(p)
            .bind(bad)
            .execute(&pool)
            .await;
        assert!(r.is_err(), "a point accepted {bad}");

        let l = raw_entity(&pool, "line").await;
        let r = sqlx::query(
            "insert into bonyad.lines (entity_id, x1, y1, x2, y2) values ($1, 0, 0, $2, 0)",
        )
        .bind(l)
        .bind(bad)
        .execute(&pool)
        .await;
        assert!(r.is_err(), "a line accepted {bad}");

        let s = raw_entity(&pool, "surface").await;
        sqlx::query("insert into bonyad.surfaces (entity_id) values ($1)")
            .bind(s)
            .execute(&pool)
            .await
            .unwrap();
        let r = sqlx::query(
            "insert into bonyad.surface_vertices (entity_id, position, x, y) values ($1, 0, $2, 0)",
        )
        .bind(s)
        .bind(bad)
        .execute(&pool)
        .await;
        assert!(r.is_err(), "a vertex accepted {bad}");
    }
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn a_vertex_position_cannot_repeat(pool: PgPool) {
    let (_, pool) = seeded(pool).await;
    let s = raw_entity(&pool, "surface").await;
    sqlx::query("insert into bonyad.surfaces (entity_id) values ($1)")
        .bind(s)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "insert into bonyad.surface_vertices (entity_id, position, x, y) values ($1, 0, 0, 0)",
    )
    .bind(s)
    .execute(&pool)
    .await
    .unwrap();
    let again = sqlx::query(
        "insert into bonyad.surface_vertices (entity_id, position, x, y) values ($1, 0, 1, 1)",
    )
    .bind(s)
    .execute(&pool)
    .await;
    assert!(again.is_err());
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn unknown_kinds_and_unknown_projects_are_refused(pool: PgPool) {
    let (_, pool) = seeded(pool).await;
    let bad_kind = sqlx::query(
        "insert into bonyad.entities (id, project_id, kind) values ($1, $2::uuid, 'circle')",
    )
    .bind(Uuid::now_v7())
    .bind(PROJECT)
    .execute(&pool)
    .await;
    assert!(bad_kind.is_err());
    let no_project = sqlx::query(
        "insert into bonyad.entities (id, project_id, kind) values ($1, $2::uuid, 'point')",
    )
    .bind(Uuid::now_v7())
    .bind("00000000-0000-7000-8000-0000000000ff")
    .execute(&pool)
    .await;
    assert!(no_project.is_err());
}

#[test]
fn migrations_path_is_the_single_schema_history() {
    // The macro attribute above cannot use a constant, so pin the path it spells out.
    assert!(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join(MIGRATIONS)
            .is_dir()
    );
}
