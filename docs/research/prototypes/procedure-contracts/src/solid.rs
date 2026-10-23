//! Solid and surface modelling: features, booleans, blends, queries, healing.
//! Sources: AutoCAD 3D, SolidCraft, solidcore, smlib, FreeCAD/OpenSCAD cross-checks.

use crate::prelude::*;

wire! {
    pub enum ProfileSelection {
        /// Every closed profile of the sketch.
        All,
        /// Profiles found again on every recompute by their curve ids.
        ByCurveIds(Vec<u32>),
        /// The profile containing this point (converted to curve ids on first use).
        AtPoint(Point3),
    }
}
wire! {
    pub struct ProfileRef { pub sketch: Id<Sketch>, pub selection: ProfileSelection }
}
wire! {
    pub struct PathRef { pub sketch: Id<Sketch>, pub curve_ids: Vec<u32> }
}
wire! {
    pub enum ExtrudeExtent {
        Distance(Expr),
        Symmetric(Expr),
        TwoSided { first: Expr, second: Expr },
        ThroughAll,
        ToFace(FaceRef),
        /// Draft angle in radians; positive tapers inward.
        Taper { distance: Expr, angle: Expr },
    }
}
wire! {
    pub enum AxisRef {
        SketchLine(u32),
        World(WorldAxis),
        Explicit(Axis),
    }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum WorldAxis { X, Y, Z }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum SweepOrientation { Normal, Fixed, Frenet }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum FilletStyle { Constant, Chord, Curvature, Variable, Spline }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum FilletFit { Exact, Reduce, Taper }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum CornerStyle { Rolling, G2 }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum ShellDirection { Inside, Outside, Both }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum HoleKind { Simple, Counterbore, Countersink }
}
wire! {
    pub enum PatternKind {
        Linear { direction: Vector3, count: u32, spacing: Expr },
        Circular { axis: Axis, count: u32, angle: Expr },
        Grid { first: Vector3, second: Vector3, counts: [u32; 2], spacing: [Expr; 2] },
    }
}
wire! {
    pub enum Primitive {
        Box { origin: Point3, length: f64, width: f64, height: f64 },
        Cylinder { origin: Point3, axis: Vector3, radius: f64, height: f64 },
        Sphere { centre: Point3, radius: f64 },
        Cone { origin: Point3, axis: Vector3, radius: f64, top_radius: f64, height: f64 },
        Torus { centre: Point3, axis: Vector3, major_radius: f64, minor_radius: f64 },
        Pyramid { origin: Point3, base: [f64; 2], height: f64 },
    }
}
wire! {
    pub struct Inertia { pub ixx: f64, pub iyy: f64, pub izz: f64, pub iyz: f64, pub izx: f64, pub ixy: f64 }
}
wire! {
    pub struct IntersectionCurve { pub points: Vec<Point3>, pub closed: bool }
}
wire! {
    pub enum Postcondition {
        Manifold,
        VolumeBetween { min: f64, max: f64 },
        FaceCountBetween { min: u32, max: u32 },
        BoundingBoxWithin(Aabb3),
        EulerCharacteristic(i32),
    }
}
wire! {
    pub struct PostconditionResult { pub condition: Postcondition, pub measured: f64, pub verdict: Verdict }
}

