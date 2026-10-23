//! Polygon and triangle mesh editing, derivation and measurement.
//! Sources: 3ds Max Editable Poly and modifiers, Blender bmesh operators and modifiers,
//! MeshLab filters, Wings3D, and the glTF/mesh-derivation requirements of the format brief.

use crate::prelude::*;

wire! {
    #[derive(Copy, Eq)]
    pub enum MeshElementKind { Vertex, Edge, Border, Polygon }
}
wire! {
    pub struct ElementSelection { pub mesh: Id<Mesh>, pub kind: MeshElementKind, pub indices: Vec<u32> }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum SubdivisionScheme { CatmullClark, Loop }
}
wire! {
    pub enum DecimationTarget { Triangles(u32), Ratio(f64), MaxError(f64) }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum ThicknessDirection { Inside, Outside, Both }
}
wire! {
    pub struct Deviation { pub max: f64, pub mean: f64, pub rms: f64 }
}

procedures! {
    /// Extrude selected polygons.
    poly_extrude {
        key: "mesh.poly_extrude", version: 1, kind: Command, effect: MutatesInPlace,
        input {
            selection: ElementSelection,
            height: f64,
            /// Extrude connected polygons as one group.
            as_group: bool,
            expected: Expected,
        }
        output { created_polygons: Vec<u32>, new_revision: Revision }
        errors {
            SelectionEmpty = "selection_empty",
            SelectionKindWrong = "selection_kind_wrong",
            RevisionConflict = "revision_conflict",
            HeightNotFinite = "height_not_finite",
        }
    }
    /// Bevel selected polygons or edges.
    poly_bevel {
        key: "mesh.poly_bevel", version: 1, kind: Command, effect: MutatesInPlace,
        input { selection: ElementSelection, height: f64, outline: f64, expected: Expected }
        output { created_polygons: Vec<u32>, new_revision: Revision }
        errors {
            SelectionEmpty = "selection_empty",
            SelectionKindWrong = "selection_kind_wrong",
            RevisionConflict = "revision_conflict",
            OutlineTooLarge = "outline_too_large",
        }
    }
    /// Inset selected polygons.
    poly_inset {
        key: "mesh.poly_inset", version: 1, kind: Command, effect: MutatesInPlace,
        input { selection: ElementSelection, amount: f64, by_polygon: bool, expected: Expected }
        output { created_polygons: Vec<u32>, new_revision: Revision }
        errors {
            SelectionEmpty = "selection_empty",
            SelectionKindWrong = "selection_kind_wrong",
            RevisionConflict = "revision_conflict",
            AmountTooLarge = "amount_too_large",
        }
    }
    /// Chamfer selected edges or vertices.
    poly_chamfer {
        key: "mesh.poly_chamfer", version: 1, kind: Command, effect: MutatesInPlace,
        input { selection: ElementSelection, amount: f64, segments: u32, expected: Expected }
        output { created_polygons: Vec<u32>, new_revision: Revision }
        errors {
            SelectionEmpty = "selection_empty",
            SelectionKindWrong = "selection_kind_wrong",
            RevisionConflict = "revision_conflict",
            AmountTooLarge = "amount_too_large",
            SegmentsInvalid = "segments_invalid",
        }
    }
    /// Merge vertices closer than a threshold.
    weld {
        key: "mesh.weld", version: 1, kind: Command, effect: MutatesInPlace,
        input { selection: ElementSelection, threshold: f64, expected: Expected }
        output { vertices_removed: u32, new_revision: Revision }
        errors {
            SelectionEmpty = "selection_empty",
            RevisionConflict = "revision_conflict",
            ThresholdInvalid = "threshold_invalid",
        }
    }
    /// Merge other meshes into one.
    attach {
        key: "mesh.attach", version: 1, kind: Command, effect: ConsumesInputs,
        input { target: Id<Mesh>, others: Vec<Id<Mesh>>, expected: Expected }
        output { new_revision: Revision, absorbed: u32 }
        errors {
            MeshMissing = "mesh_missing",
            RevisionConflict = "revision_conflict",
            AttachedToItself = "attached_to_itself",
        }
    }
    /// Subdivision smoothing.
    subdivide {
        key: "mesh.subdivide", version: 1, kind: Derivation, effect: ProducesNew,
        input { mesh: Id<Mesh>, iterations: u32, scheme: SubdivisionScheme }
        output { mesh: Id<Mesh>, polygons: u32 }
        errors {
            MeshMissing = "mesh_missing",
            IterationsTooMany = "iterations_too_many",
            MeshNotManifold = "mesh_not_manifold",
        }
    }
    /// Boolean of two meshes.
    mesh_boolean {
        key: "mesh.boolean", version: 1, kind: Derivation, effect: ProducesNew,
        input { a: Id<Mesh>, b: Id<Mesh>, op: BoolOp }
        output { mesh: Id<Mesh> }
        errors {
            MeshMissing = "mesh_missing",
            OperandNotClosed = "operand_not_closed",
            OperandNotManifold = "operand_not_manifold",
            SelfIntersecting = "self_intersecting",
        }
    }
    /// Mirror a mesh across a plane, optionally welding the seam.
    mirror {
        key: "mesh.mirror", version: 1, kind: Derivation, effect: ProducesNew,
        input { mesh: Id<Mesh>, plane: Plane, weld_seam: bool, weld_threshold: f64 }
        output { mesh: Id<Mesh> }
        errors {
            MeshMissing = "mesh_missing",
            PlaneInvalid = "plane_invalid",
            ThresholdInvalid = "threshold_invalid",
        }
    }
    /// Give a surface mesh thickness (shell, solidify).
    solidify {
        key: "mesh.solidify", version: 1, kind: Derivation, effect: ProducesNew,
        input { mesh: Id<Mesh>, thickness: f64, direction: ThicknessDirection }
        output { mesh: Id<Mesh> }
        errors {
            MeshMissing = "mesh_missing",
            ThicknessZero = "thickness_zero",
            MeshNotManifold = "mesh_not_manifold",
        }
    }
    /// Reduce triangle count.
    decimate {
        key: "mesh.decimate", version: 1, kind: Derivation, effect: ProducesNew,
        input { mesh: Id<Mesh>, target: DecimationTarget, preserve_boundary: bool }
        output { mesh: Id<Mesh>, triangles_before: u32, triangles_after: u32, deviation: Deviation }
        errors {
            MeshMissing = "mesh_missing",
            TargetInvalid = "target_invalid",
            MeshNotTriangulated = "mesh_not_triangulated",
        }
    }
    /// Repair a mesh: duplicate vertices, degenerate faces, holes.
    repair {
        key: "mesh.repair", version: 1, kind: Derivation, effect: ProducesNew,
        input { mesh: Id<Mesh>, fill_holes: bool, remove_duplicates: bool, remove_degenerate: bool }
        output { mesh: Id<Mesh>, holes_filled: u32, duplicates_removed: u32, degenerate_removed: u32 }
        errors { MeshMissing = "mesh_missing", NothingToRepair = "nothing_to_repair" }
    }
    /// Area, volume, closedness, manifoldness, orientation of a mesh. Volume is absent unless
    /// the mesh is closed, manifold and consistently oriented.
    measure {
        key: "mesh.measure", version: 1, kind: Calculation, effect: Pure,
        input { mesh: Id<Mesh> }
        output {
            area: f64,
            volume: Option<f64>,
            closed: bool,
            manifold: bool,
            consistent_orientation: bool,
            components: u32,
            bounds: Aabb3,
        }
        errors { MeshMissing = "mesh_missing", MeshEmpty = "mesh_empty" }
    }
    /// Geometric error of a derived mesh against its source (the "report geometric error"
    /// requirement of the format brief).
    deviation {
        key: "mesh.deviation", version: 1, kind: Validator, effect: Pure,
        input { reference: Id<Mesh>, candidate: Id<Mesh>, samples: u32 }
        output { forward: Deviation, backward: Deviation }
        errors {
            MeshMissing = "mesh_missing",
            SamplesInvalid = "samples_invalid",
            MeshEmpty = "mesh_empty",
        }
    }
}
