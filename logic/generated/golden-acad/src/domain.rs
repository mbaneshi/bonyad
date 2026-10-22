//! Pure domain types for the `acad` catalogue: units as newtypes, no database dependency.
//!
//! Each struct holds the type's OWN fields. A type with a `base` keeps the base fields in the base
//! type's struct (see the row types in `rows`).

/// Common entity fields: Fields every AutoCAD graphic entity shares (the DXF common group codes), stored once. (`acad.graphic_entity`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct GraphicEntity {
    /// The block (or layout) that contains this entity
    pub owner_block_id: ::uuid::Uuid,
    /// The layer the entity is on
    pub layer_id: ::uuid::Uuid,
    /// Explicit linetype; null means BYLAYER
    pub linetype_id: ::core::option::Option<::uuid::Uuid>,
    /// AutoCAD colour index; null means BYLAYER
    pub color: ::core::option::Option<i32>,
    /// 24-bit RGB colour
    pub true_color: ::core::option::Option<i32>,
    /// Lineweight in hundredths of a millimetre
    pub lineweight: ::core::option::Option<i32>,
    /// Linetype scale factor of this entity
    pub linetype_scale: f64,
    /// Whether the entity is shown
    pub visible: bool,
    /// Transparency in percent
    pub transparency: ::core::option::Option<i32>,
    /// The DXF handle; file-scoped, kept as a mapping column only
    pub dxf_handle: ::core::option::Option<::std::string::String>,
}

/// ARC: A circular arc, counter-clockwise from start angle to end angle. (`acad.arc`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct Arc {
    /// Centre point
    pub center: bonyad_units::Point3,
    /// Radius
    pub radius: bonyad_units::Length,
    /// Start angle (radians; DXF stores degrees)
    pub start_angle: bonyad_units::Angle,
    /// End angle (radians; DXF stores degrees)
    pub end_angle: bonyad_units::Angle,
    /// Extrusion thickness along the normal
    pub thickness: bonyad_units::Length,
    /// Extrusion direction
    pub normal: bonyad_units::Vector3,
}

/// BLOCK_RECORD: A block definition; model space and paper space are blocks too. (`acad.block_record`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct BlockRecord {
    /// Block name
    pub name: ::std::string::String,
    /// True when the block is a layout (model or paper space)
    pub is_layout: bool,
    /// DXF INSUNITS code of this block
    pub insertion_units: ::core::option::Option<i32>,
    /// Base point of the block
    pub base: bonyad_units::Point3,
}

/// CIRCLE: A circle given by centre and radius. (`acad.circle`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct Circle {
    /// Centre point
    pub center: bonyad_units::Point3,
    /// Radius
    pub radius: bonyad_units::Length,
    /// Extrusion thickness along the normal
    pub thickness: bonyad_units::Length,
    /// Extrusion direction
    pub normal: bonyad_units::Vector3,
}

/// 3DFACE: A planar or non-planar face of three or four corners. (`acad.face3d`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct Face3d {
    /// First corner
    pub c1: bonyad_units::Point3,
    /// Second corner
    pub c2: bonyad_units::Point3,
    /// Third corner
    pub c3: bonyad_units::Point3,
    /// Fourth corner (equal to the third for a triangle)
    pub c4: bonyad_units::Point3,
    /// Bit flags that make an edge invisible
    pub edge_flags: i32,
}

/// INSERT: One placement of a block definition, optionally as a rectangular array. (`acad.insert`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct Insert {
    /// The block definition being placed
    pub block_id: ::uuid::Uuid,
    /// Insertion point
    pub ins: bonyad_units::Point3,
    /// Scale factors along x, y and z
    pub scale: bonyad_units::Vector3,
    /// Rotation about the insertion point (radians; DXF stores degrees)
    pub rotation: bonyad_units::Angle,
    /// Number of columns of the array
    pub column_count: i32,
    /// Number of rows of the array
    pub row_count: i32,
    /// Distance between columns
    pub column_spacing: ::core::option::Option<bonyad_units::Length>,
    /// Distance between rows
    pub row_spacing: ::core::option::Option<bonyad_units::Length>,
}

