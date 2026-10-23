//! Project-level procedures: atomic multi-entity commits, undo, dependants, registry sync.
//! Sources: the revision contract of Bonyad's milestone 2, the criticisms of milestone 3
//! (a multi-entity `Changeset`; "what depends on this?"), SolidCraft's atomic `batch` and
//! checkpoints, FieldCraft's snapshot-and-restore wrapper.

use crate::prelude::*;

wire! {
    /// One change in a changeset: a procedure call kept as data.
    pub struct ChangeEntry {
        pub procedure: ProcedureId,
        /// Canonical JSON of that procedure's `Input`.
        pub input_json: String,
    }
}
wire! {
    pub struct Dependent {
        pub entity: EntityRef,
        /// The relation kind, one table per kind (for example `profile_on_alignment`).
        pub relation: String,
    }
}
wire! {
    pub struct RegistryMismatch {
        pub key: String,
        pub in_code: Option<u32>,
        pub in_database: Option<u32>,
    }
}

procedures! {
    /// Apply several changes to several entities atomically, checking one expected head
    /// revision. Either every change lands in one transaction or none does.
    commit_changeset {
        key: "project.commit_changeset", version: 1, kind: Command, effect: MutatesInPlace,
        input {
            project: Id<Project>,
            expected_head: Revision,
            /// Makes the commit idempotent: a replay returns the first receipt.
            request_id: uuid::Uuid,
            changes: Vec<ChangeEntry>,
        }
        output { new_head: Revision, applied: u32 }
        errors {
            ProjectMissing = "project_missing",
            RevisionConflict = "revision_conflict",
            EmptyChangeset = "empty_changeset",
            ProcedureUnknown = "procedure_unknown",
            ProcedureVersionUnsupported = "procedure_version_unsupported",
            ChangeRejected = "change_rejected",
            InputMalformed = "input_malformed",
        }
    }
    /// Undo the last accepted changeset.
    undo {
        key: "project.undo", version: 1, kind: Command, effect: MutatesInPlace,
        input { project: Id<Project>, expected_head: Revision }
        output { new_head: Revision, reverted: u32 }
        errors {
            ProjectMissing = "project_missing",
            RevisionConflict = "revision_conflict",
            NothingToUndo = "nothing_to_undo",
        }
    }
    /// Redo the last undone changeset.
    redo {
        key: "project.redo", version: 1, kind: Command, effect: MutatesInPlace,
        input { project: Id<Project>, expected_head: Revision }
        output { new_head: Revision, reapplied: u32 }
        errors {
            ProjectMissing = "project_missing",
            RevisionConflict = "revision_conflict",
            NothingToRedo = "nothing_to_redo",
        }
    }
    /// What depends on this entity? Typed relations, one kind per meaning.
    dependents {
        key: "project.dependents", version: 1, kind: Query, effect: Pure,
        input { entity: EntityRef }
        output { dependents: Vec<Dependent> }
        errors { EntityMissing = "entity_missing" }
    }
    /// Compare the procedures registered in the database with those compiled into the
    /// server. A row naming an implementation that does not exist must stop the server.
    verify_registry {
        key: "project.verify_registry", version: 1, kind: Query, effect: Pure,
        input {}
        output {
            registered: u32,
            missing_in_code: Vec<RegistryMismatch>,
            missing_in_database: Vec<RegistryMismatch>,
            version_mismatches: Vec<RegistryMismatch>,
        }
        errors { DatabaseUnreachable = "database_unreachable" }
    }
}
