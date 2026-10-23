//! File adapters. A file adapter maps an external representation to and from the model; it
//! is not the model. Every adapter returns a loss report: what was preserved, changed, lost.
//! Sources: format brief, SolidCraft STEP import and export, FieldCraft deck export, the
//! DXF / IFC / LandXML / GeoPackage / FBX / USD / glTF / Datasmith corpus.

use crate::prelude::*;

wire! {
    #[derive(Copy, Eq)]
    pub enum FileFormat {
        Step,
        Iges,
        ThreeMf,
        Stl,
        Obj,
        Gltf,
        Ply,
        Dxf,
        Ifc,
        LandXml,
        GeoPackage,
        Fbx,
        Usd,
        Datasmith,
    }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum UpAxis { Y, Z }
}
wire! {
    #[derive(Copy, Eq)]
    pub enum NamePolicy { Auto, Solid, Product, Instance }
}
wire! {
    pub struct ImportOptions {
        pub up_axis: Option<UpAxis>,
        /// Stated explicitly when the file's unit is missing or ambiguous; otherwise the
        /// import is rejected rather than guessed.
        pub unit_override: Option<LengthUnit>,
        pub names: NamePolicy,
        pub heal_tolerance: Option<f64>,
    }
}
wire! {
    pub struct ImportedEntity {
        pub entity: EntityRef,
        /// The identifier inside the file (handle, GlobalId, name). Never used as identity.
        pub external_id: String,
    }
}

procedures! {
    /// Read a file and propose the entities it describes. The adapter does not decide the
    /// model; it reports what it found and what it could not keep.
    import_file {
        key: "io.import_file", version: 1, kind: External, effect: ReadsExternal,
        input {
            path: String,
            format: FileFormat,
            options: ImportOptions,
            /// SHA-256 the caller expects, if the file is pinned.
            expected_sha256: Option<String>,
        }
        output {
            created: Vec<ImportedEntity>,
            loss: LossReport,
            file_sha256: String,
            unknown_extensions: u32,
        }
        errors {
            PathNotAllowed = "path_not_allowed",
            FileNotFound = "file_not_found",
            HashMismatch = "hash_mismatch",
            FormatUnsupported = "format_unsupported",
            FileMalformed = "file_malformed",
            UnitAmbiguous = "unit_ambiguous",
            FrameAmbiguous = "frame_ambiguous",
            MissingReference = "missing_reference",
        }
    }
    /// Write entities to a file.
    export_file {
        key: "io.export_file", version: 1, kind: External, effect: WritesExternal,
        input {
            entities: Vec<EntityRef>,
            format: FileFormat,
            path: String,
            overwrite: bool,
        }
        output { bytes: u64, sha256: String, loss: LossReport }
        errors {
            PathNotAllowed = "path_not_allowed",
            FileExists = "file_exists",
            FormatUnsupported = "format_unsupported",
            EntityNotExportable = "entity_not_exportable",
            NothingToExport = "nothing_to_export",
        }
    }
    /// Check an import against a re-import: does the file survive a round trip, and what
    /// changed? It reads the file, so it is an adapter run (External), not a pure validator;
    /// its report can be fed to a validator.
    round_trip_check {
        key: "io.round_trip_check", version: 1, kind: External, effect: ReadsExternal,
        input { path: String, format: FileFormat, options: ImportOptions }
        output { identical: bool, loss: LossReport, changed_entities: Vec<EntityRef> }
        errors {
            PathNotAllowed = "path_not_allowed",
            FileNotFound = "file_not_found",
            FormatUnsupported = "format_unsupported",
            FileMalformed = "file_malformed",
        }
    }
}
