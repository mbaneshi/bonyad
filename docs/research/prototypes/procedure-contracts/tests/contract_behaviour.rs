//! Behaviours the research said a procedure contract must have, tested through the public API.

use procedure_contracts::contract::*;
use procedure_contracts::entities::{Alignment, Body, Record};
use procedure_contracts::{civil, solid};
use uuid::Uuid;

fn read(kind: &str, n: u128, rev: u64) -> ReadRef {
    ReadRef { kind: kind.into(), id: Uuid::from_u128(n), revision: Revision(rev) }
}

fn record(reads: Vec<ReadRef>) -> ResultRecord<u32, solid::extrude::Error> {
    ResultRecord {
        provenance: Provenance {
            procedure: ProcedureId { key: "solid.extrude".into(), version: 1 },
            ctx: Ctx::local_metres(Revision(10)),
            reads,
            input_hash: "00".into(),
        },
        outcome: Outcome::ok(7),
        assurance: Assurance::Unknown,
    }
}

#[test]
fn staleness_is_computed_from_the_read_set_not_flagged_project_wide() {
    let rec = record(vec![read("sketch", 1, 3), read("body", 2, 5)]);
    // The project moved on (other entities changed) but nothing this result read did.
    let unchanged = |r: &ReadRef| Some(r.revision);
    assert!(!rec.is_stale(unchanged));
    // One entity it read was edited.
    let edited = |r: &ReadRef| if r.id == Uuid::from_u128(2) { Some(Revision(6)) } else { Some(r.revision) };
    assert!(rec.is_stale(edited));
    // One entity it read was deleted.
    let deleted = |r: &ReadRef| if r.id == Uuid::from_u128(1) { None } else { Some(r.revision) };
    assert!(rec.is_stale(deleted));
}

#[test]
fn a_result_that_read_nothing_is_never_stale_so_verifiers_must_reject_empty_read_sets() {
    // `verify.check_staleness` has a ReadSetEmpty error for exactly this reason.
    let rec = record(vec![]);
    assert!(!rec.is_stale(|_| None));
    assert!(
        procedure_contracts::verify::check_staleness::Error::ALL
            .iter()
            .any(|e| e.code() == "read_set_empty")
    );
}

#[test]
fn outcome_has_three_verdicts_and_unknown_is_not_accept() {
    let ok: Outcome<u8, solid::extrude::Error> = Outcome::ok(1);
    let rejected: Outcome<u8, solid::extrude::Error> =
        Outcome::reject(solid::extrude::Error::ProfileNotClosed, "/profile", "gap");
    let undetermined: Outcome<u8, solid::extrude::Error> = Outcome::Undetermined {
        reasons: vec![Undetermined {
            reason: UndeterminedReason::NotImplemented,
            path: String::new(),
            message: "kernel op not ported".into(),
        }],
    };
    assert_eq!(ok.verdict(), Verdict::Accept);
    assert_eq!(rejected.verdict(), Verdict::Reject);
    assert_eq!(undetermined.verdict(), Verdict::Unknown);
    assert_ne!(undetermined.verdict(), Verdict::Accept);
    assert!(undetermined.into_value().is_none());
}

#[test]
fn wire_format_is_stable_snake_case_with_a_status_tag() {
    let ok: Outcome<u8, civil::earthwork_shared_triangulation::Error> = Outcome::ok(1);
    let v = serde_json::to_value(&ok).unwrap();
    assert_eq!(v["status"], "ok");

    let rej: Outcome<u8, civil::earthwork_shared_triangulation::Error> = Outcome::reject(
        civil::earthwork_shared_triangulation::Error::TriangleIndexOutOfRange,
        "/triangles/0/2",
        "index 9",
    );
    let v = serde_json::to_value(&rej).unwrap();
    assert_eq!(v["status"], "rejected");
    assert_eq!(v["violations"][0]["error"], "triangle_index_out_of_range");
    assert_eq!(v["violations"][0]["path"], "/triangles/0/2");
}

#[test]
fn typed_ids_round_trip_as_plain_uuids_and_cannot_be_mixed() {
    let body: Id<Body> = Id::new(Uuid::from_u128(7));
    let json = serde_json::to_string(&body).unwrap();
    assert_eq!(json, format!("\"{}\"", Uuid::from_u128(7)));
    let back: Id<Body> = serde_json::from_str(&json).unwrap();
    assert_eq!(back, body);
    // `Id<Alignment>` and `Id<Body>` are different types; this only compiles because we
    // convert through the untyped reference, which carries the kind name.
    let a: Id<Alignment> = Id::new(Uuid::from_u128(7));
    assert_eq!(a.any().kind, "alignment");
    assert_eq!(body.any().kind, "body");
}

#[test]
fn an_input_survives_json() {
    let input = civil::earthwork_shared_triangulation::Input {
        vertices: vec![TinVertexForTest::v(0.0, 0.0, 1.0, 0.0)],
        triangles: vec![[0, 0, 0]],
        min_triangle_area: 1e-9,
    };
    let text = serde_json::to_string(&input).unwrap();
    let back: civil::earthwork_shared_triangulation::Input = serde_json::from_str(&text).unwrap();
    assert_eq!(back, input);
}

#[test]
fn an_unknown_parameter_key_is_rejected_not_silently_ignored() {
    // SolidCraft's registry ignores unknown parameter keys by default; a typed input must not.
    let text = r#"{"vertices":[],"triangles":[],"min_triangle_area":1e-9,"mm_tolerance":0.1}"#;
    let parsed = serde_json::from_str::<civil::earthwork_shared_triangulation::Input>(text);
    let err = parsed.expect_err("unknown key must be an error").to_string();
    assert!(err.contains("unknown field"), "unexpected error: {err}");
}

// A tiny helper so the test does not depend on how vertices are constructed elsewhere.
struct TinVertexForTest;
impl TinVertexForTest {
    fn v(x: f64, y: f64, existing_z: f64, design_z: f64) -> civil::TinVertex {
        civil::TinVertex { x, y, existing_z, design_z }
    }
}

#[test]
fn a_record_id_is_its_own_kind() {
    let r: Id<Record> = Id::new(Uuid::from_u128(1));
    assert_eq!(r.any().kind, "record");
}

#[test]
fn spec_exposes_what_a_registry_and_an_agent_need() {
    let s = solid::boolean::SPEC;
    assert_eq!(s.key, "solid.boolean");
    assert_eq!(s.effect, Effect::ConsumesInputs);
    assert_eq!(s.kind, Kind::Derivation);
    assert!(s.input_fields.contains(&"keep_tools"));
    assert!(s.error_codes.contains(&"body_combined_with_itself"));
    // The same spec is reachable from the type, which is how a registry maps a key to code.
    assert_eq!(<solid::boolean::Spec as Procedure>::SPEC.key, s.key);
}
