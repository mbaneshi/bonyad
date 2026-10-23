//! Computer-aided engineering: meshing, model definition, solving, results, decks.
//! Source: the FieldCraft study. Differences from FieldCraft, on purpose: solver checks come
//! back as structured data (code, measured, threshold, severity), not free-text warnings,
//! and every solve returns an explicit verdict-capable summary.

use crate::prelude::*;

wire! {
    #[derive(Copy, Eq)]
    pub enum ElementOrder { Linear, Quadratic }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum HexMethod { Auto, Swept, Mapped, Octree }
}
wire! {
    pub enum MaterialLaw {
        LinearElastic { youngs_modulus: f64, poissons_ratio: f64, density: f64 },
        ElasticPlastic { youngs_modulus: f64, poissons_ratio: f64, yield_stress: f64, hardening_modulus: f64, density: f64 },
        Thermal { conductivity: f64, specific_heat: f64, density: f64 },
    }
}
wire! {
    pub enum SectionKind { Solid, Shell { thickness: f64 }, Beam { area: f64, i_y: f64, i_z: f64, torsion: f64 } }
}
wire! {
    pub enum BoundaryKind {
        Fixed,
        Displacement(Vector3),
        Symmetry(Vector3),
        Temperature(f64),
    }
}
wire! {
    pub enum LoadKind {
        Force(Vector3),
        Pressure(f64),
        Gravity(Vector3),
        HeatFlux(f64),
    }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum CheckSeverity { Info, Warning, Failure }
}
wire! {
    /// A solver self-check, structured so an agent or verifier can decide on it.
    pub struct SolverCheck {
        pub code: String,
        pub severity: CheckSeverity,
        pub measured: f64,
        pub threshold: f64,
        pub passed: bool,
    }
}
wire! {
    pub struct SolveSummary {
        pub converged: bool,
        pub iterations: u32,
        pub max_displacement: Option<f64>,
        pub max_von_mises: Option<f64>,
        pub applied_total: Option<f64>,
        pub reaction_total: Option<f64>,
        pub checks: Vec<SolverCheck>,
    }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum DeckFormat { Abaqus, Nastran, LsDyna }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum ResultField { Displacement, VonMises, Stress, Strain, Temperature, Velocity, Pressure }
}
wire! {
    pub struct MeshQuality {
        pub elements: u32,
        pub invalid: u32,
        pub undetermined: u32,
        pub min_jacobian: f64,
        pub max_aspect_ratio: f64,
    }
}
wire! {
    pub struct ReactionLine { pub set: String, pub force: Vector3 }
}

