//! Building information: elements, types, rooms, phases, worksets, queries.
//! Sources: the Revit study (API behaviour) cross-checked against IfcOpenShell's API modules.

use crate::prelude::*;

wire! {
    pub struct Placement {
        pub origin: Point3,
        /// Radians about +z.
        pub rotation: f64,
        pub host: Option<Id<Element>>,
        pub level: Option<Id<Level>>,
    }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum ParamScope { Instance, Type }
}
wire! {
    pub enum ParamValue { Number(f64), Integer(i64), Text(String), Bool(bool), Reference(EntityRef) }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum BoundaryLocation { Finish, Centre, CoreLayer, CoreCentre }
}
wire! {
    pub struct RoomSettings { pub boundary_location: BoundaryLocation, pub computation_height: f64 }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum QuantityKind { Length, Area, Volume, Count }
}
wire! {
    pub enum ElementFilter {
        OfType(Id<ElementType>),
        OnLevel(Id<Level>),
        InPhase(Id<Phase>),
        InWorkset(Id<Workset>),
        ParameterEquals { name: String, value: ParamValue },
        /// Only elements (not types) when true.
        ElementsOnly(bool),
    }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum ExternalSource { Revit, Ifc, Dxf, Landxml, Fbx, Usd, Gltf, Datasmith }
}
wire! {
    pub struct ExternalId {
        pub source: ExternalSource,
        /// `UniqueId`, `GlobalId`, handle, name or path as the source defines it.
        pub value: String,
    }
}
wire! {
    pub struct QuantityLine { pub element: Id<Element>, pub value: f64 }
}
wire! {
    pub struct ConstraintViolation { pub element: Id<Element>, pub rule: String, pub message: String }
}

