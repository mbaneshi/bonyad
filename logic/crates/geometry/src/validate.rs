//! Geometry rules. Pure: reports every violation it finds, changes nothing.
//!
//! The database owns integrity (keys, kinds, finite numbers); this module owns the
//! geometric rules and is the only place that decides what a valid shape is.

use crate::types::{Geometry, Kind, LineGeometry, Point2, SurfaceGeometry};
use crate::violation::{Violation, ViolationCode};

/// Two points closer than this are treated as the same point (project units).
pub const ZERO_LENGTH_EPS: f64 = 1.0e-9;

/// A surface with at most this area is treated as having none (square project units).
pub const ZERO_AREA_EPS: f64 = 1.0e-9;

/// Check a geometry against every rule that applies to its kind.
///
/// All violations found are returned together so a person (or the agent) can fix them in
/// one pass.
pub fn validate(geometry: &Geometry) -> Result<(), Vec<Violation>> {
    let mut out = Vec::new();
    match geometry {
        Geometry::Point(p) => check_finite(&mut out, "", *p),
        Geometry::Line(line) => validate_line(&mut out, line),
        Geometry::Surface(surface) => validate_surface(&mut out, surface),
    }
    if out.is_empty() { Ok(()) } else { Err(out) }
}

/// Check a geometry that is meant to replace the geometry of an existing entity: the kind
/// must match, and then every ordinary rule applies.
pub fn validate_replacement(existing: Kind, replacement: &Geometry) -> Result<(), Vec<Violation>> {
    if replacement.kind() != existing {
        return Err(vec![Violation::new(
            ViolationCode::KindMismatch,
            "kind",
            format!(
                "expected a {} geometry, got a {}",
                existing.as_str(),
                replacement.kind().as_str()
            ),
        )]);
    }
    validate(replacement)
}

fn check_finite(out: &mut Vec<Violation>, prefix: &str, p: Point2) {
    let path = |axis: &str| {
        if prefix.is_empty() {
            axis.to_owned()
        } else {
            format!("{prefix}.{axis}")
        }
    };
    if !p.x.is_finite() {
        out.push(Violation::new(
            ViolationCode::NonFiniteCoordinate,
            path("x"),
            "x must be a finite number",
        ));
    }
    if !p.y.is_finite() {
        out.push(Violation::new(
            ViolationCode::NonFiniteCoordinate,
            path("y"),
            "y must be a finite number",
        ));
    }
}

fn distance(p: Point2, q: Point2) -> f64 {
    (q.x - p.x).hypot(q.y - p.y)
}

fn validate_line(out: &mut Vec<Violation>, line: &LineGeometry) {
    check_finite(out, "a", line.a);
    check_finite(out, "b", line.b);
    if line.a.is_finite() && line.b.is_finite() && distance(line.a, line.b) <= ZERO_LENGTH_EPS {
        out.push(Violation::new(
            ViolationCode::ZeroLengthLine,
            "b",
            "the two endpoints coincide",
        ));
    }
}

fn validate_surface(out: &mut Vec<Violation>, surface: &SurfaceGeometry) {
    let v = &surface.vertices;
    let n = v.len();

    if n < 3 {
        out.push(Violation::new(
            ViolationCode::TooFewVertices,
            "vertices",
            format!("a surface needs at least 3 vertices, got {n}"),
        ));
    }
    for (i, p) in v.iter().enumerate() {
        check_finite(out, &format!("vertices[{i}]"), *p);
    }
    // Geometry below is meaningless without enough finite vertices.
    if n < 3 || v.iter().any(|p| !p.is_finite()) {
        return;
    }

    // Consecutive vertices (including last to first) must be distinct.
    let before = out.len();
    for i in 0..n {
        let next = (i + 1) % n;
        if distance(v[i], v[next]) <= ZERO_LENGTH_EPS {
            out.push(Violation::new(
                ViolationCode::DegenerateSurface,
                format!("vertices[{next}]"),
                format!("vertex {next} coincides with vertex {i}"),
            ));
        }
    }
    if out.len() > before {
        return;
    }

    // Not `area(surface) == 0`: a bow-tie's lobes cancel to a net area of zero, yet it is
    // self-intersecting, not degenerate. Degenerate means every vertex lies on one line.
    if all_collinear(v) {
        out.push(Violation::new(
            ViolationCode::DegenerateSurface,
            "vertices",
            "all vertices are collinear, so the surface has no area",
        ));
        return;
    }

    if let Some(message) = find_self_intersection(v) {
        out.push(Violation::new(
            ViolationCode::SelfIntersectingSurface,
            "vertices",
            message,
        ));
    }
}

/// Do all vertices lie on one line (within [`ZERO_AREA_EPS`])? Every triangle formed with the
/// first vertex and the vertex farthest from it must have no area.
fn all_collinear(v: &[Point2]) -> bool {
    let o = v[0];
    let a = v
        .iter()
        .copied()
        .max_by(|p, q| distance(o, *p).total_cmp(&distance(o, *q)))
        .unwrap_or(o);
    v.iter()
        .all(|&p| cross(o, a, p).abs() / 2.0 <= ZERO_AREA_EPS)
}

