//! The seven operations. Each one follows the same path: validate the geometry, persist in one
//! transaction, return the accepted result. A rejected request changes nothing.

use axum::Json;
use axum::extract::{FromRequest, FromRequestParts, State};
use axum::http::StatusCode;
use bonyad_geometry::{Geometry, Measure, Point2, validate, validate_replacement};
use bonyad_persistence::{NewEntity, Store};
use uuid::Uuid;

use crate::api::{
    CreateLineRequest, CreatePointRequest, CreateSurfaceRequest, EntityView, Health,
    MeasureResponse, ProjectResponse, UpdateGeometryRequest,
};
use crate::error::{ApiError, Problem};

type Result<T> = std::result::Result<T, ApiError>;

/// JSON body whose failures are reported as problem+json instead of plain text.
#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(ApiError))]
pub struct ApiJson<T>(pub T);

/// A path parameter whose failures are reported as problem+json.
#[derive(FromRequestParts)]
#[from_request(via(axum::extract::Path), rejection(ApiError))]
pub struct ApiPath<T>(pub T);

/// Liveness plus a database check.
#[utoipa::path(
    get,
    path = "/healthz",
    tag = "system",
    responses(
        (status = 200, description = "Running, database reachable", body = Health),
        (status = 503, description = "Database unavailable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn healthz(State(store): State<Store>) -> Result<Json<Health>> {
    store.ping().await.map_err(|error| {
        tracing::error!(?error, "database ping failed");
        ApiError::DatabaseUnavailable
    })?;
    Ok(Json(Health {
        status: "ok".into(),
        database: "ok".into(),
    }))
}

/// `GetProject`: the project and every entity with its geometry.
#[utoipa::path(
    get,
    path = "/v1/project",
    tag = "project",
    responses(
        (status = 200, body = ProjectResponse),
        (status = 503, description = "No project seeded", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn get_project(State(store): State<Store>) -> Result<Json<ProjectResponse>> {
    let project = store.project().await?;
    let entities = store
        .entities()
        .await?
        .into_iter()
        .map(EntityView::from)
        .collect();
    Ok(Json(ProjectResponse {
        project: project.into(),
        entities,
    }))
}

async fn create(
    store: &Store,
    id: Option<Uuid>,
    label: Option<String>,
    geometry: Geometry,
) -> Result<(StatusCode, Json<EntityView>)> {
    validate(&geometry).map_err(ApiError::InvalidGeometry)?;
    let created = store
        .create(NewEntity {
            id,
            label,
            geometry,
        })
        .await?;
    let status = if created.already_existed {
        StatusCode::OK
    } else {
        StatusCode::CREATED
    };
    Ok((status, Json(created.entity.into())))
}

/// `CreatePoint`.
#[utoipa::path(
    post,
    path = "/v1/points",
    tag = "entities",
    request_body = CreatePointRequest,
    responses(
        (status = 201, description = "Created", body = EntityView),
        (status = 200, description = "The same id and content already existed", body = EntityView),
        (status = 409, description = "id_in_use", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "invalid_geometry", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn create_point(
    State(store): State<Store>,
    ApiJson(req): ApiJson<CreatePointRequest>,
) -> Result<(StatusCode, Json<EntityView>)> {
    create(
        &store,
        req.id,
        req.label,
        Geometry::Point(Point2::new(req.x, req.y)),
    )
    .await
}

/// `CreateLine`.
#[utoipa::path(
    post,
    path = "/v1/lines",
    tag = "entities",
    request_body = CreateLineRequest,
    responses(
        (status = 201, description = "Created", body = EntityView),
        (status = 200, description = "The same id and content already existed", body = EntityView),
        (status = 409, description = "id_in_use", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "invalid_geometry", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn create_line(
    State(store): State<Store>,
    ApiJson(req): ApiJson<CreateLineRequest>,
) -> Result<(StatusCode, Json<EntityView>)> {
    create(
        &store,
        req.id,
        req.label,
        Geometry::Line(bonyad_geometry::LineGeometry { a: req.a, b: req.b }),
    )
    .await
}

/// `CreateSurface`.
#[utoipa::path(
    post,
    path = "/v1/surfaces",
    tag = "entities",
    request_body = CreateSurfaceRequest,
    responses(
        (status = 201, description = "Created", body = EntityView),
        (status = 200, description = "The same id and content already existed", body = EntityView),
        (status = 409, description = "id_in_use", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "invalid_geometry", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn create_surface(
    State(store): State<Store>,
    ApiJson(req): ApiJson<CreateSurfaceRequest>,
) -> Result<(StatusCode, Json<EntityView>)> {
    create(
        &store,
        req.id,
        req.label,
        Geometry::Surface(bonyad_geometry::SurfaceGeometry {
            vertices: req.vertices,
        }),
    )
    .await
}

/// `UpdateGeometry`: replace the geometry of an entity with one of the same kind.
#[utoipa::path(
    put,
    path = "/v1/entities/{id}/geometry",
    tag = "entities",
    params(("id" = Uuid, Path, description = "Entity id")),
    request_body = UpdateGeometryRequest,
    responses(
        (status = 200, body = EntityView),
        (status = 404, description = "not_found", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "invalid_geometry (including kind_mismatch)", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn update_geometry(
    State(store): State<Store>,
    ApiPath(id): ApiPath<Uuid>,
    ApiJson(request): ApiJson<UpdateGeometryRequest>,
) -> Result<Json<EntityView>> {
    let existing = store.entity(id).await?;
    validate_replacement(existing.kind(), &request.geometry).map_err(ApiError::InvalidGeometry)?;
    Ok(Json(
        store
            .replace_geometry(id, &request.geometry, request.expected_revision)
            .await?
            .into(),
    ))
}

/// `DeleteEntity`.
#[utoipa::path(
    delete,
    path = "/v1/entities/{id}",
    tag = "entities",
    params(("id" = Uuid, Path, description = "Entity id")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 404, description = "not_found", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn delete_entity(
    State(store): State<Store>,
    ApiPath(id): ApiPath<Uuid>,
) -> Result<StatusCode> {
    store.delete(id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// `MeasureEntity`: a line's length, or a surface's area and perimeter, in project units.
#[utoipa::path(
    get,
    path = "/v1/entities/{id}/measure",
    tag = "entities",
    params(("id" = Uuid, Path, description = "Entity id")),
    responses(
        (status = 200, body = MeasureResponse),
        (status = 404, description = "not_found", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "not_measurable (a point)", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn measure_entity(
    State(store): State<Store>,
    ApiPath(id): ApiPath<Uuid>,
) -> Result<Json<MeasureResponse>> {
    let entity = store.entity(id).await?;
    let unit = store.project().await?.unit;
    let measure = bonyad_geometry::measure(&entity.geometry).ok_or(ApiError::NotMeasurable)?;
    Ok(Json(match measure {
        Measure::Line { length } => MeasureResponse::Line {
            entity_id: id,
            length,
            unit,
        },
        Measure::Surface { area, perimeter } => MeasureResponse::Surface {
            entity_id: id,
            area,
            area_unit: format!("{unit}²"),
            perimeter,
            unit,
        },
    }))
}

/// The OpenAPI document this server was built from.
pub async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(crate::openapi())
}

/// Unknown routes get the same problem+json shape as every other error.
pub async fn fallback() -> ApiError {
    ApiError::NotFound
}
