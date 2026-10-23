//! Every engineering procedure as a Rust type.
//!
//! A research prototype, not a product crate (Bonyad's ADR 0002 says there is no shared
//! abstraction crate until an implemented case needs one). It exists to answer one
//! question with compiling code: *what does each procedure from the studied systems look
//! like as a typed contract?* Each procedure is declared once, with the `procedures!`
//! macro, as:
//!
//! - an `Input` struct and an `Output` struct,
//! - an `Error` enum of **stable string codes**,
//! - a **kind** (query / calculation / validator / command / derivation / external) and an
//!   **effect** (pure / produces new / consumes inputs / mutates in place / reads or
//!   writes outside),
//! - a version.
//!
//! Frame, tolerance, seed and input revision are *not* in the input struct: they arrive in
//! an explicit [`Ctx`](contract::Ctx), so nothing ambient can change a result.
//!
//! The sources are the procedure studies under `docs/research/procedures/`. Nearly all
//! contracts are declarations only; [`civil::earthwork_shared_triangulation`] also has an
//! implementation ([`contract::Run`]) to show the contract and the code agree.
#![forbid(unsafe_code)]

#[macro_use]
mod macros;

pub mod contract;
pub mod entities;
pub mod values;

pub mod bim;
pub mod cae;
pub mod civil;
pub mod drawing;
pub mod io;
pub mod mesh;
pub mod project;
pub mod scene;
pub mod sketch;
pub mod solid;
pub mod timeline;
pub mod verify;

/// Everything a domain module needs.
pub(crate) mod prelude {
    pub use crate::contract::*;
    pub use crate::entities::*;
    pub use crate::values::*;
}

/// Every procedure in the catalogue.
pub fn all_specs() -> Vec<&'static contract::ProcedureSpec> {
    [
        drawing::SPECS,
        solid::SPECS,
        sketch::SPECS,
        timeline::SPECS,
        project::SPECS,
        mesh::SPECS,
        scene::SPECS,
        civil::SPECS,
        bim::SPECS,
        cae::SPECS,
        io::SPECS,
        verify::SPECS,
    ]
    .concat()
}

#[cfg(test)]
mod registry_tests {
    use super::*;
    use std::collections::HashSet;

    fn is_snake(s: &str) -> bool {
        !s.is_empty()
            && s.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
            && !s.starts_with('_')
            && !s.ends_with('_')
    }

    #[test]
    fn keys_are_unique_well_formed_and_versioned() {
        let specs = all_specs();
        let mut seen = HashSet::new();
        for s in &specs {
            assert!(seen.insert(s.key), "duplicate key {}", s.key);
            let (domain, name) = s.key.split_once('.').unwrap_or_else(|| panic!("no dot in {}", s.key));
            assert!(is_snake(domain) && is_snake(name), "bad key {}", s.key);
            assert!(!name.contains('.'), "more than one dot in {}", s.key);
            assert!(s.version >= 1, "{} has version 0", s.key);
        }
    }

    #[test]
    fn error_codes_are_stable_snake_case_and_unique_per_procedure() {
        for s in all_specs() {
            assert!(!s.error_codes.is_empty(), "{} has no error codes", s.key);
            let mut seen = HashSet::new();
            for c in s.error_codes {
                assert!(is_snake(c), "{}: bad code {c}", s.key);
                assert!(seen.insert(*c), "{}: duplicate code {c}", s.key);
            }
        }
    }

    #[test]
    fn effect_and_kind_agree() {
        use contract::{Effect, Kind};
        for s in all_specs() {
            match s.kind {
                // A query, calculation or validator must not change anything.
                Kind::Query | Kind::Calculation | Kind::Validator => assert!(
                    matches!(s.effect, Effect::Pure | Effect::ProducesNew),
                    "{}: {:?} with effect {:?}",
                    s.key,
                    s.kind,
                    s.effect
                ),
                Kind::Command => assert!(
                    !matches!(s.effect, Effect::Pure),
                    "{}: a command cannot be pure",
                    s.key
                ),
                Kind::Derivation | Kind::External => {}
            }
        }
    }

    #[test]
    fn catalogue_is_large_and_every_domain_is_present() {
        let n = all_specs().len();
        assert!(n >= 130, "only {n} procedures");
        for domain in ["drawing", "solid", "sketch", "timeline", "project", "mesh", "scene", "civil", "bim", "cae", "io", "verify"] {
            assert!(
                all_specs().iter().any(|s| s.key.starts_with(&format!("{domain}."))),
                "no procedures in {domain}"
            );
        }
    }

    #[test]
    fn drawing_codes_are_bonyads_real_violation_codes_or_the_known_extras() {
        // The six codes of `bonyad-geometry`'s `ViolationCode` (logic/crates/geometry/src/violation.rs),
        // plus the operation-level codes of milestones 1 and 2.
        const ALLOWED: &[&str] = &[
            "non_finite_coordinate",
            "zero_length_line",
            "too_few_vertices",
            "degenerate_surface",
            "self_intersecting_surface",
            "kind_mismatch",
            "entity_missing",
            "revision_conflict",
            "entity_in_use",
            "not_measurable",
        ];
        for s in drawing::SPECS {
            for c in s.error_codes {
                assert!(ALLOWED.contains(c), "{}: unexpected code {c}", s.key);
            }
        }
    }

    #[test]
    fn entity_kind_names_are_unique() {
        let mut seen = HashSet::new();
        for k in entities::ALL_KINDS {
            assert!(seen.insert(*k), "duplicate entity kind {k}");
            assert!(is_snake(k));
        }
    }
}