/// LAYER: A named layer that groups entities and carries default colour, linetype and visibility. (`acad.layer`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct Layer {
    /// Layer name
    pub name: ::std::string::String,
    /// AutoCAD colour index
    pub color: ::core::option::Option<i32>,
    /// Default linetype of the layer
    pub linetype_id: ::core::option::Option<::uuid::Uuid>,
    /// Default lineweight in hundredths of a millimetre
    pub lineweight: ::core::option::Option<i32>,
    /// Layer is switched off
    pub is_off: bool,
    /// Layer is frozen
    pub is_frozen: bool,
    /// Layer is locked
    pub is_locked: bool,
    /// Layer is plotted
    pub plot: bool,
}

/// LINE: A straight segment between two 3D points. (`acad.line`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct Line {
    /// Start point
    pub start: bonyad_units::Point3,
    /// End point
    pub end: bonyad_units::Point3,
    /// Extrusion thickness along the normal
    pub thickness: bonyad_units::Length,
    /// Extrusion direction
    pub normal: bonyad_units::Vector3,
}

/// LTYPE: A linetype definition (dash pattern) that layers and entities refer to. (`acad.linetype`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct Linetype {
    /// Linetype name
    pub name: ::std::string::String,
    /// Descriptive text of the pattern
    pub description: ::core::option::Option<::std::string::String>,
    /// Total length of one pattern repeat
    pub pattern_length: ::core::option::Option<bonyad_units::Length>,
}

/// LWPOLYLINE: A 2D polyline; its vertices carry a bulge for arc segments. (`acad.lwpolyline`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct Lwpolyline {
    /// Z level of the polyline plane
    pub elevation: bonyad_units::Length,
    /// True when the last vertex connects back to the first
    pub closed: bool,
    /// Width used for every segment when set
    pub constant_width: ::core::option::Option<bonyad_units::Length>,
    /// Extrusion thickness along the normal
    pub thickness: bonyad_units::Length,
    /// Extrusion direction
    pub normal: bonyad_units::Vector3,
}

/// LWPOLYLINE vertex: One ordered vertex of an LWPOLYLINE. (`acad.lwpolyline_vertex`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct LwpolylineVertex {
    /// X coordinate
    pub x: bonyad_units::Length,
    /// Y coordinate
    pub y: bonyad_units::Length,
    /// Width at the start of the segment
    pub start_width: ::core::option::Option<bonyad_units::Length>,
    /// Width at the end of the segment
    pub end_width: ::core::option::Option<bonyad_units::Length>,
    /// Bulge of the segment to the next vertex (tan of a quarter of the arc angle; 0 is straight)
    pub bulge: f64,
}

/// MESH: A subdivision mesh; vertices and faces are child rows. (`acad.mesh`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct Mesh {
    /// Subdivision level
    pub subdivision_level: i32,
}

/// MESH face: One ordered face of a MESH, as indices into the vertices. (`acad.mesh_face`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct MeshFace {
    /// Zero-based positions of the face's vertices in mesh_vertex
    pub vertex_indices: ::std::vec::Vec<i32>,
}

/// MESH vertex: One ordered vertex of a MESH. (`acad.mesh_vertex`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct MeshVertex {
    /// X coordinate
    pub x: bonyad_units::Length,
    /// Y coordinate
    pub y: bonyad_units::Length,
    /// Z coordinate
    pub z: bonyad_units::Length,
}

/// POINT: A single point. (`acad.point`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct Point {
    /// X coordinate
    pub x: bonyad_units::Length,
    /// Y coordinate
    pub y: bonyad_units::Length,
    /// Z coordinate
    pub z: bonyad_units::Length,
    /// Extrusion thickness along the normal
    pub thickness: bonyad_units::Length,
}

/// TEXT: A single line of text. (`acad.text`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct Text {
    /// Insertion point
    pub insert: bonyad_units::Point3,
    /// Text height
    pub height: bonyad_units::Length,
    /// The text
    pub value: ::std::string::String,
    /// Rotation (radians; DXF stores degrees)
    pub rotation: bonyad_units::Angle,
    /// Relative x scale
    pub width_factor: f64,
    /// Oblique angle (radians; DXF stores degrees)
    pub oblique_angle: bonyad_units::Angle,
    /// Name of the text style
    pub style_name: ::core::option::Option<::std::string::String>,
    /// Horizontal justification code
    pub horizontal_alignment: i32,
    /// Vertical justification code
    pub vertical_alignment: i32,
}
