//! `drawing.measure_entity` and `drawing.validate_geometry` run the real `bonyad-geometry`
//! functions. These tests pin that the contract and the product code agree.

use bonyad_geometry as real;
use procedure_contracts::contract::*;
use procedure_contracts::drawing::{Geometry2, Measure2, measure_entity, validate_geometry};
use procedure_contracts::values::{EntityRef, Point2};
use uuid::Uuid;

fn ctx() -> Ctx {
    Ctx::local_metres(Revision(7))
}

fn entity() -> EntityRef {
    EntityRef { kind: "surface".into(), id: Uuid::from_u128(1) }
}

fn surface(pts: &[(f64, f64)]) -> Geometry2 {
    Geometry2::Surface { vertices: pts.iter().map(|&(x, y)| Point2 { x, y }).collect() }
}

fn line(a: (f64, f64), b: (f64, f64)) -> Geometry2 {
    Geometry2::Line { a: Point2 { x: a.0, y: a.1 }, b: Point2 { x: b.0, y: b.1 } }
}

fn measure(g: Geometry2) -> Outcome<measure_entity::Output, measure_entity::Error> {
    measure_entity::Spec::run(&ctx(), &measure_entity::Input { entity: entity(), geometry: g })
}

fn validate(g: Geometry2) -> Outcome<validate_geometry::Output, validate_geometry::Error> {
    validate_geometry::Spec::run(&ctx(), &validate_geometry::Input { geometry: g })
}

/// A spread of geometries: valid and invalid, every kind.
fn samples() -> Vec<Geometry2> {
    vec![
        Geometry2::Point { x: 1.0, y: 1.0 },
        Geometry2::Point { x: f64::NAN, y: 0.0 },
        line((0.0, 0.0), (4.0, 0.0)),
        line((0.0, 0.0), (3.0, 4.0)),
        line((1.0, 1.0), (1.0, 1.0)),
        surface(&[(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)]),
        surface(&[(0.0, 0.0), (0.0, 3.0), (4.0, 0.0)]),
        surface(&[(0.0, 0.0), (4.0, 0.0), (4.0, 2.0), (2.0, 2.0), (2.0, 4.0), (0.0, 4.0)]),
        surface(&[(0.0, 0.0), (4.0, 4.0), (4.0, 0.0), (0.0, 4.0)]), // bow-tie
        surface(&[(0.0, 0.0), (1.0, 0.0)]),                          // too few
        surface(&[(0.0, 0.0), (1.0, 1.0), (2.0, 2.0)]),              // collinear
        surface(&[(0.0, 0.0), (f64::INFINITY, 0.0), (0.0, 3.0)]),
    ]
}

fn is_finite(g: &Geometry2) -> bool {
    match g {
        Geometry2::Point { x, y } => x.is_finite() && y.is_finite(),
        Geometry2::Line { a, b } => [a.x, a.y, b.x, b.y].iter().all(|v| v.is_finite()),
        Geometry2::Surface { vertices } => vertices.iter().all(|p| p.x.is_finite() && p.y.is_finite()),
    }
}

#[test]
fn the_wire_shape_is_the_one_the_real_crate_serialises() {
    for g in samples() {
        // NaN and infinity have no JSON form; the wire shape is compared on finite inputs.
        if !is_finite(&g) {
            continue;
        }
        let json = serde_json::to_value(&g).unwrap();
        let real_json = serde_json::to_value(real::Geometry::from(&g)).unwrap();
        assert_eq!(json, real_json, "{g:?}");
        let back: Geometry2 = serde_json::from_value(real_json).unwrap();
        assert_eq!(back, g);
    }
}

#[test]
fn measure_agrees_with_the_real_function_on_every_sample() {
    // Stored entities have passed validation, so measure is compared on finite inputs.
    for g in samples().into_iter().filter(is_finite) {
        let expected = real::measure(&(&g).into());
        match (measure(g.clone()), expected) {
            (Outcome::Ok { value, .. }, Some(real::Measure::Line { length })) => {
                assert_eq!(value.measure, Measure2::Line { length });
                assert_eq!(value.input_revision, Revision(7));
            }
            (Outcome::Ok { value, .. }, Some(real::Measure::Surface { area, perimeter })) => {
                assert_eq!(value.measure, Measure2::Surface { area, perimeter });
            }
            (Outcome::Rejected { violations }, None) => {
                assert_eq!(violations[0].error.code(), "not_measurable");
            }
            (got, want) => panic!("{g:?}: contract {got:?} vs real {want:?}"),
        }
    }
}

#[test]
fn measure_does_not_validate_so_the_caller_must_pass_stored_geometry() {
    // The real `measure` is a pure formula. On a non-finite coordinate it returns a
    // non-finite number inside Ok, not a rejection. The contract inherits this: the harness
    // must hand it geometry that already passed `validate_geometry`.
    let g = surface(&[(0.0, 0.0), (f64::INFINITY, 0.0), (0.0, 3.0)]);
    let Outcome::Ok { value, .. } = measure(g) else { panic!() };
    let Measure2::Surface { area, .. } = value.measure else { panic!() };
    assert!(!area.is_finite());
}

#[test]
fn reference_values() {
    let tri = surface(&[(0.0, 0.0), (4.0, 0.0), (0.0, 3.0)]);
    let Outcome::Ok { value, .. } = measure(tri) else { panic!() };
    assert_eq!(value.measure, Measure2::Surface { area: 6.0, perimeter: 12.0 });
    let Outcome::Ok { value, .. } = measure(line((0.0, 0.0), (3.0, 4.0))) else { panic!() };
    assert_eq!(value.measure, Measure2::Line { length: 5.0 });
}

#[test]
fn a_point_is_not_measurable_and_the_code_is_the_stable_string() {
    let out = measure(Geometry2::Point { x: 0.0, y: 0.0 });
    assert_eq!(out.verdict(), Verdict::Reject);
    let Outcome::Rejected { violations } = out else { panic!() };
    assert_eq!(violations[0].error.code(), "not_measurable");
}

#[test]
fn validate_reports_the_same_violations_as_the_real_function() {
    for g in samples() {
        let real_result = real::validate(&(&g).into());
        match (validate(g.clone()), real_result) {
            (Outcome::Ok { value, .. }, Ok(())) => assert!(value.valid),
            (Outcome::Rejected { violations }, Err(real_violations)) => {
                let got: Vec<_> =
                    violations.iter().map(|v| (v.error.code(), v.path.clone(), v.message.clone())).collect();
                let want: Vec<_> = real_violations
                    .iter()
                    .map(|v| (v.code.as_str(), v.path.clone(), v.message.clone()))
                    .collect();
                assert_eq!(got, want, "{g:?}");
            }
            (got, want) => panic!("{g:?}: contract {got:?} vs real {want:?}"),
        }
    }
}

#[test]
fn a_bow_tie_is_rejected_and_unknown_is_never_returned_for_a_decidable_input() {
    let out = validate(surface(&[(0.0, 0.0), (4.0, 4.0), (4.0, 0.0), (0.0, 4.0)]));
    assert_eq!(out.verdict(), Verdict::Reject);
    let Outcome::Rejected { violations } = out else { panic!() };
    assert_eq!(violations[0].error.code(), "self_intersecting_surface");
}

#[test]
fn every_code_the_real_validate_can_return_is_declared_in_the_contract() {
    let declared: Vec<&str> = validate_geometry::SPEC.error_codes.to_vec();
    for g in samples() {
        if let Err(vs) = real::validate(&(&g).into()) {
            for v in vs {
                assert!(declared.contains(&v.code.as_str()), "{} not declared", v.code.as_str());
            }
        }
    }
}