/// Twice the signed area of the triangle `o, a, b`: positive when `b` is to the left of
/// the directed line `o -> a`.
fn cross(o: Point2, a: Point2, b: Point2) -> f64 {
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/// Is `r`, known to be collinear with segment `p-q`, within that segment?
fn within(p: Point2, q: Point2, r: Point2) -> bool {
    r.x >= p.x.min(q.x) && r.x <= p.x.max(q.x) && r.y >= p.y.min(q.y) && r.y <= p.y.max(q.y)
}

/// Do the closed segments `p1-p2` and `p3-p4` share any point (crossing, touching or
/// overlapping)?
fn segments_meet(p1: Point2, p2: Point2, p3: Point2, p4: Point2) -> bool {
    let d1 = cross(p3, p4, p1);
    let d2 = cross(p3, p4, p2);
    let d3 = cross(p1, p2, p3);
    let d4 = cross(p1, p2, p4);

    if ((d1 > 0.0 && d2 < 0.0) || (d1 < 0.0 && d2 > 0.0))
        && ((d3 > 0.0 && d4 < 0.0) || (d3 < 0.0 && d4 > 0.0))
    {
        return true;
    }
    (d1 == 0.0 && within(p3, p4, p1))
        || (d2 == 0.0 && within(p3, p4, p2))
        || (d3 == 0.0 && within(p1, p2, p3))
        || (d4 == 0.0 && within(p1, p2, p4))
}

/// Find the first place where a closed ring touches or crosses itself.
///
/// Adjacent edges legitimately share their common vertex, so they are only a problem when
/// they fold back over each other (collinear and pointing the same way from the shared
/// vertex). Every other pair of edges must be completely disjoint.
fn find_self_intersection(v: &[Point2]) -> Option<String> {
    let n = v.len();

    for i in 0..n {
        let prev = v[(i + n - 1) % n];
        let at = v[i];
        let next = v[(i + 1) % n];
        let (ux, uy) = (prev.x - at.x, prev.y - at.y);
        let (wx, wy) = (next.x - at.x, next.y - at.y);
        if ux * wy - uy * wx == 0.0 && ux * wx + uy * wy > 0.0 {
            return Some(format!("the boundary folds back over itself at vertex {i}"));
        }
    }

    for i in 0..n {
        for j in (i + 1)..n {
            let adjacent = j == i + 1 || (i == 0 && j == n - 1);
            if adjacent {
                continue;
            }
            if segments_meet(v[i], v[(i + 1) % n], v[j], v[(j + 1) % n]) {
                return Some(format!("edge {i} meets edge {j}"));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pt(x: f64, y: f64) -> Point2 {
        Point2::new(x, y)
    }
    fn line(ax: f64, ay: f64, bx: f64, by: f64) -> Geometry {
        Geometry::Line(LineGeometry {
            a: pt(ax, ay),
            b: pt(bx, by),
        })
    }
    fn surface(points: &[(f64, f64)]) -> Geometry {
        Geometry::Surface(SurfaceGeometry {
            vertices: points.iter().map(|&(x, y)| pt(x, y)).collect(),
        })
    }
    fn codes(g: &Geometry) -> Vec<ViolationCode> {
        match validate(g) {
            Ok(()) => vec![],
            Err(v) => v.into_iter().map(|v| v.code).collect(),
        }
    }

    #[test]
    fn the_acceptance_shapes_are_valid() {
        assert_eq!(validate(&Geometry::Point(pt(1.0, 1.0))), Ok(()));
        assert_eq!(validate(&line(0.0, 0.0, 4.0, 0.0)), Ok(()));
        assert_eq!(
            validate(&surface(&[(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)])),
            Ok(())
        );
    }

    #[test]
    fn a_clockwise_ring_is_valid() {
        assert_eq!(
            validate(&surface(&[(0.0, 0.0), (0.0, 3.0), (4.0, 0.0)])),
            Ok(())
        );
    }

    #[test]
    fn a_concave_ring_is_valid() {
        let l = surface(&[
            (0.0, 0.0),
            (4.0, 0.0),
            (4.0, 2.0),
            (2.0, 2.0),
            (2.0, 4.0),
            (0.0, 4.0),
        ]);
        assert_eq!(validate(&l), Ok(()));
    }

    #[test]
    fn nan_and_infinity_are_not_coordinates() {
        assert_eq!(
            codes(&Geometry::Point(pt(f64::NAN, 1.0))),
            [ViolationCode::NonFiniteCoordinate]
        );
        assert_eq!(
            codes(&Geometry::Point(pt(1.0, f64::INFINITY))),
            [ViolationCode::NonFiniteCoordinate]
        );
        assert_eq!(
            codes(&Geometry::Point(pt(f64::NEG_INFINITY, 0.0))),
            [ViolationCode::NonFiniteCoordinate]
        );
    }

    #[test]
    fn violations_say_where_the_problem_is() {
        let err = validate(&Geometry::Point(pt(f64::NAN, f64::NAN))).unwrap_err();
        let paths: Vec<_> = err.iter().map(|v| v.path.as_str()).collect();
        assert_eq!(paths, ["x", "y"]);

        let err = validate(&line(0.0, 0.0, f64::NAN, 0.0)).unwrap_err();
        assert_eq!(err.len(), 1);
        assert_eq!(err[0].path, "b.x");

        let err = validate(&surface(&[(0.0, 0.0), (4.0, 0.0), (0.0, f64::INFINITY)])).unwrap_err();
        assert_eq!(err.len(), 1);
        assert_eq!(err[0].path, "vertices[2].y");
    }

    #[test]
    fn several_violations_are_reported_together() {
        let err = validate(&line(f64::NAN, 0.0, 0.0, f64::INFINITY)).unwrap_err();
        let paths: Vec<_> = err.iter().map(|v| v.path.as_str()).collect();
        assert_eq!(paths, ["a.x", "b.y"]);
    }

    #[test]
    fn a_line_must_have_length() {
        assert_eq!(
            codes(&line(2.0, 2.0, 2.0, 2.0)),
            [ViolationCode::ZeroLengthLine]
        );
    }

    #[test]
    fn a_zero_length_line_is_not_reported_twice_when_a_coordinate_is_also_bad() {
        assert_eq!(
            codes(&line(f64::NAN, 0.0, f64::NAN, 0.0)),
            [ViolationCode::NonFiniteCoordinate; 2]
        );
    }

    #[test]
    fn a_surface_needs_three_vertices() {
        assert_eq!(codes(&surface(&[])), [ViolationCode::TooFewVertices]);
        assert_eq!(
            codes(&surface(&[(0.0, 0.0), (1.0, 0.0)])),
            [ViolationCode::TooFewVertices]
        );
    }

    #[test]
    fn collinear_vertices_have_no_area() {
        assert_eq!(
            codes(&surface(&[(0.0, 0.0), (1.0, 1.0), (2.0, 2.0)])),
            [ViolationCode::DegenerateSurface]
        );
    }

    #[test]
    fn coincident_consecutive_vertices_are_degenerate() {
        let g = surface(&[(0.0, 0.0), (0.0, 0.0), (4.0, 0.0), (0.0, 3.0)]);
        assert_eq!(codes(&g), [ViolationCode::DegenerateSurface]);
        // The closing edge counts too: last vertex equals the first.
        let closed = surface(&[(0.0, 0.0), (4.0, 0.0), (0.0, 3.0), (0.0, 0.0)]);
        assert_eq!(codes(&closed), [ViolationCode::DegenerateSurface]);
    }

    #[test]
    fn a_sliver_with_no_real_area_is_degenerate() {
        let g = surface(&[(0.0, 0.0), (4.0, 0.0), (2.0, 1.0e-10)]);
        assert_eq!(codes(&g), [ViolationCode::DegenerateSurface]);
    }

    #[test]
    fn a_thin_but_real_triangle_is_valid() {
        let g = surface(&[(0.0, 0.0), (4.0, 0.0), (2.0, 1.0e-3)]);
        assert_eq!(validate(&g), Ok(()));
    }

    #[test]
    fn a_bow_tie_crosses_itself() {
        let g = surface(&[(0.0, 0.0), (4.0, 4.0), (4.0, 0.0), (0.0, 4.0)]);
        assert_eq!(codes(&g), [ViolationCode::SelfIntersectingSurface]);
    }

    #[test]
    fn a_vertex_touching_another_edge_is_self_intersecting() {
        // (3,0) lies on the edge (0,0)-(6,0).
        let g = surface(&[(0.0, 0.0), (6.0, 0.0), (6.0, 4.0), (3.0, 0.0), (0.0, 4.0)]);
        assert_eq!(codes(&g), [ViolationCode::SelfIntersectingSurface]);
    }

    #[test]
    fn a_spike_that_folds_back_is_self_intersecting() {
        // The edge (4,0)-(2,0) runs back over (0,0)-(4,0).
        let g = surface(&[(0.0, 0.0), (4.0, 0.0), (2.0, 0.0), (2.0, 3.0)]);
        assert_eq!(codes(&g), [ViolationCode::SelfIntersectingSurface]);
    }

    #[test]
    fn a_replacement_must_keep_the_kind() {
        let err = validate_replacement(Kind::Surface, &Geometry::Point(pt(1.0, 1.0))).unwrap_err();
        assert_eq!(err.len(), 1);
        assert_eq!(err[0].code, ViolationCode::KindMismatch);
        assert_eq!(err[0].path, "kind");
        assert_eq!(
            validate_replacement(Kind::Point, &Geometry::Point(pt(1.0, 1.0))),
            Ok(())
        );
    }

    #[test]
    fn a_replacement_of_the_right_kind_still_gets_the_ordinary_rules() {
        let err = validate_replacement(Kind::Line, &line(1.0, 1.0, 1.0, 1.0)).unwrap_err();
        assert_eq!(err[0].code, ViolationCode::ZeroLengthLine);
    }
}
