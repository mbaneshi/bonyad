//! The serialized shapes are part of the API contract, so they are pinned here.

use bonyad_geometry::{
    Geometry, LineGeometry, Measure, Point2, SurfaceGeometry, Violation, ViolationCode, validate,
};
use serde_json::json;

#[test]
fn geometry_is_tagged_by_kind() {
    let point = Geometry::Point(Point2::new(1.0, 1.0));
    assert_eq!(
        serde_json::to_value(&point).unwrap(),
        json!({"kind": "point", "x": 1.0, "y": 1.0})
    );

    let line = Geometry::Line(LineGeometry {
        a: Point2::new(0.0, 0.0),
        b: Point2::new(4.0, 0.0),
    });
    assert_eq!(
        serde_json::to_value(&line).unwrap(),
        json!({"kind": "line", "a": {"x": 0.0, "y": 0.0}, "b": {"x": 4.0, "y": 0.0}})
    );

    let surface = Geometry::Surface(SurfaceGeometry {
        vertices: vec![
            Point2::new(0.0, 0.0),
            Point2::new(4.0, 0.0),
            Point2::new(0.0, 3.0),
        ],
    });
    assert_eq!(
        serde_json::to_value(&surface).unwrap(),
        json!({"kind": "surface", "vertices": [{"x": 0.0, "y": 0.0}, {"x": 4.0, "y": 0.0}, {"x": 0.0, "y": 3.0}]})
    );
}

#[test]
fn geometry_round_trips_through_json() {
    let original = Geometry::Surface(SurfaceGeometry {
        vertices: vec![
            Point2::new(0.0, 0.0),
            Point2::new(4.0, 0.0),
            Point2::new(0.0, 3.0),
        ],
    });
    let text = serde_json::to_string(&original).unwrap();
    let back: Geometry = serde_json::from_str(&text).unwrap();
    assert_eq!(back, original);
}

#[test]
fn an_unknown_kind_is_rejected_at_the_boundary() {
    let parsed: Result<Geometry, _> = serde_json::from_value(json!({"kind": "circle", "r": 2.0}));
    assert!(parsed.is_err());
}

#[test]
fn violation_codes_serialize_as_the_stable_snake_case_strings() {
    let all = [
        (ViolationCode::NonFiniteCoordinate, "non_finite_coordinate"),
        (ViolationCode::ZeroLengthLine, "zero_length_line"),
        (ViolationCode::TooFewVertices, "too_few_vertices"),
        (ViolationCode::DegenerateSurface, "degenerate_surface"),
        (
            ViolationCode::SelfIntersectingSurface,
            "self_intersecting_surface",
        ),
        (ViolationCode::KindMismatch, "kind_mismatch"),
    ];
    for (code, text) in all {
        assert_eq!(code.as_str(), text);
        assert_eq!(serde_json::to_value(code).unwrap(), json!(text));
    }
}

#[test]
fn a_violation_serializes_with_code_path_and_message() {
    let err = validate(&Geometry::Point(Point2::new(f64::NAN, 1.0))).unwrap_err();
    let value = serde_json::to_value(&err[0]).unwrap();
    assert_eq!(value["code"], "non_finite_coordinate");
    assert_eq!(value["path"], "x");
    assert!(value["message"].as_str().is_some_and(|m| !m.is_empty()));
    let _: Violation = serde_json::from_value(value).unwrap();
}

#[test]
fn measures_are_tagged_by_kind() {
    assert_eq!(
        serde_json::to_value(Measure::Line { length: 4.0 }).unwrap(),
        json!({"kind": "line", "length": 4.0})
    );
    assert_eq!(
        serde_json::to_value(Measure::Surface {
            area: 6.0,
            perimeter: 12.0
        })
        .unwrap(),
        json!({"kind": "surface", "area": 6.0, "perimeter": 12.0})
    );
}
