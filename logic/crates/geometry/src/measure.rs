//! Deterministic calculations. Pure functions of a geometry; nothing is stored.

use serde::Serialize;

use crate::types::{Geometry, LineGeometry, SurfaceGeometry};

/// Length of a line, in project units.
pub fn length(line: &LineGeometry) -> f64 {
    (line.b.x - line.a.x).hypot(line.b.y - line.a.y)
}

/// Signed area by the shoelace formula: positive for a counter-clockwise ring,
/// negative for clockwise.
///
/// Coordinates are taken relative to the first vertex before summing, so shapes far from
/// the origin do not lose precision to cancellation.
pub fn signed_area(surface: &SurfaceGeometry) -> f64 {
    let v = &surface.vertices;
    if v.len() < 3 {
        return 0.0;
    }
    let o = v[0];
    let sum: f64 = (0..v.len())
        .map(|i| {
            let p = v[i];
            let q = v[(i + 1) % v.len()];
            (p.x - o.x) * (q.y - o.y) - (q.x - o.x) * (p.y - o.y)
        })
        .sum();
    sum / 2.0
}

/// Area of a surface, in square project units. Independent of ring direction.
pub fn area(surface: &SurfaceGeometry) -> f64 {
    signed_area(surface).abs()
}

/// Length of the closed boundary, including the closing edge.
pub fn perimeter(surface: &SurfaceGeometry) -> f64 {
    let v = &surface.vertices;
    (0..v.len())
        .map(|i| {
            let p = v[i];
            let q = v[(i + 1) % v.len()];
            (q.x - p.x).hypot(q.y - p.y)
        })
        .sum()
}

/// What can be measured on an entity. Serializes with a `kind` tag.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Measure {
    Line { length: f64 },
    Surface { area: f64, perimeter: f64 },
}

/// Measure a geometry. A point has nothing to measure, so it returns `None`; the server
/// reports that as `not_measurable`.
pub fn measure(geometry: &Geometry) -> Option<Measure> {
    match geometry {
        Geometry::Point(_) => None,
        Geometry::Line(line) => Some(Measure::Line {
            length: length(line),
        }),
        Geometry::Surface(surface) => Some(Measure::Surface {
            area: area(surface),
            perimeter: perimeter(surface),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Point2;

    fn surface(points: &[(f64, f64)]) -> SurfaceGeometry {
        SurfaceGeometry {
            vertices: points.iter().map(|&(x, y)| Point2::new(x, y)).collect(),
        }
    }

    #[test]
    fn line_length_is_four() {
        let line = LineGeometry {
            a: Point2::new(0.0, 0.0),
            b: Point2::new(4.0, 0.0),
        };
        assert_eq!(length(&line), 4.0);
    }

    #[test]
    fn diagonal_line_uses_pythagoras() {
        let line = LineGeometry {
            a: Point2::new(0.0, 0.0),
            b: Point2::new(3.0, 4.0),
        };
        assert_eq!(length(&line), 5.0);
    }

    #[test]
    fn triangle_area_is_six() {
        assert_eq!(area(&surface(&[(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)])), 6.0);
    }

    #[test]
    fn moving_the_vertex_to_8_0_gives_area_twelve() {
        assert_eq!(area(&surface(&[(0.0, 0.0), (8.0, 0.0), (0.0, 3.0)])), 12.0);
    }

    #[test]
    fn area_ignores_ring_direction_but_signed_area_does_not() {
        let ccw = surface(&[(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)]);
        let cw = surface(&[(0.0, 0.0), (0.0, 3.0), (4.0, 0.0)]);
        assert_eq!(area(&ccw), area(&cw));
        assert_eq!(signed_area(&ccw), 6.0);
        assert_eq!(signed_area(&cw), -6.0);
    }

    #[test]
    fn concave_l_shape_area_is_twelve() {
        let l = surface(&[
            (0.0, 0.0),
            (4.0, 0.0),
            (4.0, 2.0),
            (2.0, 2.0),
            (2.0, 4.0),
            (0.0, 4.0),
        ]);
        assert_eq!(area(&l), 12.0);
    }

    #[test]
    fn perimeter_includes_the_closing_edge() {
        // 4 + 5 + 3
        assert_eq!(
            perimeter(&surface(&[(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)])),
            12.0
        );
    }

    #[test]
    fn area_is_exact_far_from_the_origin() {
        let far = 1.0e9;
        let s = surface(&[(far, far), (far + 4.0, far), (far, far + 3.0)]);
        assert_eq!(area(&s), 6.0);
    }

    #[test]
    fn a_point_has_nothing_to_measure() {
        assert_eq!(measure(&Geometry::Point(Point2::new(1.0, 1.0))), None);
    }

    #[test]
    fn measure_reports_the_right_quantities() {
        let line = Geometry::Line(LineGeometry {
            a: Point2::new(0.0, 0.0),
            b: Point2::new(4.0, 0.0),
        });
        assert_eq!(measure(&line), Some(Measure::Line { length: 4.0 }));
        let tri = Geometry::Surface(surface(&[(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)]));
        assert_eq!(
            measure(&tri),
            Some(Measure::Surface {
                area: 6.0,
                perimeter: 12.0
            })
        );
    }
}
