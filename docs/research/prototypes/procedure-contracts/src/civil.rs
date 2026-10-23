//! Civil engineering and survey: alignments, profiles, surfaces, earthwork, corridors,
//! networks, parcels, survey adjustment. Source: the Civil 3D study (documented behaviour)
//! cross-checked against QGIS and the LandXML study.

use crate::prelude::*;

wire! {
    #[derive(Copy, Eq)]
    pub enum Turn { Left, Right }
}
wire! {
    pub enum AlignmentElementSpec {
        Tangent { length: f64 },
        Arc { radius: f64, turn: Turn, length: f64 },
    }
}
wire! {
    /// A station equation. `internal_distance` says WHERE along the alignment it applies,
    /// so a repeated station value does not make the position ambiguous.
    #[derive(Copy)]
    pub struct StationEquation {
        pub internal_distance: f64,
        pub station_back: f64,
        pub station_ahead: f64,
        pub increasing: bool,
    }
}
wire! {
    #[derive(Copy)]
    pub struct Pvi { pub station: Station, pub elevation: f64, pub curve_length: Option<f64> }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum BreaklineKind { Standard, Proximity, Wall, NonDestructive }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum CrossingPolicy { Reject, UseFirst, UseLast, Average }
}
wire! {
    pub enum TinOperation {
        AddPoints(Vec<Point3>),
        AddBreakline { kind: BreaklineKind, points: Vec<Point3> },
        AddBoundary { outer: bool, ring: Vec<Point2> },
        AddContours(Vec<Vec<Point3>>),
        DeletePoints(Vec<u32>),
    }
}
wire! {
    pub struct TinBuildOptions {
        /// Points closer than this are merged (the second is dropped).
        pub merge_distance: f64,
        pub max_triangle_length: Option<f64>,
        /// Radians.
        pub max_triangle_angle: Option<f64>,
        pub crossing_breaklines: CrossingPolicy,
    }
}
wire! {
    #[derive(Copy)]
    pub struct TinVertex { pub x: f64, pub y: f64, pub existing_z: f64, pub design_z: f64 }
}
wire! {
    #[derive(Copy)]
    pub struct EarthworkVolumes {
        /// Where existing is above design.
        pub cut: f64,
        /// Where existing is below design.
        pub fill: f64,
        /// Cut minus fill; positive means net cut.
        pub net: f64,
        pub plan_area: f64,
    }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum SectionalMethod { AverageEndArea, Prismoidal, Composite }
}
wire! {
    /// What to do where only one of two surfaces exists.
    #[derive(Copy, Eq)]
    pub enum OverlapPolicy { RejectPartial, IntersectionOnly }
}
wire! {
    pub struct ParcelSegment { pub bearing: f64, pub distance: f64 }
}
wire! {
    pub struct SurveyObservation {
        pub from: u32,
        pub to: u32,
        pub kind: ObservationKind,
        pub value: f64,
        pub std_dev: f64,
    }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum ObservationKind { Distance, Angle, Bearing, ElevationDifference }
}
wire! {
    pub struct AdjustedPoint { pub id: u32, pub x: f64, pub y: f64, pub z: Option<f64> }
}