procedures! {
    /// Tetrahedral mesh of a body.
    mesh_tet {
        key: "cae.mesh_tet", version: 1, kind: Derivation, effect: ProducesNew,
        input {
            model: Id<AnalysisModel>,
            body: Id<Body>,
            size: f64,
            order: ElementOrder,
            tolerance: f64,
        }
        output { elements: u32, nodes: u32, quality: MeshQuality, results_invalidated: u32 }
        errors {
            ModelMissing = "model_missing",
            BodyMissing = "body_missing",
            SizeInvalid = "size_invalid",
            SurfaceInvalid = "surface_invalid",
            ValidityGateFailed = "validity_gate_failed",
        }
    }
    /// Hexahedral mesh of a body.
    mesh_hex {
        key: "cae.mesh_hex", version: 1, kind: Derivation, effect: ProducesNew,
        input {
            model: Id<AnalysisModel>,
            body: Id<Body>,
            size: f64,
            order: ElementOrder,
            method: HexMethod,
        }
        output { elements: u32, nodes: u32, quality: MeshQuality, results_invalidated: u32 }
        errors {
            ModelMissing = "model_missing",
            BodyMissing = "body_missing",
            SizeInvalid = "size_invalid",
            NoStructuredMethodFits = "no_structured_method_fits",
            SeedsCannotAllHold = "seeds_cannot_all_hold",
        }
    }
    /// Mesh quality, with an explicit "undetermined" count.
    mesh_quality {
        key: "cae.mesh_quality", version: 1, kind: Validator, effect: Pure,
        input { model: Id<AnalysisModel> }
        output { quality: MeshQuality }
        errors { ModelMissing = "model_missing", NoMesh = "no_mesh" }
    }
    /// Define a material.
    define_material {
        key: "cae.define_material", version: 1, kind: Command, effect: ProducesNew,
        input { model: Id<AnalysisModel>, name: String, law: MaterialLaw, expected: Expected }
        output { material: Id<Material>, new_revision: Revision }
        errors {
            ModelMissing = "model_missing",
            RevisionConflict = "revision_conflict",
            NameTaken = "name_taken",
            ParameterOutOfRange = "parameter_out_of_range",
            DimensionMismatch = "dimension_mismatch",
        }
    }
    /// Assign a section to part of the model.
    define_section {
        key: "cae.define_section", version: 1, kind: Command, effect: ProducesNew,
        input {
            model: Id<AnalysisModel>,
            name: String,
            kind: SectionKind,
            material: Id<Material>,
            body: Id<Body>,
            expected: Expected,
        }
        output { section: Id<Section>, new_revision: Revision }
        errors {
            ModelMissing = "model_missing",
            MaterialMissing = "material_missing",
            BodyMissing = "body_missing",
            RevisionConflict = "revision_conflict",
            NameTaken = "name_taken",
            ParameterOutOfRange = "parameter_out_of_range",
        }
    }
    /// Define a boundary condition on a set of faces.
    define_boundary_condition {
        key: "cae.define_boundary_condition", version: 1, kind: Command, effect: ProducesNew,
        input {
            model: Id<AnalysisModel>,
            name: String,
            faces: Vec<FaceRef>,
            kind: BoundaryKind,
            expected: Expected,
        }
        output { boundary_condition: Id<BoundaryCondition>, new_revision: Revision }
        errors {
            ModelMissing = "model_missing",
            RevisionConflict = "revision_conflict",
            NameTaken = "name_taken",
            FaceNotResolved = "face_not_resolved",
            DimensionMismatch = "dimension_mismatch",
        }
    }
    /// Define a load on a set of faces or the body.
    define_load {
        key: "cae.define_load", version: 1, kind: Command, effect: ProducesNew,
        input {
            model: Id<AnalysisModel>,
            name: String,
            faces: Vec<FaceRef>,
            kind: LoadKind,
            expected: Expected,
        }
        output { load: Id<Load>, new_revision: Revision }
        errors {
            ModelMissing = "model_missing",
            RevisionConflict = "revision_conflict",
            NameTaken = "name_taken",
            FaceNotResolved = "face_not_resolved",
            DimensionMismatch = "dimension_mismatch",
        }
    }
    /// Define an analysis step and which definitions it uses.
    define_step {
        key: "cae.define_step", version: 1, kind: Command, effect: ProducesNew,
        input {
            model: Id<AnalysisModel>,
            name: String,
            boundary_conditions: Vec<Id<BoundaryCondition>>,
            loads: Vec<Id<Load>>,
            expected: Expected,
        }
        output { step: Id<Step>, new_revision: Revision }
        errors {
            ModelMissing = "model_missing",
            RevisionConflict = "revision_conflict",
            NameTaken = "name_taken",
            DefinitionMissing = "definition_missing",
            NoBoundaryConditions = "no_boundary_conditions",
        }
    }
    /// Is the model ready to solve? Pre-solve readiness, not a check of results.
    check_model {
        key: "cae.check_model", version: 1, kind: Validator, effect: Pure,
        input { model: Id<AnalysisModel>, step: Id<Step> }
        output { ready: bool, errors: Vec<String>, warnings: Vec<String>, next_stage: Option<String> }
        errors { ModelMissing = "model_missing", StepMissing = "step_missing" }
    }
    /// Linear static analysis.
    solve_static {
        key: "cae.solve_static", version: 1, kind: Derivation, effect: ProducesNew,
        input { model: Id<AnalysisModel>, step: Id<Step>, max_dofs: Option<u64>, threads: Option<u32> }
        output { result: Id<ResultSet>, summary: SolveSummary }
        errors {
            ModelNotReady = "model_not_ready",
            SingularSystem = "singular_system",
            LimitExceeded = "limit_exceeded",
            RigidBodyMotion = "rigid_body_motion",
            NotSupported = "not_supported",
        }
    }
    /// Nonlinear static analysis (large deformation, plasticity, contact).
    solve_nonlinear {
        key: "cae.solve_nonlinear", version: 1, kind: Derivation, effect: ProducesNew,
        input { model: Id<AnalysisModel>, step: Id<Step>, increments: u32, max_iterations: u32 }
        output { result: Id<ResultSet>, summary: SolveSummary }
        errors {
            ModelNotReady = "model_not_ready",
            SingularSystem = "singular_system",
            LimitExceeded = "limit_exceeded",
            IncrementsInvalid = "increments_invalid",
            NotSupported = "not_supported",
        }
    }
    /// Natural frequencies and mode shapes.
    solve_frequency {
        key: "cae.solve_frequency", version: 1, kind: Derivation, effect: ProducesNew,
        input { model: Id<AnalysisModel>, step: Id<Step>, modes: u32 }
        output { result: Id<ResultSet>, summary: SolveSummary, frequencies: Vec<f64> }
        errors {
            ModelNotReady = "model_not_ready",
            ModesInvalid = "modes_invalid",
            SingularSystem = "singular_system",
            LimitExceeded = "limit_exceeded",
        }
    }
    /// Linear buckling load factors.
    solve_buckling {
        key: "cae.solve_buckling", version: 1, kind: Derivation, effect: ProducesNew,
        input { model: Id<AnalysisModel>, step: Id<Step>, modes: u32 }
        output { result: Id<ResultSet>, summary: SolveSummary, load_factors: Vec<f64> }
        errors {
            ModelNotReady = "model_not_ready",
            ModesInvalid = "modes_invalid",
            SingularSystem = "singular_system",
            LimitExceeded = "limit_exceeded",
        }
    }
    /// Steady or transient heat transfer.
    solve_heat {
        key: "cae.solve_heat", version: 1, kind: Derivation, effect: ProducesNew,
        input { model: Id<AnalysisModel>, step: Id<Step>, transient: bool, end_time: Option<f64> }
        output { result: Id<ResultSet>, summary: SolveSummary }
        errors {
            ModelNotReady = "model_not_ready",
            TimeInvalid = "time_invalid",
            SingularSystem = "singular_system",
            LimitExceeded = "limit_exceeded",
        }
    }
    /// Explicit dynamics.
    solve_explicit {
        key: "cae.solve_explicit", version: 1, kind: Derivation, effect: ProducesNew,
        input { model: Id<AnalysisModel>, step: Id<Step>, end_time: f64, mass_scaling: Option<f64> }
        output { result: Id<ResultSet>, summary: SolveSummary, eroded_elements: u32 }
        errors {
            ModelNotReady = "model_not_ready",
            TimeInvalid = "time_invalid",
            LimitExceeded = "limit_exceeded",
            NotSupported = "not_supported",
        }
    }
    /// Lattice-Boltzmann flow. `estimate_only` returns the cost without running.
    solve_fluid {
        key: "cae.solve_fluid", version: 1, kind: Derivation, effect: ProducesNew,
        input {
            model: Id<AnalysisModel>,
            step: Id<Step>,
            max_cells: u64,
            max_steps: u64,
            estimate_only: bool,
        }
        output {
            result: Option<Id<ResultSet>>,
            summary: SolveSummary,
            estimated_cells: u64,
            estimated_steps: u64,
            estimated_memory_bytes: u64,
        }
        errors {
            ModelNotReady = "model_not_ready",
            LimitExceeded = "limit_exceeded",
            NotSupported = "not_supported",
        }
    }
    /// Value of a field at a point.
    extract_probe {
        key: "cae.extract_probe", version: 1, kind: Query, effect: Pure,
        input { result: Id<ResultSet>, field: ResultField, point: Point3 }
        output { value: Vec<f64>, element_found: bool }
        errors {
            ResultMissing = "result_missing",
            ResultStale = "result_stale",
            PointOutsideModel = "point_outside_model",
            FieldNotAvailable = "field_not_available",
        }
    }
    /// Reaction forces per set and in total.
    extract_reactions {
        key: "cae.extract_reactions", version: 1, kind: Query, effect: Pure,
        input { result: Id<ResultSet> }
        output { per_set: Vec<ReactionLine>, total: Vector3 }
        errors { ResultMissing = "result_missing", ResultStale = "result_stale" }
    }
    /// Write the analysis model as a solver deck for another program.
    export_deck {
        key: "cae.export_deck", version: 1, kind: External, effect: WritesExternal,
        input { model: Id<AnalysisModel>, format: DeckFormat, path: String, steps: Vec<Id<Step>> }
        output { bytes: u64, sha256: String, unsupported: Vec<String> }
        errors {
            ModelMissing = "model_missing",
            ModelNotReady = "model_not_ready",
            PathNotAllowed = "path_not_allowed",
            NothingExpressible = "nothing_expressible",
        }
    }
}
