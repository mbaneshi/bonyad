//! The Bonyad HTTP API.
//!
//! Local, single-user lab: there is no authentication, so the binary refuses to listen on a
//! non-loopback address unless explicitly told to (see `main.rs`).

mod api;
mod error;
mod routes;

use axum::Router;
use axum::http::Request;
use axum::routing::{delete, get, post, put};
use bonyad_persistence::Store;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::trace::TraceLayer;
use utoipa::OpenApi;

pub use api::*;
pub use error::{ApiError, Problem};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Bonyad API",
        description = "Point, line and surface: the first slice."
    ),
    paths(
        routes::healthz,
        routes::get_project,
        routes::create_point,
        routes::create_line,
        routes::create_surface,
        routes::update_geometry,
        routes::delete_entity,
        routes::measure_entity,
    ),
    components(schemas(
        Problem,
        bonyad_geometry::Violation,
        bonyad_geometry::ViolationCode,
        bonyad_geometry::Geometry,
        bonyad_geometry::Point2,
        bonyad_geometry::LineGeometry,
        bonyad_geometry::SurfaceGeometry,
    ))
)]
struct ApiDoc;

/// The OpenAPI document for this API. `contracts/openapi.json` is generated from it, and a
/// test fails if the committed copy drifts.
pub fn openapi() -> utoipa::openapi::OpenApi {
    ApiDoc::openapi()
}

/// The router, with a request id on every request and response (`x-request-id`) and a trace
/// span per request that carries it.
pub fn router(store: Store) -> Router {
    Router::new()
        .route("/healthz", get(routes::healthz))
        .route("/openapi.json", get(routes::openapi_json))
        .route("/v1/project", get(routes::get_project))
        .route("/v1/points", post(routes::create_point))
        .route("/v1/lines", post(routes::create_line))
        .route("/v1/surfaces", post(routes::create_surface))
        .route("/v1/entities/{id}", delete(routes::delete_entity))
        .route("/v1/entities/{id}/geometry", put(routes::update_geometry))
        .route("/v1/entities/{id}/measure", get(routes::measure_entity))
        .fallback(routes::fallback)
        .with_state(store)
        // Layers wrap from the inside out: the id is set first, traced, then echoed back.
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(TraceLayer::new_for_http().make_span_with(|request: &Request<_>| {
            let request_id = request.headers().get("x-request-id").and_then(|v| v.to_str().ok()).unwrap_or("-");
            tracing::info_span!("request", method = %request.method(), path = %request.uri().path(), request_id = %request_id)
        }))
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
}