procedures! {
    /// Place an occurrence of a type.
    place_instance {
        key: "bim.place_instance", version: 1, kind: Command, effect: ProducesNew,
        input { element_type: Id<ElementType>, placement: Placement, expected: Expected }
        output { element: Id<Element>, new_revision: Revision, nested_created: u32 }
        errors {
            TypeMissing = "type_missing",
            RevisionConflict = "revision_conflict",
            HostRequired = "host_required",
            HostMissing = "host_missing",
            LevelMissing = "level_missing",
            WrongOverloadForCategory = "wrong_overload_for_category",
        }
    }
    /// Change the type of an element. Parameters inherited from the type are re-resolved.
    change_type {
        key: "bim.change_type", version: 1, kind: Command, effect: MutatesInPlace,
        input { element: Id<Element>, new_type: Id<ElementType>, expected: Expected }
        output { new_revision: Revision, parameters_changed: u32 }
        errors {
            ElementMissing = "element_missing",
            TypeMissing = "type_missing",
            RevisionConflict = "revision_conflict",
            TypeCategoryMismatch = "type_category_mismatch",
        }
    }
    /// Set a parameter on an instance or a type. Dependants are recomputed by `regenerate`.
    set_parameter {
        key: "bim.set_parameter", version: 1, kind: Command, effect: MutatesInPlace,
        input {
            element: Id<Element>,
            name: String,
            value: ParamValue,
            scope: ParamScope,
            expected: Expected,
        }
        output { new_revision: Revision, dependants: Vec<EntityRef> }
        errors {
            ElementMissing = "element_missing",
            RevisionConflict = "revision_conflict",
            ParameterMissing = "parameter_missing",
            ParameterReadOnly = "parameter_read_only",
            ValueTypeMismatch = "value_type_mismatch",
            NotOwned = "not_owned",
        }
    }
    /// Recompute derived values (geometry, joins, room boundaries) from stored parameters.
    regenerate {
        key: "bim.regenerate", version: 1, kind: Derivation, effect: MutatesInPlace,
        input { elements: Option<Vec<Id<Element>>> }
        output { regenerated: Vec<Id<Element>>, failed: Vec<Id<Element>> }
        errors {
            ElementMissing = "element_missing",
            RegenerationFailed = "regeneration_failed",
            CircularDependency = "circular_dependency",
        }
    }
    /// Create a wall along a path on a level.
    create_wall {
        key: "bim.create_wall", version: 1, kind: Command, effect: ProducesNew,
        input {
            path: Vec<Point2>,
            level: Id<Level>,
            wall_type: Id<ElementType>,
            height: f64,
            expected: Expected,
        }
        output { wall: Id<Element>, new_revision: Revision, joins_created: u32 }
        errors {
            LevelMissing = "level_missing",
            TypeMissing = "type_missing",
            RevisionConflict = "revision_conflict",
            PathTooShort = "path_too_short",
            HeightNotPositive = "height_not_positive",
            ZeroLengthSegment = "zero_length_segment",
        }
    }
    /// Join the geometry of two elements that share a face.
    join_geometry {
        key: "bim.join_geometry", version: 1, kind: Command, effect: MutatesInPlace,
        input { a: Id<Element>, b: Id<Element>, expected: Expected }
        output { new_revision: Revision }
        errors {
            ElementMissing = "element_missing",
            RevisionConflict = "revision_conflict",
            NoSharedFace = "no_shared_face",
            AlreadyJoined = "already_joined",
        }
    }
    /// Compute a room's area, perimeter, volume and boundary loops.
    room_compute {
        key: "bim.room_compute", version: 1, kind: Calculation, effect: Pure,
        input { room: Id<Room>, settings: RoomSettings }
        output {
            area: f64,
            perimeter: f64,
            volume: Option<f64>,
            loops: Vec<Ring2>,
        }
        errors {
            RoomMissing = "room_missing",
            RoomNotEnclosed = "room_not_enclosed",
            RoomNotPlaced = "room_not_placed",
            SettingsInvalid = "settings_invalid",
        }
    }
    /// Create a room at a point on a level.
    room_create {
        key: "bim.room_create", version: 1, kind: Command, effect: ProducesNew,
        input { level: Id<Level>, point: Point2, name: Option<String>, expected: Expected }
        output { room: Id<Room>, new_revision: Revision }
        errors {
            LevelMissing = "level_missing",
            RevisionConflict = "revision_conflict",
            PointNotInEnclosure = "point_not_in_enclosure",
        }
    }
    /// Quantity take-off over a set of elements.
    quantity_takeoff {
        key: "bim.quantity_takeoff", version: 1, kind: Calculation, effect: Pure,
        input { elements: Vec<Id<Element>>, quantity: QuantityKind }
        output { total: f64, lines: Vec<QuantityLine> }
        errors {
            ElementMissing = "element_missing",
            QuantityNotAvailable = "quantity_not_available",
            NoElements = "no_elements",
        }
    }
    /// Set when elements are created and demolished.
    set_phase {
        key: "bim.set_phase", version: 1, kind: Command, effect: MutatesInPlace,
        input {
            elements: Vec<Id<Element>>,
            created: Option<Id<Phase>>,
            demolished: Option<Id<Phase>>,
            expected: Expected,
        }
        output { new_revision: Revision }
        errors {
            ElementMissing = "element_missing",
            PhaseMissing = "phase_missing",
            RevisionConflict = "revision_conflict",
            PhasesNotModifiable = "phases_not_modifiable",
            DemolishedBeforeCreated = "demolished_before_created",
        }
    }
    /// Activate a design option; queries then see only the active option's elements.
    activate_design_option {
        key: "bim.activate_design_option", version: 1, kind: Command, effect: MutatesInPlace,
        input { option: Option<Id<DesignOption>>, expected: Expected }
        output { new_revision: Revision }
        errors { OptionMissing = "option_missing", RevisionConflict = "revision_conflict" }
    }
    /// Take ownership of elements in a workshared model.
    workset_checkout {
        key: "bim.workset_checkout", version: 1, kind: Command, effect: MutatesInPlace,
        input { elements: Vec<Id<Element>>, worksets: Vec<Id<Workset>> }
        output { owned: Vec<Id<Element>>, not_granted: Vec<Id<Element>> }
        errors {
            ElementMissing = "element_missing",
            WorksetMissing = "workset_missing",
            RequestTooLarge = "request_too_large",
            UpdatedInCentral = "updated_in_central",
            DeletedInCentral = "deleted_in_central",
        }
    }
    /// Give up ownership.
    workset_relinquish {
        key: "bim.workset_relinquish", version: 1, kind: Command, effect: MutatesInPlace,
        input { elements: Vec<Id<Element>> }
        output { released: u32 }
        errors { ElementMissing = "element_missing", NotOwned = "not_owned" }
    }
    /// Find elements by a filter (a query, never a mutation).
    query_elements {
        key: "bim.query_elements", version: 1, kind: Query, effect: Pure,
        input { filters: Vec<ElementFilter>, limit: Option<u32> }
        output { elements: Vec<Id<Element>>, truncated: bool }
        errors { FilterInvalid = "filter_invalid", NoFilters = "no_filters" }
    }
    /// Put elements in a spatial container (a building, storey or space).
    assign_container {
        key: "bim.assign_container", version: 1, kind: Command, effect: MutatesInPlace,
        input { elements: Vec<Id<Element>>, container: Id<Element>, expected: Expected }
        output { new_revision: Revision }
        errors {
            ElementMissing = "element_missing",
            ContainerMissing = "container_missing",
            RevisionConflict = "revision_conflict",
            ContainerCycle = "container_cycle",
        }
    }
    /// Check rule-based constraints on elements. Flags mismatches; does not enforce them.
    check_constraints {
        key: "bim.check_constraints", version: 1, kind: Validator, effect: Pure,
        input { elements: Vec<Id<Element>>, rules: Vec<String> }
        output { violations: Vec<ConstraintViolation>, checked: u32 }
        errors { ElementMissing = "element_missing", RuleUnknown = "rule_unknown" }
    }
    /// Map an external identifier to a stable internal id. Identity in the model is never an
    /// external id, a path or an index.
    map_external_id {
        key: "bim.map_external_id", version: 1, kind: Query, effect: Pure,
        input { external: ExternalId }
        output { element: Option<Id<Element>>, ambiguous: bool }
        errors { SourceUnsupported = "source_unsupported", IdMalformed = "id_malformed" }
    }
}
