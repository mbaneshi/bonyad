//! The milestone's acceptance example, through the public API only.

use bonyad_geometry::{
    Geometry, Kind, LineGeometry, Measure, Point2, SurfaceGeometry, ViolationCode, measure,
    validate, validate_replacement,
};

fn triangle(corner: (f64, f64)) -> Geometry {
    Geometry::Surface(SurfaceGeometry {
        vertices: vec![
            Point2::new(0.0, 0.0),
            Point2::new(corner.0, corner.1),
            Point2::new(0.0, 3.0),
        ],
    })
}

#[test]
fn point_line_and_surface_from_the_acceptance_example() {
    let point = Geometry::Point(Point2::new(1.0, 1.0));
    let line = Geometry::Line(LineGeometry {
        a: Point2::new(0.0, 0.0),
        b: Point2::new(4.0, 0.0),
    });
    let surface = triangle((4.0, 0.0));

    for g in [&point, &line, &surface] {
        assert_eq!(validate(g), Ok(()), "{g:?} should be valid");
    }

    assert_eq!(measure(&point), None);
    assert_eq!(measure(&line), Some(Measure::Line { length: 4.0 }));
    assert_eq!(
        measure(&surface),
        Some(Measure::Surface {
            area: 6.0,
            perimeter: 12.0
        })
    );
}

#[test]
fn editing_a_surface_vertex_to_8_0_gives_area_twelve() {
    let edited = triangle((8.0, 0.0));
    assert_eq!(validate_replacement(Kind::Surface, &edited), Ok(()));
    match measure(&edited) {
        Some(Measure::Surface { area, .. }) => assert_eq!(area, 12.0),
        other => panic!("expected a surface measure, got {other:?}"),
    }
}

#[test]
fn an_invalid_edit_is_reported_and_the_original_is_untouched() {
    let original = triangle((4.0, 0.0));
    let before = original.clone();

    // The caller tries to collapse the triangle onto a line.
    let collapsed = Geometry::Surface(SurfaceGeometry {
        vertices: vec![
            Point2::new(0.0, 0.0),
            Point2::new(4.0, 0.0),
            Point2::new(8.0, 0.0),
        ],
    });
    let err = validate_replacement(Kind::Surface, &collapsed).unwrap_err();
    assert_eq!(err[0].code, ViolationCode::DegenerateSurface);

    // Validation reads; it never mutates.
    assert_eq!(original, before);
}
