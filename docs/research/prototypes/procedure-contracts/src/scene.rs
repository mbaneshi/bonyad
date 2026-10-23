//! Scenes: modifier stacks, transforms, animation, layered composition.
//! Sources: 3ds Max (modifier stack, node and object-offset transforms, controllers, skin,
//! clone modes), Blender depsgraph, OpenUSD composition (format brief).

use crate::prelude::*;

wire! {
    #[derive(Copy, Eq)]
    pub enum CloneMode { Copy, Instance, Reference }
}
wire! {
    /// A value read from a scene attribute.
    pub enum AttrValue {
        Bool(bool),
        Int(i64),
        Float(f64),
        Vector3(Vector3),
        Matrix(Transform3),
        Text(String),
    }
}
wire! {
    #[derive(Copy)]
    pub struct TimeSpec {
        /// Time in seconds on the document timeline. Time is not a revision.
        pub seconds: f64,
    }
}

procedures! {
    /// Evaluate a node's modifier stack: base object plus ordered pure derivations.
    evaluate_stack {
        key: "scene.evaluate_stack", version: 1, kind: Derivation, effect: ProducesNew,
        input { node: Id<SceneNode>, time: Option<TimeSpec> }
        output { evaluated: Id<Mesh>, modifiers_applied: u32, modifiers_skipped: u32 }
        errors {
            NodeMissing = "node_missing",
            ModifierFailed = "modifier_failed",
            ModifierCycle = "modifier_cycle",
        }
    }
    /// Collapse a stack into an editable base: a one-way bake that loses parametric history.
    collapse_stack {
        key: "scene.collapse_stack", version: 1, kind: Command, effect: MutatesInPlace,
        input { node: Id<SceneNode>, up_to_modifier: Option<u32>, expected: Expected }
        output { new_revision: Revision, modifiers_collapsed: u32, instance_links_broken: u32 }
        errors {
            NodeMissing = "node_missing",
            RevisionConflict = "revision_conflict",
            StackEmpty = "stack_empty",
            ModifierFailed = "modifier_failed",
        }
    }
    /// Move a node's pivot without moving its geometry in the world.
    set_pivot {
        key: "scene.set_pivot", version: 1, kind: Command, effect: MutatesInPlace,
        input { node: Id<SceneNode>, new_pivot: Point3, expected: Expected }
        output { new_revision: Revision, node_transform: Transform3, offset_transform: Transform3 }
        errors {
            NodeMissing = "node_missing",
            RevisionConflict = "revision_conflict",
            NonFiniteValue = "non_finite_value",
        }
    }
    /// World transform of a node at a time, through its parent chain.
    world_transform {
        key: "scene.world_transform", version: 1, kind: Calculation, effect: Pure,
        input { node: Id<SceneNode>, time: Option<TimeSpec> }
        output { node_transform: Transform3, object_transform: Transform3 }
        errors {
            NodeMissing = "node_missing",
            ParentCycle = "parent_cycle",
            TransformSingular = "transform_singular",
        }
    }
    /// Value of an animation controller at a time, with the interval over which it is valid.
    evaluate_controller {
        key: "scene.evaluate_controller", version: 1, kind: Calculation, effect: Pure,
        input { controller: Id<Controller>, time: TimeSpec }
        output { value: Vec<f64>, valid_for: Interval }
        errors {
            ControllerMissing = "controller_missing",
            TimeNotFinite = "time_not_finite",
            ControllerCycle = "controller_cycle",
        }
    }
    /// Deform a skinned node by its bones at a time.
    skin_deform {
        key: "scene.skin_deform", version: 1, kind: Derivation, effect: ProducesNew,
        input { node: Id<SceneNode>, time: Option<TimeSpec>, dual_quaternion: bool }
        output { deformed: Id<Mesh> }
        errors {
            NodeMissing = "node_missing",
            NotSkinned = "not_skinned",
            WeightsInvalid = "weights_invalid",
            BoneMissing = "bone_missing",
        }
    }
    /// Clone a node as a copy, an instance or a reference.
    clone_node {
        key: "scene.clone_node", version: 1, kind: Command, effect: ProducesNew,
        input { node: Id<SceneNode>, mode: CloneMode, new_name: Option<String> }
        output { clone: Id<SceneNode>, shares_base: bool, shares_modifiers: bool }
        errors {
            NodeMissing = "node_missing",
            NameTaken = "name_taken",
        }
    }
    /// Compose layers into a stage (later layers override earlier opinions).
    compose_layers {
        key: "scene.compose_layers", version: 1, kind: Derivation, effect: ProducesNew,
        input { layers: Vec<Id<Layer>>, load_payloads: bool }
        output { stage: Id<Stage>, prims: u32, unresolved_references: u32 }
        errors {
            LayerMissing = "layer_missing",
            LayerCycle = "layer_cycle",
            NoLayers = "no_layers",
        }
    }
    /// Resolve a composed attribute value at a time.
    resolve_value {
        key: "scene.resolve_value", version: 1, kind: Query, effect: Pure,
        input { stage: Id<Stage>, prim_path: String, attribute: String, time: Option<TimeSpec> }
        output { value: AttrValue, authored_in: Option<Id<Layer>> }
        errors {
            StageMissing = "stage_missing",
            PrimNotFound = "prim_not_found",
            AttributeNotFound = "attribute_not_found",
            PathInvalid = "path_invalid",
        }
    }
    /// Place a reusable definition's geometry into the world through an occurrence's placement.
    resolve_placement {
        key: "scene.resolve_placement", version: 1, kind: Calculation, effect: Pure,
        input { definition: Id<SceneNode>, occurrence: Id<SceneNode> }
        output { world: Transform3, world_bounds: Aabb3 }
        errors {
            DefinitionMissing = "definition_missing",
            OccurrenceMissing = "occurrence_missing",
            OccurrenceDoesNotReferenceDefinition = "occurrence_does_not_reference_definition",
        }
    }
}