procedures! {
    /// Station and offset to a point and direction on an alignment.
    alignment_station_to_point {
        key: "civil.alignment_station_to_point", version: 1, kind: Calculation, effect: Pure,
        input { alignment: Id<Alignment>, station: Station, offset: f64 }
        output { point: Point2, direction: f64 }
        errors {
            AlignmentMissing = "alignment_missing",
            StationOutOfRange = "station_out_of_range",
            NonFiniteValue = "non_finite_value",
            StationAmbiguous = "station_ambiguous",
        }
    }
    /// Point to the nearest station and signed offset.
    alignment_point_to_station {
        key: "civil.alignment_point_to_station", version: 1, kind: Calculation, effect: Pure,
        input { alignment: Id<Alignment>, point: Point2 }
        output { station: Station, offset: f64 }
        errors {
            AlignmentMissing = "alignment_missing",
            NonFiniteValue = "non_finite_value",
            PointBeyondEnds = "point_beyond_ends",
        }
    }
    /// Validate an alignment's authored elements and station equations.
    alignment_validate {
        key: "civil.alignment_validate", version: 1, kind: Validator, effect: Pure,
        input { alignment: Id<Alignment> }
        output { valid: bool, total_length: f64, end_station: Station }
        errors {
            AlignmentMissing = "alignment_missing",
            TooFewElements = "too_few_elements",
            ElementInvalid = "element_invalid",
            StationEquationInvalid = "station_equation_invalid",
        }
    }
    /// Replace the station equations. Destructive for dependants: profiles and sample lines
    /// tied to the old stationing must be checked afterwards.
    alignment_set_station_equations {
        key: "civil.alignment_set_station_equations", version: 1, kind: Command, effect: MutatesInPlace,
        input { alignment: Id<Alignment>, equations: Vec<StationEquation>, expected: Expected }
        output { new_revision: Revision, dependants_to_check: Vec<EntityRef> }
        errors {
            AlignmentMissing = "alignment_missing",
            RevisionConflict = "revision_conflict",
            StationEquationInvalid = "station_equation_invalid",
            DependentProfileOutOfRange = "dependent_profile_out_of_range",
        }
    }
    /// Design elevation at a station along a profile.
    profile_elevation_at {
        key: "civil.profile_elevation_at", version: 1, kind: Calculation, effect: Pure,
        input { profile: Id<VerticalProfile>, station: Station }
        output { elevation: f64, grade: f64 }
        errors {
            ProfileMissing = "profile_missing",
            StationOutsideProfile = "station_outside_profile",
            NonFiniteValue = "non_finite_value",
        }
    }
    /// Does a profile fit its alignment's stationing? A cross-entity rule, so a procedure
    /// over both inputs.
    profile_fits_alignment {
        key: "civil.profile_fits_alignment", version: 1, kind: Validator, effect: Pure,
        input { profile: Id<VerticalProfile>, alignment: Id<Alignment> }
        output { fits: bool, out_of_range_pvis: Vec<u32> }
        errors {
            ProfileMissing = "profile_missing",
            AlignmentMissing = "alignment_missing",
            ProfileNotOnThisAlignment = "profile_not_on_this_alignment",
            StationsNotIncreasing = "stations_not_increasing",
        }
    }
    /// Edit a surface definition: an ordered list of operations (the stored recipe).
    tin_edit_definition {
        key: "civil.tin_edit_definition", version: 1, kind: Command, effect: MutatesInPlace,
        input { surface: Id<TinSurface>, operations: Vec<TinOperation>, expected: Expected }
        output { new_revision: Revision, full_rebuild_required: bool }
        errors {
            SurfaceMissing = "surface_missing",
            RevisionConflict = "revision_conflict",
            OperationInvalid = "operation_invalid",
            DuplicateXyDifferentZ = "duplicate_xy_different_z",
        }
    }
    /// Build the triangulation from the surface definition. Derived and cacheable; the result
    /// depends on operation order and on tie-breaking for co-circular points.
    tin_build {
        key: "civil.tin_build", version: 1, kind: Derivation, effect: ProducesNew,
        input { surface: Id<TinSurface>, options: TinBuildOptions }
        output { triangles: u32, points_merged: u32, triangles_trimmed: u32, extent: Aabb3 }
        errors {
            SurfaceMissing = "surface_missing",
            TooFewPoints = "too_few_points",
            AllCollinear = "all_collinear",
            CrossingBreaklines = "crossing_breaklines",
            OptionsInvalid = "options_invalid",
        }
    }
    /// Elevation of a surface at a plan position. Outside the hull is a rejection, never a number.
    tin_elevation_at {
        key: "civil.tin_elevation_at", version: 1, kind: Calculation, effect: Pure,
        input { surface: Id<TinSurface>, point: Point2 }
        output { elevation: f64 }
        errors {
            SurfaceMissing = "surface_missing",
            OutsideSurface = "outside_surface",
            SurfaceNotBuilt = "surface_not_built",
            NonFiniteValue = "non_finite_value",
        }
    }
    /// Cut and fill between two surfaces defined on the SAME triangulation. Exact for planar
    /// facets. Implemented in this crate; see [`Run`] below.
    earthwork_shared_triangulation {
        key: "civil.earthwork_shared_triangulation", version: 1, kind: Calculation, effect: Pure,
        input {
            vertices: Vec<TinVertex>,
            triangles: Vec<[u32; 3]>,
            /// Triangles with a plan area below this are rejected.
            min_triangle_area: f64,
        }
        output { volumes: EarthworkVolumes }
        errors {
            EmptyInput = "empty_input",
            TriangleIndexOutOfRange = "triangle_index_out_of_range",
            DegenerateTriangle = "degenerate_triangle",
            NonFiniteValue = "non_finite_value",
            InvalidTolerance = "invalid_tolerance",
        }
    }
    /// Cut and fill between two built surfaces of different triangulations (composite method:
    /// points of both plus the intersections of their triangle edges).
    earthwork_composite {
        key: "civil.earthwork_composite", version: 1, kind: Calculation, effect: Pure,
        input { existing: Id<TinSurface>, design: Id<TinSurface>, overlap: OverlapPolicy }
        output { volumes: EarthworkVolumes, overlap_area: f64, uncovered_area: f64 }
        errors {
            SurfaceMissing = "surface_missing",
            SurfaceNotBuilt = "surface_not_built",
            NoOverlap = "no_overlap",
            PartialOverlap = "partial_overlap",
        }
    }
    /// Cut and fill on a regular grid of differences (approximate; depends on spacing).
    earthwork_grid {
        key: "civil.earthwork_grid", version: 1, kind: Calculation, effect: Pure,
        input {
            existing: Id<TinSurface>,
            design: Id<TinSurface>,
            spacing: [f64; 2],
            /// Radians.
            orientation: f64,
        }
        output { volumes: EarthworkVolumes, samples: u32, samples_outside: u32 }
        errors {
            SurfaceMissing = "surface_missing",
            SurfaceNotBuilt = "surface_not_built",
            SpacingInvalid = "spacing_invalid",
            NoOverlap = "no_overlap",
        }
    }
    /// Cut and fill from cross-sections along sample lines.
    earthwork_sections {
        key: "civil.earthwork_sections", version: 1, kind: Calculation, effect: Pure,
        input {
            sample_lines: Id<SampleLineGroup>,
            existing: Id<TinSurface>,
            design: Id<TinSurface>,
            method: SectionalMethod,
            curve_correction: bool,
        }
        output { volumes: EarthworkVolumes, per_line: Vec<EarthworkVolumes>, lines_outside: u32 }
        errors {
            SampleLinesMissing = "sample_lines_missing",
            SurfaceMissing = "surface_missing",
            CurveCorrectionNotAllowed = "curve_correction_not_allowed",
            LineOutsideSurface = "line_outside_surface",
        }
    }
    /// Create a derived surface holding the difference of two surfaces.
    volume_surface_create {
        key: "civil.volume_surface_create", version: 1, kind: Command, effect: ProducesNew,
        input { name: String, base: Id<TinSurface>, comparison: Id<TinSurface> }
        output { volume_surface: Id<VolumeSurface> }
        errors {
            SurfaceMissing = "surface_missing",
            NameTaken = "name_taken",
            SameSurface = "same_surface",
        }
    }
    /// Volume of a surface within a boundary.
    bounded_volume {
        key: "civil.bounded_volume", version: 1, kind: Calculation, effect: Pure,
        input { surface: Id<VolumeSurface>, boundary: Ring2 }
        output { volumes: EarthworkVolumes }
        errors {
            SurfaceMissing = "surface_missing",
            BoundaryInvalid = "boundary_invalid",
            BoundaryOutsideSurface = "boundary_outside_surface",
        }
    }
    /// Sweep an assembly along a baseline, region by region.
    corridor_build {
        key: "civil.corridor_build", version: 1, kind: Derivation, effect: ProducesNew,
        input { corridor: Id<Corridor>, frequency: f64, regions: Option<Vec<u32>> }
        output { stations_built: u32, surfaces_created: u32, targets_unset: Vec<String> }
        errors {
            CorridorMissing = "corridor_missing",
            BaselineInvalid = "baseline_invalid",
            AssemblyMissing = "assembly_missing",
            RegionOutOfRange = "region_out_of_range",
            TargetUnset = "target_unset",
        }
    }
    /// Set a feature line's grade (crossings split by priority).
    feature_line_set_grade {
        key: "civil.feature_line_set_grade", version: 1, kind: Command, effect: MutatesInPlace,
        input { feature_line: Id<FeatureLine>, from_vertex: u32, grade: f64, expected: Expected }
        output { new_revision: Revision, crossings_resolved: u32 }
        errors {
            FeatureLineMissing = "feature_line_missing",
            RevisionConflict = "revision_conflict",
            VertexOutOfRange = "vertex_out_of_range",
            GradeNotFinite = "grade_not_finite",
        }
    }
    /// Solve pipe and structure elevations from rules (cover, gradient, drop across structures).
    pipe_network_solve {
        key: "civil.pipe_network_solve", version: 1, kind: Derivation, effect: ProducesNew,
        input { network: Id<PipeNetwork>, surface: Option<Id<TinSurface>> }
        output { rule_violations: Vec<String>, structures_moved: u32 }
        errors {
            NetworkMissing = "network_missing",
            DisconnectedPipe = "disconnected_pipe",
            SurfaceMissing = "surface_missing",
            RuleConflict = "rule_conflict",
        }
    }
    /// Area, perimeter and closure error of a parcel.
    parcel_closure {
        key: "civil.parcel_closure", version: 1, kind: Calculation, effect: Pure,
        input { start: Point2, segments: Vec<ParcelSegment>, use_label_precision: bool }
        output {
            area: f64,
            perimeter: f64,
            /// Misclosure distance.
            closure_error: f64,
            /// "1 part in X".
            precision_ratio: f64,
        }
        errors {
            NoSegments = "no_segments",
            NonFiniteValue = "non_finite_value",
            ZeroPerimeter = "zero_perimeter",
        }
    }
    /// Least-squares adjustment of a survey network.
    survey_adjust {
        key: "civil.survey_adjust", version: 1, kind: Calculation, effect: Pure,
        input {
            network: Id<SurveyNetwork>,
            observations: Vec<SurveyObservation>,
            fixed: Vec<u32>,
            max_iterations: u32,
        }
        output {
            adjusted: Vec<AdjustedPoint>,
            iterations: u32,
            converged: bool,
            reference_variance: f64,
            largest_residual: f64,
        }
        errors {
            NetworkMissing = "network_missing",
            NoFixedPoint = "no_fixed_point",
            UnderDetermined = "under_determined",
            ObservationInvalid = "observation_invalid",
            StdDevNotPositive = "std_dev_not_positive",
        }
    }
}