procedures! {
    /// Sweep a profile along a straight extent.
    extrude {
        key: "solid.extrude", version: 1, kind: Derivation, effect: ProducesNew,
        input {
            profile: ProfileRef,
            extent: ExtrudeExtent,
            operation: SolidOp,
            /// Bodies the feature joins, cuts or intersects with.
            targets: Vec<Id<Body>>,
            /// Wall thickness for a thin extrude; none for a solid one.
            thin: Option<Expr>,
        }
        output { change: BodyChange }
        errors {
            ProfileNotClosed = "profile_not_closed",
            ProfileSelfIntersecting = "profile_self_intersecting",
            ExtentDegenerate = "extent_degenerate",
            DirectionParallelToProfile = "direction_parallel_to_profile",
            TaperCollapsesShape = "taper_collapses_shape",
            TargetMissing = "target_missing",
            KernelFailed = "kernel_failed",
        }
    }
    /// Revolve a profile around an axis.
    revolve {
        key: "solid.revolve", version: 1, kind: Derivation, effect: ProducesNew,
        input {
            profile: ProfileRef,
            axis: AxisRef,
            /// Radians; a full solid of revolution needs a full turn.
            angle: Expr,
            symmetric: bool,
            operation: SolidOp,
            targets: Vec<Id<Body>>,
        }
        output { change: BodyChange }
        errors {
            ProfileNotClosed = "profile_not_closed",
            AxisInvalid = "axis_invalid",
            AngleInvalid = "angle_invalid",
            AxisCrossesProfile = "axis_crosses_profile",
            TargetMissing = "target_missing",
            KernelFailed = "kernel_failed",
        }
    }
    /// Sweep a profile along a path.
    sweep {
        key: "solid.sweep", version: 1, kind: Derivation, effect: ProducesNew,
        input {
            profile: ProfileRef,
            path: PathRef,
            orientation: SweepOrientation,
            twist: Option<Expr>,
            scale: Option<Expr>,
            operation: SolidOp,
            targets: Vec<Id<Body>>,
        }
        output { change: BodyChange }
        errors {
            ProfileNotClosed = "profile_not_closed",
            PathInvalid = "path_invalid",
            PathSharpCurvature = "path_sharp_curvature",
            TargetMissing = "target_missing",
            KernelFailed = "kernel_failed",
        }
    }
    /// Skin through two or more sections.
    loft {
        key: "solid.loft", version: 1, kind: Derivation, effect: ProducesNew,
        input {
            sections: Vec<ProfileRef>,
            rails: Vec<PathRef>,
            closed: bool,
            operation: SolidOp,
            targets: Vec<Id<Body>>,
        }
        output { change: BodyChange }
        errors {
            TooFewSections = "too_few_sections",
            SectionsIncompatible = "sections_incompatible",
            RailMissesSection = "rail_misses_section",
            TargetMissing = "target_missing",
            KernelFailed = "kernel_failed",
        }
    }
    /// Union, difference, intersection or merge of bodies.
    boolean {
        key: "solid.boolean", version: 1, kind: Derivation, effect: ConsumesInputs,
        input {
            target: Id<Body>,
            tools: Vec<Id<Body>>,
            op: BoolOp,
            /// Keep the tool bodies; otherwise they are consumed.
            keep_tools: bool,
        }
        output { change: BodyChange }
        errors {
            OperandMissing = "operand_missing",
            BodyCombinedWithItself = "body_combined_with_itself",
            NoTools = "no_tools",
            OperandNotSolid = "operand_not_solid",
            NoOverlap = "no_overlap",
            KernelFailed = "kernel_failed",
        }
    }
    /// Round edges.
    fillet {
        key: "solid.fillet", version: 1, kind: Derivation, effect: ProducesNew,
        input {
            edges: Vec<EdgeRef>,
            radius: Expr,
            style: FilletStyle,
            fit: FilletFit,
            corner: CornerStyle,
        }
        output { change: BodyChange }
        errors {
            NoEdgeResolved = "no_edge_resolved",
            RadiusNotPositive = "radius_not_positive",
            RadiusTooLarge = "radius_too_large",
            EdgesOnDifferentBodies = "edges_on_different_bodies",
            BlendFailed = "blend_failed",
        }
    }
    /// Bevel edges.
    chamfer {
        key: "solid.chamfer", version: 1, kind: Derivation, effect: ProducesNew,
        input {
            edges: Vec<EdgeRef>,
            distance: Expr,
            /// Second distance, or an angle in radians, for an asymmetric chamfer.
            distance2: Option<Expr>,
            flip: bool,
        }
        output { change: BodyChange }
        errors {
            NoEdgeResolved = "no_edge_resolved",
            DistanceNotPositive = "distance_not_positive",
            DistanceTooLarge = "distance_too_large",
            EdgesShareNoFace = "edges_share_no_face",
            BlendFailed = "blend_failed",
        }
    }
    /// Hollow a body, removing selected faces.
    shell {
        key: "solid.shell", version: 1, kind: Derivation, effect: ProducesNew,
        input {
            faces: Vec<FaceRef>,
            thickness: Expr,
            direction: ShellDirection,
            tangent_chain: bool,
        }
        output { change: BodyChange }
        errors {
            NoFaceResolved = "no_face_resolved",
            ThicknessNotPositive = "thickness_not_positive",
            FaceNotOnBody = "face_not_on_body",
            ResultInvalid = "result_invalid",
            KernelFailed = "kernel_failed",
        }
    }
    /// Offset all faces of a body by a distance (negative insets).
    offset {
        key: "solid.offset", version: 1, kind: Derivation, effect: ProducesNew,
        input { body: Id<Body>, distance: f64 }
        output { change: BodyChange }
        errors {
            BodyMissing = "body_missing",
            DistanceZero = "distance_zero",
            SelfIntersectionAfterOffset = "self_intersection_after_offset",
            KernelFailed = "kernel_failed",
        }
    }
    /// Split a body (or surface) with a plane.
    slice {
        key: "solid.slice", version: 1, kind: Derivation, effect: ProducesNew,
        input {
            body: Id<Body>,
            plane: Plane,
            /// Keep both sides, or only the side containing this point.
            keep_side: Option<Point3>,
        }
        output { change: BodyChange }
        errors {
            BodyMissing = "body_missing",
            PlaneDoesNotCut = "plane_does_not_cut",
            KeepPointOnPlane = "keep_point_on_plane",
            KernelFailed = "kernel_failed",
        }
    }
    /// Planar cross-section of a body as 2D regions.
    section {
        key: "solid.section", version: 1, kind: Calculation, effect: Pure,
        input { body: Id<Body>, plane: Plane }
        output { regions: Vec<Ring2> }
        errors {
            BodyMissing = "body_missing",
            PlaneDoesNotCut = "plane_does_not_cut",
            KernelFailed = "kernel_failed",
        }
    }
    /// Drill a hole into a face.
    hole {
        key: "solid.hole", version: 1, kind: Derivation, effect: ProducesNew,
        input {
            face: FaceRef,
            position: Point3,
            direction: Vector3,
            kind: HoleKind,
            diameter: Expr,
            depth: Option<Expr>,
        }
        output { change: BodyChange }
        errors {
            FaceNotResolved = "face_not_resolved",
            DiameterNotPositive = "diameter_not_positive",
            DepthInvalid = "depth_invalid",
            KernelFailed = "kernel_failed",
        }
    }
    /// Replay features or copy bodies in a pattern.
    pattern {
        key: "solid.pattern", version: 1, kind: Derivation, effect: ProducesNew,
        input { features: Vec<Id<Feature>>, bodies: Vec<Id<Body>>, kind: PatternKind }
        output { change: BodyChange }
        errors {
            NothingToPattern = "nothing_to_pattern",
            CountInvalid = "count_invalid",
            InstancesOverlap = "instances_overlap",
            KernelFailed = "kernel_failed",
        }
    }
    /// Mirror features or bodies about a plane.
    mirror {
        key: "solid.mirror", version: 1, kind: Derivation, effect: ProducesNew,
        input { features: Vec<Id<Feature>>, bodies: Vec<Id<Body>>, plane: Plane }
        output { change: BodyChange }
        errors {
            NothingToMirror = "nothing_to_mirror",
            PlaneInvalid = "plane_invalid",
            KernelFailed = "kernel_failed",
        }
    }
    /// Create a box, cylinder, sphere, cone, torus or pyramid.
    create_primitive {
        key: "solid.create_primitive", version: 1, kind: Command, effect: ProducesNew,
        input { shape: Primitive }
        output { body: Id<Body> }
        errors {
            DimensionNotPositive = "dimension_not_positive",
            NonFiniteValue = "non_finite_value",
            AxisZero = "axis_zero",
            KernelFailed = "kernel_failed",
        }
    }
    /// Apply an affine transform to bodies.
    transform_bodies {
        key: "solid.transform_bodies", version: 1, kind: Command, effect: MutatesInPlace,
        input { bodies: Vec<Id<Body>>, transform: Transform3 }
        output { change: BodyChange }
        errors {
            BodyMissing = "body_missing",
            TransformSingular = "transform_singular",
            TransformNotRigid = "transform_not_rigid",
        }
    }
    /// Stitch faces into shells and solids. Reports what happened; never just "success".
    stitch {
        key: "solid.stitch", version: 1, kind: Command, effect: MutatesInPlace,
        input { body: Id<Body>, tolerance: f64, orient: bool }
        output {
            stitched_edges: u32,
            produces_solid: bool,
            max_vertex_gap: f64,
            max_edge_gap: f64,
        }
        errors {
            BodyMissing = "body_missing",
            ToleranceInvalid = "tolerance_invalid",
            NothingToStitch = "nothing_to_stitch",
        }
    }
    /// Repair a body. The output is a report; the caller (or verifier) checks the body.
    heal {
        key: "solid.heal", version: 1, kind: Command, effect: MutatesInPlace,
        input { body: Id<Body>, tolerance: Option<f64> }
        output { repairs_attempted: u32, repairs_succeeded: u32, issues_remaining: u32 }
        errors {
            BodyMissing = "body_missing",
            ToleranceInvalid = "tolerance_invalid",
        }
    }
    /// Make face orientations consistent.
    unify_normals {
        key: "solid.unify_normals", version: 1, kind: Command, effect: MutatesInPlace,
        input { body: Id<Body> }
        output { flipped_faces: u32 }
        errors { BodyMissing = "body_missing", NonManifold = "non_manifold" }
    }
    /// Area, volume, mass, centre of mass and inertia of a body.
    mass_properties {
        key: "solid.mass_properties", version: 1, kind: Calculation, effect: Pure,
        input {
            body: Id<Body>,
            /// Integration accuracy; clamped by the procedure. The comparison tolerance of
            /// any verifier must follow it.
            relative_accuracy: f64,
            density: f64,
            origin: Point3,
        }
        output {
            area: f64,
            volume: f64,
            mass: f64,
            centroid: Point3,
            inertia: Inertia,
            /// The accuracy actually used after clamping.
            accuracy_used: f64,
        }
        errors {
            BodyMissing = "body_missing",
            NotManifoldSolid = "not_manifold_solid",
            DensityInvalid = "density_invalid",
            AccuracyInvalid = "accuracy_invalid",
            NonFiniteValue = "non_finite_value",
            MassAttributeConflict = "mass_attribute_conflict",
            DegenerateMass = "degenerate_mass",
        }
    }
    /// Closest point on a body to a given point.
    closest_point {
        key: "solid.closest_point", version: 1, kind: Query, effect: Pure,
        input { body: Id<Body>, point: Point3 }
        output { closest: Point3, distance: f64, face: Option<FaceRef> }
        errors { BodyMissing = "body_missing", NonFiniteValue = "non_finite_value" }
    }
    /// Is this body a manifold solid? A validator, so it can be used as an independent check.
    is_manifold_solid {
        key: "solid.is_manifold_solid", version: 1, kind: Validator, effect: Pure,
        input { body: Id<Body> }
        output { manifold: bool, closed: bool, consistent_orientation: bool, shells: u32 }
        errors { BodyMissing = "body_missing" }
    }
    /// Intersection curves of two faces' surfaces.
    intersect_surfaces {
        key: "solid.intersect_surfaces", version: 1, kind: Calculation, effect: Pure,
        input {
            a: FaceRef,
            b: FaceRef,
            approx_tolerance: Option<f64>,
            angle_tolerance: Option<f64>,
        }
        output { curves: Vec<IntersectionCurve> }
        errors {
            FaceNotResolved = "face_not_resolved",
            SurfaceDegenerate = "surface_degenerate",
            SurfacesCoincident = "surfaces_coincident",
        }
    }
    /// Triangulate a body into a mesh.
    tessellate {
        key: "solid.tessellate", version: 1, kind: Derivation, effect: ProducesNew,
        input { body: Id<Body>, chord_tolerance: f64, angle_tolerance: f64 }
        output { mesh: Id<Mesh>, triangles: u32 }
        errors {
            BodyMissing = "body_missing",
            ToleranceInvalid = "tolerance_invalid",
            FaceNotTessellable = "face_not_tessellable",
        }
    }
    /// Check a body against stated postconditions, independently of how it was made.
    check_postconditions {
        key: "solid.check_postconditions", version: 1, kind: Validator, effect: Pure,
        input { body: Id<Body>, conditions: Vec<Postcondition> }
        output { results: Vec<PostconditionResult> }
        errors { BodyMissing = "body_missing", NoConditions = "no_conditions" }
    }
}
