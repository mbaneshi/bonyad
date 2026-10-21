//! The API end to end: real router, real PostgreSQL (a fresh migrated database per test through
//! `#[sqlx::test]`), no mocks. Requests go through the router in-process, so no port is used.
//! Needs `DATABASE_URL` (see the justfile) and the local stack running.

use axum::Router;
use axum::body::Body;
use axum::http::{HeaderMap, Method, Request, StatusCode, header};
use bonyad_persistence::Store;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;

const PROJECT: &str = "00000000-0000-7000-8000-000000000001";

async fn app(pool: &PgPool) -> Router {
    sqlx::query(
        "insert into bonyad.projects (id, name) values ($1::uuid, 'Sample') on conflict do nothing",
    )
    .bind(PROJECT)
    .execute(pool)
    .await
    .unwrap();
    bonyad_server::router(Store::new(pool.clone()))
}

async fn call(
    app: &Router,
    method: Method,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, HeaderMap, Value) {
    let mut request = Request::builder().method(method).uri(uri);
    let body = match body {
        Some(v) => {
            request = request.header(header::CONTENT_TYPE, "application/json");
            Body::from(v.to_string())
        }
        None => Body::empty(),
    };
    let response = app
        .clone()
        .oneshot(request.body(body).unwrap())
        .await
        .unwrap();
    let (parts, body) = response.into_parts();
    let bytes = body.collect().await.unwrap().to_bytes();
    let json = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (parts.status, parts.headers, json)
}

async fn post(app: &Router, uri: &str, body: Value) -> (StatusCode, HeaderMap, Value) {
    call(app, Method::POST, uri, Some(body)).await
}

fn id_of(v: &Value) -> String {
    v["id"].as_str().expect("an id").to_owned()
}