// ----------------------------------------------------------------------- implementation

type P = (f64, f64, f64);

fn tri_area(a: P, b: P, c: P) -> f64 {
    0.5 * ((b.0 - a.0) * (c.1 - a.1) - (c.0 - a.0) * (b.1 - a.1)).abs()
}

/// Clip a polygon whose vertices carry a linear value `d` to the half-plane `d >= 0`.
fn clip_positive(poly: &[P]) -> Vec<P> {
    let n = poly.len();
    let mut out = Vec::with_capacity(n + 1);
    for i in 0..n {
        let p = poly[i];
        let q = poly[(i + 1) % n];
        let (p_in, q_in) = (p.2 >= 0.0, q.2 >= 0.0);
        if p_in {
            out.push(p);
        }
        if p_in != q_in {
            let t = p.2 / (p.2 - q.2);
            out.push((p.0 + t * (q.0 - p.0), p.1 + t * (q.1 - p.1), 0.0));
        }
    }
    out
}

/// Integral of `max(d, 0)` over a triangle where `d` is linear. Exact.
fn positive_volume(tri: [P; 3]) -> f64 {
    let poly = clip_positive(&tri);
    if poly.len() < 3 {
        return 0.0;
    }
    (1..poly.len() - 1)
        .map(|k| {
            let (a, b, c) = (poly[0], poly[k], poly[k + 1]);
            tri_area(a, b, c) * (a.2 + b.2 + c.2) / 3.0
        })
        .sum()
}

