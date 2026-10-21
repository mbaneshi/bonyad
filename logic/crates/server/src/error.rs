//! Errors as `application/problem+json` (RFC 9457) with stable machine-readable codes.

use axum::extract::rejection::{JsonRejection, PathRejection};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use bonyad_geometry::{Violation, ViolationCode};
use bonyad_persistence::StoreError;
use serde::Serialize;
use utoipa::ToSchema;

/// The error body. `code` is the stable string to branch on; `title` and `detail` are for
/// people. Geometry failures list every violation with a path, so they can be fixed in one pass.
#[derive(Debug, Serialize, ToSchema)]
pub struct Problem {
    /// Always `about:blank`: the `code` carries the meaning.
    #[serde(rename = "type")]
    pub type_: String,
    pub title: String,
    pub status: u16,
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub violations: Vec<Violation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_revision: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_revision: Option<i64>,
}

#[derive(Debug)]
pub enum ApiError {
    /// The geometry breaks one or more rules (422, `invalid_geometry`).
    InvalidGeometry(Vec<Violation>),
    /// The request could not be read: bad JSON, unknown field, malformed id (400, `invalid_request`).
    BadRequest(String),
    /// No such entity or route (404, `not_found`).
    NotFound,
    /// The id is already used by a different entity (409, `id_in_use`).
    IdInUse,
    /// The caller observed an older accepted project revision (409, `revision_conflict`).
    RevisionConflict { expected: i64, current: i64 },
    /// A point has nothing to measure (422, `not_measurable`).
    NotMeasurable,
    /// The database has no project; run the seed (503, `project_not_seeded`).
    ProjectNotSeeded,
    /// The database cannot be reached (503, `database_unavailable`).
    DatabaseUnavailable,
    /// Anything unexpected; details go to the log, not the client (500, `internal_error`).
    Internal,
}

impl ApiError {
    fn parts(
        &self,
    ) -> (
        StatusCode,
        &'static str,
        &'static str,
        Option<String>,
        Option<i64>,
        Option<i64>,
    ) {
        match self {
            Self::InvalidGeometry(_) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_geometry",
                "Invalid geometry",
                None,
                None,
                None,
            ),
            Self::BadRequest(detail) => (
                StatusCode::BAD_REQUEST,
                "invalid_request",
                "The request could not be read",
                Some(detail.clone()),
                None,
                None,
            ),
            Self::NotFound => (
                StatusCode::NOT_FOUND,
                "not_found",
                "Not found",
                None,
                None,
                None,
            ),
            Self::IdInUse => (
                StatusCode::CONFLICT,
                "id_in_use",
                "The id is already in use by a different entity",
                None,
                None,
                None,
            ),
            Self::RevisionConflict { expected, current } => (
                StatusCode::CONFLICT,
                "revision_conflict",
                "The project changed since it was read",
                Some(format!(
                    "expected revision {expected}, current revision is {current}"
                )),
                Some(*expected),
                Some(*current),
            ),
            Self::NotMeasurable => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "not_measurable",
                "This entity has nothing to measure",
                None,
                None,
                None,
            ),
            Self::ProjectNotSeeded => (
                StatusCode::SERVICE_UNAVAILABLE,
                "project_not_seeded",
                "No project exists",
                Some("run `just seed`".into()),
                None,
                None,
            ),
            Self::DatabaseUnavailable => (
                StatusCode::SERVICE_UNAVAILABLE,
                "database_unavailable",
                "The database is unavailable",
                None,
                None,
                None,
            ),
            Self::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal_error",
                "Something went wrong",
                None,
                None,
                None,
            ),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code, title, detail, expected_revision, current_revision) = self.parts();
        let violations = match self {
            Self::InvalidGeometry(v) => v,
            _ => Vec::new(),
        };
        let body = Problem {
            type_: "about:blank".into(),
            title: title.into(),
            status: status.as_u16(),
            code: code.into(),
            detail,
            violations,
            expected_revision,
            current_revision,
        };
        let bytes = serde_json::to_vec(&body).unwrap_or_else(|_| b"{}".to_vec());
        (
            status,
            [(header::CONTENT_TYPE, "application/problem+json")],
            bytes,
        )
            .into_response()
    }
}

impl From<StoreError> for ApiError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::NotFound => Self::NotFound,
            StoreError::IdInUse => Self::IdInUse,
            StoreError::RevisionConflict { expected, current } => {
                Self::RevisionConflict { expected, current }
            }
            StoreError::NoProject => Self::ProjectNotSeeded,
            StoreError::KindMismatch { existing, got } => Self::InvalidGeometry(vec![Violation {
                code: ViolationCode::KindMismatch,
                path: "kind".into(),
                message: format!(
                    "expected a {} geometry, got a {}",
                    existing.as_str(),
                    got.as_str()
                ),
            }]),
            StoreError::Corrupt(_) | StoreError::Database(_) => {
                tracing::error!(error = ?error, "store error");
                Self::Internal
            }
        }
    }
}

impl From<JsonRejection> for ApiError {
    fn from(rejection: JsonRejection) -> Self {
        Self::BadRequest(rejection.body_text())
    }
}

impl From<PathRejection> for ApiError {
    fn from(rejection: PathRejection) -> Self {
        Self::BadRequest(rejection.body_text())
    }
}