fn assert_problem(
    status: StatusCode,
    headers: &HeaderMap,
    body: &Value,
    expected: StatusCode,
    code: &str,
) {
    assert_eq!(status, expected, "body: {body}");
    assert_eq!(
        headers
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok()),
        Some("application/problem+json")
    );
    assert_eq!(body["code"], code, "body: {body}");
    assert_eq!(body["status"], expected.as_u16());
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn the_acceptance_example_over_http(pool: PgPool) {
    let app = app(&pool).await;

    let (s, _, point) = post(&app, "/v1/points", json!({"x": 1, "y": 1})).await;
    assert_eq!(s, StatusCode::CREATED);
    assert_eq!(
        point["geometry"],
        json!({"kind": "point", "x": 1.0, "y": 1.0})
    );

    let (s, _, line) = post(
        &app,
        "/v1/lines",
        json!({"a": {"x": 0, "y": 0}, "b": {"x": 4, "y": 0}}),
    )
    .await;
    assert_eq!(s, StatusCode::CREATED);
    let line_id = id_of(&line);

    let (s, _, surface) = post(
        &app,
        "/v1/surfaces",
        json!({"vertices": [{"x": 0, "y": 0}, {"x": 4, "y": 0}, {"x": 0, "y": 3}]}),
    )
    .await;
    assert_eq!(s, StatusCode::CREATED);
    let surface_id = id_of(&surface);

    let (s, _, m) = call(
        &app,
        Method::GET,
        &format!("/v1/entities/{line_id}/measure"),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(
        m,
        json!({"kind": "line", "entity_id": line_id, "length": 4.0, "unit": "m"})
    );

    let (_, _, m) = call(
        &app,
        Method::GET,
        &format!("/v1/entities/{surface_id}/measure"),
        None,
    )
    .await;
    assert_eq!(m["kind"], "surface");
    assert_eq!(m["area"], 6.0);
    assert_eq!(m["area_unit"], "m²");
    assert_eq!(m["perimeter"], 12.0);

    // Move the vertex (4,0) to (8,0): area becomes 12.
    // Floats on purpose: serde_json distinguishes 8 from 8.0, and the API returns floats.
    let edit = json!({"kind": "surface", "vertices": [{"x": 0.0, "y": 0.0}, {"x": 8.0, "y": 0.0}, {"x": 0.0, "y": 3.0}]});
    let (s, _, updated) = call(
        &app,
        Method::PUT,
        &format!("/v1/entities/{surface_id}/geometry"),
        Some(json!({"expected_revision": 0, "geometry": edit.clone()})),
    )
    .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(updated["geometry"], edit);
    let (_, _, m) = call(
        &app,
        Method::GET,
        &format!("/v1/entities/{surface_id}/measure"),
        None,
    )
    .await;
    assert_eq!(m["area"], 12.0);

    let (s, _, project_after_edit) = call(&app, Method::GET, "/v1/project", None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(project_after_edit["project"]["revision"], 1);

    // A second writer using the old observation cannot overwrite the accepted edit.
    let stale = json!({
        "expected_revision": 0,
        "geometry": {"kind": "surface", "vertices": [{"x": 0.0, "y": 0.0}, {"x": 6.0, "y": 0.0}, {"x": 0.0, "y": 3.0}]}
    });
    let (s, h, b) = call(
        &app,
        Method::PUT,
        &format!("/v1/entities/{surface_id}/geometry"),
        Some(stale),
    )
    .await;
    assert_problem(s, &h, &b, StatusCode::CONFLICT, "revision_conflict");
    assert_eq!(b["expected_revision"], 0);
    assert_eq!(b["current_revision"], 1);

    let snapshots: i64 = sqlx::query_scalar(
        "select count(*) from bonyad.revision_entities where project_id = $1::uuid and revision = 1",
    )
    .bind(PROJECT)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(snapshots, 3);

    // "Reload": a brand-new router on the same database recovers the accepted state.
    let reloaded = bonyad_server::router(Store::new(pool.clone()));
    let (s, _, project) = call(&reloaded, Method::GET, "/v1/project", None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(project["project"]["unit"], "m");
    assert_eq!(project["project"]["frame"], "local-cartesian");
    let entities = project["entities"].as_array().unwrap();
    assert_eq!(entities.len(), 3);
    let reloaded_surface = entities
        .iter()
        .find(|e| e["id"] == surface_id.as_str())
        .unwrap();
    assert_eq!(reloaded_surface["geometry"], edit);
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn invalid_geometry_is_rejected_with_violations_and_changes_nothing(pool: PgPool) {
    let app = app(&pool).await;

    let (s, h, b) = post(
        &app,
        "/v1/lines",
        json!({"a": {"x": 2, "y": 2}, "b": {"x": 2, "y": 2}}),
    )
    .await;
    assert_problem(
        s,
        &h,
        &b,
        StatusCode::UNPROCESSABLE_ENTITY,
        "invalid_geometry",
    );
    assert_eq!(b["violations"][0]["code"], "zero_length_line");
    assert_eq!(b["violations"][0]["path"], "b");

    let (s, h, b) = post(
        &app,
        "/v1/surfaces",
        json!({"vertices": [{"x": 0, "y": 0}, {"x": 1, "y": 0}]}),
    )
    .await;
    assert_problem(
        s,
        &h,
        &b,
        StatusCode::UNPROCESSABLE_ENTITY,
        "invalid_geometry",
    );
    assert_eq!(b["violations"][0]["code"], "too_few_vertices");

    let (_, _, b) = post(
        &app,
        "/v1/surfaces",
        json!({"vertices": [{"x": 0, "y": 0}, {"x": 1, "y": 1}, {"x": 2, "y": 2}]}),
    )
    .await;
    assert_eq!(b["violations"][0]["code"], "degenerate_surface");

    let bow_tie = json!({"vertices": [{"x": 0, "y": 0}, {"x": 4, "y": 4}, {"x": 4, "y": 0}, {"x": 0, "y": 4}]});
    let (_, _, b) = post(&app, "/v1/surfaces", bow_tie).await;
    assert_eq!(b["violations"][0]["code"], "self_intersecting_surface");

    // Nothing was written by any of the rejected requests.
    let (_, _, project) = call(&app, Method::GET, "/v1/project", None).await;
    assert_eq!(project["entities"], json!([]));
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn an_invalid_edit_leaves_the_entity_as_it_was(pool: PgPool) {
    let app = app(&pool).await;
    let (_, _, created) = post(
        &app,
        "/v1/surfaces",
        json!({"vertices": [{"x": 0, "y": 0}, {"x": 4, "y": 0}, {"x": 0, "y": 3}]}),
    )
    .await;
    let id = id_of(&created);

    let collapsed = json!({"kind": "surface", "vertices": [{"x": 0, "y": 0}, {"x": 4, "y": 0}, {"x": 8, "y": 0}]});
    let (s, h, b) = call(
        &app,
        Method::PUT,
        &format!("/v1/entities/{id}/geometry"),
        Some(json!({"expected_revision": 0, "geometry": collapsed})),
    )
    .await;
    assert_problem(
        s,
        &h,
        &b,
        StatusCode::UNPROCESSABLE_ENTITY,
        "invalid_geometry",
    );

    let (_, _, m) = call(
        &app,
        Method::GET,
        &format!("/v1/entities/{id}/measure"),
        None,
    )
    .await;
    assert_eq!(m["area"], 6.0);
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn an_edit_must_keep_the_kind(pool: PgPool) {
    let app = app(&pool).await;
    let (_, _, created) = post(&app, "/v1/points", json!({"x": 1, "y": 1})).await;
    let id = id_of(&created);

    let (s, h, b) = call(
        &app,
        Method::PUT,
        &format!("/v1/entities/{id}/geometry"),
        Some(json!({"expected_revision": 0, "geometry": {"kind": "line", "a": {"x": 0, "y": 0}, "b": {"x": 1, "y": 1}}})),
    )
    .await;
    assert_problem(
        s,
        &h,
        &b,
        StatusCode::UNPROCESSABLE_ENTITY,
        "invalid_geometry",
    );
    assert_eq!(b["violations"][0]["code"], "kind_mismatch");
    assert_eq!(b["violations"][0]["path"], "kind");
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn unknown_things_are_not_found_in_the_same_shape(pool: PgPool) {
    let app = app(&pool).await;
    let ghost = "018f0000-0000-7000-8000-000000000000";

    for (method, uri, body) in [
        (Method::GET, format!("/v1/entities/{ghost}/measure"), None),
        (Method::DELETE, format!("/v1/entities/{ghost}"), None),
        (
            Method::PUT,
            format!("/v1/entities/{ghost}/geometry"),
            Some(json!({"expected_revision": 0, "geometry": {"kind": "point", "x": 0, "y": 0}})),
        ),
        (Method::GET, "/v1/nope".to_owned(), None),
    ] {
        let (s, h, b) = call(&app, method.clone(), &uri, body).await;
        assert_problem(s, &h, &b, StatusCode::NOT_FOUND, "not_found");
    }
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn malformed_requests_are_bad_requests(pool: PgPool) {
    let app = app(&pool).await;

    let (s, h, b) = call(&app, Method::GET, "/v1/entities/not-a-uuid/measure", None).await;
    assert_problem(s, &h, &b, StatusCode::BAD_REQUEST, "invalid_request");

    let (s, h, b) = post(&app, "/v1/points", json!({"x": 1})).await; // y is missing
    assert_problem(s, &h, &b, StatusCode::BAD_REQUEST, "invalid_request");

    let (s, h, b) = post(&app, "/v1/points", json!({"x": 1, "y": 1, "colour": "red"})).await; // unknown field
    assert_problem(s, &h, &b, StatusCode::BAD_REQUEST, "invalid_request");

    let request = Request::builder()
        .method(Method::POST)
        .uri("/v1/points")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from("{not json"))
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok()),
        Some("application/problem+json")
    );
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn repeating_a_create_with_the_same_id_creates_no_duplicate(pool: PgPool) {
    let app = app(&pool).await;
    let id = "018f1111-0000-7000-8000-000000000001";
    let body = json!({"id": id, "label": "A", "x": 1, "y": 1});

    let (s1, _, first) = post(&app, "/v1/points", body.clone()).await;
    let (s2, _, second) = post(&app, "/v1/points", body.clone()).await;
    assert_eq!(s1, StatusCode::CREATED);
    assert_eq!(s2, StatusCode::OK);
    assert_eq!(first, second);

    let (_, _, project) = call(&app, Method::GET, "/v1/project", None).await;
    assert_eq!(project["entities"].as_array().unwrap().len(), 1);

    let (s, h, b) = post(
        &app,
        "/v1/points",
        json!({"id": id, "label": "A", "x": 9, "y": 9}),
    )
    .await;
    assert_problem(s, &h, &b, StatusCode::CONFLICT, "id_in_use");
    let (_, _, project) = call(&app, Method::GET, "/v1/project", None).await;
    assert_eq!(project["entities"][0]["geometry"]["x"], 1.0);
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn a_point_cannot_be_measured(pool: PgPool) {
    let app = app(&pool).await;
    let (_, _, created) = post(&app, "/v1/points", json!({"x": 1, "y": 1})).await;
    let (s, h, b) = call(
        &app,
        Method::GET,
        &format!("/v1/entities/{}/measure", id_of(&created)),
        None,
    )
    .await;
    assert_problem(
        s,
        &h,
        &b,
        StatusCode::UNPROCESSABLE_ENTITY,
        "not_measurable",
    );
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn deleting_a_surface_removes_it_and_its_vertices(pool: PgPool) {
    let app = app(&pool).await;
    let (_, _, created) = post(
        &app,
        "/v1/surfaces",
        json!({"vertices": [{"x": 0, "y": 0}, {"x": 4, "y": 0}, {"x": 0, "y": 3}]}),
    )
    .await;
    let id = id_of(&created);

    let (s, _, _) = call(&app, Method::DELETE, &format!("/v1/entities/{id}"), None).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    let (s, _, _) = call(
        &app,
        Method::GET,
        &format!("/v1/entities/{id}/measure"),
        None,
    )
    .await;
    assert_eq!(s, StatusCode::NOT_FOUND);
    let vertices: i64 = sqlx::query_scalar("select count(*) from bonyad.surface_vertices")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(vertices, 0);
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn every_response_carries_a_request_id_and_a_supplied_one_is_kept(pool: PgPool) {
    let app = app(&pool).await;

    let (_, headers, _) = call(&app, Method::GET, "/healthz", None).await;
    assert!(headers.get("x-request-id").is_some_and(|v| !v.is_empty()));

    let request = Request::builder()
        .uri("/healthz")
        .header("x-request-id", "trace-me-123")
        .body(Body::empty())
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(
        response
            .headers()
            .get("x-request-id")
            .and_then(|v| v.to_str().ok()),
        Some("trace-me-123")
    );

    // Errors carry it too.
    let (_, headers, _) = call(&app, Method::GET, "/v1/nope", None).await;
    assert!(headers.get("x-request-id").is_some());
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn health_reports_the_database(pool: PgPool) {
    let app = app(&pool).await;
    let (s, _, b) = call(&app, Method::GET, "/healthz", None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(b, json!({"status": "ok", "database": "ok"}));
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn an_unseeded_database_says_so(pool: PgPool) {
    let app = bonyad_server::router(Store::new(pool));
    let (s, h, b) = call(&app, Method::GET, "/v1/project", None).await;
    assert_problem(
        s,
        &h,
        &b,
        StatusCode::SERVICE_UNAVAILABLE,
        "project_not_seeded",
    );
}

#[sqlx::test(migrations = "../../../db/migrations")]
async fn the_served_openapi_document_is_the_generated_one(pool: PgPool) {
    let app = app(&pool).await;
    let (s, _, served) = call(&app, Method::GET, "/openapi.json", None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(
        served,
        serde_json::to_value(bonyad_server::openapi()).unwrap()
    );
}