impl Run for earthwork_shared_triangulation::Spec {
    fn run(
        _ctx: &Ctx,
        input: &earthwork_shared_triangulation::Input,
    ) -> Outcome<earthwork_shared_triangulation::Output, earthwork_shared_triangulation::Error> {
        use earthwork_shared_triangulation::{Error, Output};
        let mut violations: Vec<Rejection<Error>> = Vec::new();
        let mut reject = |error: Error, path: String, message: String| {
            violations.push(Rejection { error, path, message });
        };

        if !(input.min_triangle_area.is_finite() && input.min_triangle_area >= 0.0) {
            reject(Error::InvalidTolerance, "/min_triangle_area".into(), "must be finite and >= 0".into());
        }
        if input.vertices.is_empty() || input.triangles.is_empty() {
            reject(Error::EmptyInput, String::new(), "need at least one triangle".into());
            return Outcome::Rejected { violations };
        }
        let mut any_non_finite = false;
        for (i, v) in input.vertices.iter().enumerate() {
            for (name, value) in [("x", v.x), ("y", v.y), ("existing_z", v.existing_z), ("design_z", v.design_z)] {
                if !value.is_finite() {
                    any_non_finite = true;
                    reject(Error::NonFiniteValue, format!("/vertices/{i}/{name}"), "must be a finite number".into());
                }
            }
        }
        for (t, tri) in input.triangles.iter().enumerate() {
            let mut in_range = true;
            for (k, &idx) in tri.iter().enumerate() {
                if idx as usize >= input.vertices.len() {
                    in_range = false;
                    reject(
                        Error::TriangleIndexOutOfRange,
                        format!("/triangles/{t}/{k}"),
                        format!("index {idx} but only {} vertices", input.vertices.len()),
                    );
                }
            }
            if in_range && !any_non_finite {
                let [a, b, c] = tri.map(|i| input.vertices[i as usize]);
                let area = tri_area((a.x, a.y, 0.0), (b.x, b.y, 0.0), (c.x, c.y, 0.0));
                if area < input.min_triangle_area {
                    reject(
                        Error::DegenerateTriangle,
                        format!("/triangles/{t}"),
                        format!("plan area {area:e} below minimum {:e}", input.min_triangle_area),
                    );
                }
            }
        }
        if !violations.is_empty() {
            return Outcome::Rejected { violations };
        }

        let (mut cut, mut fill, mut plan_area) = (0.0, 0.0, 0.0);
        for tri in &input.triangles {
            let pts: [P; 3] = tri.map(|i| {
                let v = input.vertices[i as usize];
                (v.x, v.y, v.existing_z - v.design_z)
            });
            let neg: [P; 3] = pts.map(|p| (p.0, p.1, -p.2));
            cut += positive_volume(pts);
            fill += positive_volume(neg);
            plan_area += tri_area(pts[0], pts[1], pts[2]);
        }
        Outcome::ok(Output { volumes: EarthworkVolumes { cut, fill, net: cut - fill, plan_area } })
    }
}

#[cfg(test)]
mod earthwork_tests {
    use super::*;
    use earthwork_shared_triangulation::{Error, Input};

    fn ctx() -> Ctx {
        Ctx::local_metres(Revision(42))
    }
    fn square(f: impl Fn(f64, f64) -> (f64, f64), flip: bool) -> Input {
        let corners = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)];
        Input {
            vertices: corners
                .iter()
                .map(|&(x, y)| {
                    let (existing_z, design_z) = f(x, y);
                    TinVertex { x, y, existing_z, design_z }
                })
                .collect(),
            triangles: if flip { vec![[0, 1, 3], [1, 2, 3]] } else { vec![[0, 1, 2], [0, 2, 3]] },
            min_triangle_area: 1e-9,
        }
    }
    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-9
    }

    #[test]
    fn one_metre_above_design_is_100_cut_0_fill() {
        let v = earthwork_shared_triangulation::Spec::run(&ctx(), &square(|_, _| (1.0, 0.0), false))
            .into_value()
            .unwrap()
            .volumes;
        assert!(close(v.cut, 100.0) && close(v.fill, 0.0) && close(v.net, 100.0) && close(v.plan_area, 100.0));
    }

    #[test]
    fn sloped_difference_splits_exactly_with_either_diagonal() {
        for flip in [false, true] {
            let v = earthwork_shared_triangulation::Spec::run(&ctx(), &square(|x, _| (x - 5.0, 0.0), flip))
                .into_value()
                .unwrap()
                .volumes;
            assert!(close(v.cut, 125.0) && close(v.fill, 125.0) && close(v.net, 0.0));
        }
    }

    #[test]
    fn bad_input_is_rejected_with_stable_codes_and_paths_not_counted_as_zero() {
        let mut i = square(|_, _| (1.0, 0.0), false);
        i.triangles[0][2] = 9;
        match earthwork_shared_triangulation::Spec::run(&ctx(), &i) {
            Outcome::Rejected { violations } => {
                assert_eq!(violations[0].error, Error::TriangleIndexOutOfRange);
                assert_eq!(violations[0].path, "/triangles/0/2");
                assert_eq!(violations[0].error.code(), "triangle_index_out_of_range");
            }
            other => panic!("expected rejection, got {other:?}"),
        }
        let mut d = square(|_, _| (1.0, 0.0), false);
        d.triangles[1] = [0, 0, 2];
        assert_eq!(
            earthwork_shared_triangulation::Spec::run(&ctx(), &d).verdict(),
            Verdict::Reject
        );
    }
}
