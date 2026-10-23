//! Row types for the `acad` tables (sqlx::FromRow) and their conversions to the domain types.
//!
//! Key columns come first. `into_row` takes the key values a domain value does not carry.

/// One row of `acad.graphic_entity`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct GraphicEntityRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub type_code: ::std::string::String,
    pub owner_block_id: ::uuid::Uuid,
    pub layer_id: ::uuid::Uuid,
    pub linetype_id: ::core::option::Option<::uuid::Uuid>,
    pub color: ::core::option::Option<i32>,
    pub true_color: ::core::option::Option<i32>,
    pub lineweight: ::core::option::Option<i32>,
    pub linetype_scale: f64,
    pub visible: bool,
    pub transparency: ::core::option::Option<i32>,
    pub dxf_handle: ::core::option::Option<::std::string::String>,
}

impl ::core::convert::From<GraphicEntityRow> for crate::domain::GraphicEntity {
    fn from(row: GraphicEntityRow) -> Self {
        Self {
            owner_block_id: row.owner_block_id,
            layer_id: row.layer_id,
            linetype_id: row.linetype_id,
            color: row.color,
            true_color: row.true_color,
            lineweight: row.lineweight,
            linetype_scale: row.linetype_scale,
            visible: row.visible,
            transparency: row.transparency,
            dxf_handle: row.dxf_handle,
        }
    }
}

impl crate::domain::GraphicEntity {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(
        self,
        entity_id: ::uuid::Uuid,
        revision_id: i64,
        type_code: impl ::core::convert::Into<::std::string::String>,
    ) -> GraphicEntityRow {
        GraphicEntityRow {
            entity_id,
            revision_id,
            type_code: type_code.into(),
            owner_block_id: self.owner_block_id,
            layer_id: self.layer_id,
            linetype_id: self.linetype_id,
            color: self.color,
            true_color: self.true_color,
            lineweight: self.lineweight,
            linetype_scale: self.linetype_scale,
            visible: self.visible,
            transparency: self.transparency,
            dxf_handle: self.dxf_handle,
        }
    }
}

/// One row of `acad.arc`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct ArcRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub kind: ::std::string::String,
    pub center_x: f64,
    pub center_y: f64,
    pub center_z: f64,
    pub radius: f64,
    pub start_angle: f64,
    pub end_angle: f64,
    pub thickness: f64,
    pub normal_x: f64,
    pub normal_y: f64,
    pub normal_z: f64,
}

impl ::core::convert::From<ArcRow> for crate::domain::Arc {
    fn from(row: ArcRow) -> Self {
        Self {
            center: bonyad_units::Point3 {
                x: bonyad_units::Length(row.center_x),
                y: bonyad_units::Length(row.center_y),
                z: bonyad_units::Length(row.center_z),
            },
            radius: bonyad_units::Length(row.radius),
            start_angle: bonyad_units::Angle(row.start_angle),
            end_angle: bonyad_units::Angle(row.end_angle),
            thickness: bonyad_units::Length(row.thickness),
            normal: bonyad_units::Vector3 {
                x: row.normal_x,
                y: row.normal_y,
                z: row.normal_z,
            },
        }
    }
}

impl crate::domain::Arc {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64) -> ArcRow {
        ArcRow {
            entity_id,
            revision_id,
            kind: "acad.arc".to_owned(),
            center_x: self.center.x.0,
            center_y: self.center.y.0,
            center_z: self.center.z.0,
            radius: self.radius.0,
            start_angle: self.start_angle.0,
            end_angle: self.end_angle.0,
            thickness: self.thickness.0,
            normal_x: self.normal.x,
            normal_y: self.normal.y,
            normal_z: self.normal.z,
        }
    }
}

/// One row of `acad.block_record`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct BlockRecordRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub kind: ::std::string::String,
    pub name: ::std::string::String,
    pub is_layout: bool,
    pub insertion_units: ::core::option::Option<i32>,
    pub base_x: f64,
    pub base_y: f64,
    pub base_z: f64,
}

impl ::core::convert::From<BlockRecordRow> for crate::domain::BlockRecord {
    fn from(row: BlockRecordRow) -> Self {
        Self {
            name: row.name,
            is_layout: row.is_layout,
            insertion_units: row.insertion_units,
            base: bonyad_units::Point3 {
                x: bonyad_units::Length(row.base_x),
                y: bonyad_units::Length(row.base_y),
                z: bonyad_units::Length(row.base_z),
            },
        }
    }
}

impl crate::domain::BlockRecord {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64) -> BlockRecordRow {
        BlockRecordRow {
            entity_id,
            revision_id,
            kind: "acad.block_record".to_owned(),
            name: self.name,
            is_layout: self.is_layout,
            insertion_units: self.insertion_units,
            base_x: self.base.x.0,
            base_y: self.base.y.0,
            base_z: self.base.z.0,
        }
    }
}

/// One row of `acad.circle`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct CircleRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub kind: ::std::string::String,
    pub center_x: f64,
    pub center_y: f64,
    pub center_z: f64,
    pub radius: f64,
    pub thickness: f64,
    pub normal_x: f64,
    pub normal_y: f64,
    pub normal_z: f64,
}

impl ::core::convert::From<CircleRow> for crate::domain::Circle {
    fn from(row: CircleRow) -> Self {
        Self {
            center: bonyad_units::Point3 {
                x: bonyad_units::Length(row.center_x),
                y: bonyad_units::Length(row.center_y),
                z: bonyad_units::Length(row.center_z),
            },
            radius: bonyad_units::Length(row.radius),
            thickness: bonyad_units::Length(row.thickness),
            normal: bonyad_units::Vector3 {
                x: row.normal_x,
                y: row.normal_y,
                z: row.normal_z,
            },
        }
    }
}

impl crate::domain::Circle {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64) -> CircleRow {
        CircleRow {
            entity_id,
            revision_id,
            kind: "acad.circle".to_owned(),
            center_x: self.center.x.0,
            center_y: self.center.y.0,
            center_z: self.center.z.0,
            radius: self.radius.0,
            thickness: self.thickness.0,
            normal_x: self.normal.x,
            normal_y: self.normal.y,
            normal_z: self.normal.z,
        }
    }
}

/// One row of `acad.face3d`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct Face3dRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub kind: ::std::string::String,
    pub c1_x: f64,
    pub c1_y: f64,
    pub c1_z: f64,
    pub c2_x: f64,
    pub c2_y: f64,
    pub c2_z: f64,
    pub c3_x: f64,
    pub c3_y: f64,
    pub c3_z: f64,
    pub c4_x: f64,
    pub c4_y: f64,
    pub c4_z: f64,
    pub edge_flags: i32,
}

impl ::core::convert::From<Face3dRow> for crate::domain::Face3d {
    fn from(row: Face3dRow) -> Self {
        Self {
            c1: bonyad_units::Point3 {
                x: bonyad_units::Length(row.c1_x),
                y: bonyad_units::Length(row.c1_y),
                z: bonyad_units::Length(row.c1_z),
            },
            c2: bonyad_units::Point3 {
                x: bonyad_units::Length(row.c2_x),
                y: bonyad_units::Length(row.c2_y),
                z: bonyad_units::Length(row.c2_z),
            },
            c3: bonyad_units::Point3 {
                x: bonyad_units::Length(row.c3_x),
                y: bonyad_units::Length(row.c3_y),
                z: bonyad_units::Length(row.c3_z),
            },
            c4: bonyad_units::Point3 {
                x: bonyad_units::Length(row.c4_x),
                y: bonyad_units::Length(row.c4_y),
                z: bonyad_units::Length(row.c4_z),
            },
            edge_flags: row.edge_flags,
        }
    }
}

impl crate::domain::Face3d {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64) -> Face3dRow {
        Face3dRow {
            entity_id,
            revision_id,
            kind: "acad.face3d".to_owned(),
            c1_x: self.c1.x.0,
            c1_y: self.c1.y.0,
            c1_z: self.c1.z.0,
            c2_x: self.c2.x.0,
            c2_y: self.c2.y.0,
            c2_z: self.c2.z.0,
            c3_x: self.c3.x.0,
            c3_y: self.c3.y.0,
            c3_z: self.c3.z.0,
            c4_x: self.c4.x.0,
            c4_y: self.c4.y.0,
            c4_z: self.c4.z.0,
            edge_flags: self.edge_flags,
        }
    }
}

/// One row of `acad.insert`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct InsertRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub kind: ::std::string::String,
    pub block_id: ::uuid::Uuid,
    pub ins_x: f64,
    pub ins_y: f64,
    pub ins_z: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub scale_z: f64,
    pub rotation: f64,
    pub column_count: i32,
    pub row_count: i32,
    pub column_spacing: ::core::option::Option<f64>,
    pub row_spacing: ::core::option::Option<f64>,
}

impl ::core::convert::From<InsertRow> for crate::domain::Insert {
    fn from(row: InsertRow) -> Self {
        Self {
            block_id: row.block_id,
            ins: bonyad_units::Point3 {
                x: bonyad_units::Length(row.ins_x),
                y: bonyad_units::Length(row.ins_y),
                z: bonyad_units::Length(row.ins_z),
            },
            scale: bonyad_units::Vector3 {
                x: row.scale_x,
                y: row.scale_y,
                z: row.scale_z,
            },
            rotation: bonyad_units::Angle(row.rotation),
            column_count: row.column_count,
            row_count: row.row_count,
            column_spacing: row.column_spacing.map(bonyad_units::Length),
            row_spacing: row.row_spacing.map(bonyad_units::Length),
        }
    }
}

impl crate::domain::Insert {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64) -> InsertRow {
        InsertRow {
            entity_id,
            revision_id,
            kind: "acad.insert".to_owned(),
            block_id: self.block_id,
            ins_x: self.ins.x.0,
            ins_y: self.ins.y.0,
            ins_z: self.ins.z.0,
            scale_x: self.scale.x,
            scale_y: self.scale.y,
            scale_z: self.scale.z,
            rotation: self.rotation.0,
            column_count: self.column_count,
            row_count: self.row_count,
            column_spacing: self.column_spacing.map(|v| v.0),
            row_spacing: self.row_spacing.map(|v| v.0),
        }
    }
}

/// One row of `acad.layer`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct LayerRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub kind: ::std::string::String,
    pub name: ::std::string::String,
    pub color: ::core::option::Option<i32>,
    pub linetype_id: ::core::option::Option<::uuid::Uuid>,
    pub lineweight: ::core::option::Option<i32>,
    pub is_off: bool,
    pub is_frozen: bool,
    pub is_locked: bool,
    pub plot: bool,
}

impl ::core::convert::From<LayerRow> for crate::domain::Layer {
    fn from(row: LayerRow) -> Self {
        Self {
            name: row.name,
            color: row.color,
            linetype_id: row.linetype_id,
            lineweight: row.lineweight,
            is_off: row.is_off,
            is_frozen: row.is_frozen,
            is_locked: row.is_locked,
            plot: row.plot,
        }
    }
}

impl crate::domain::Layer {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64) -> LayerRow {
        LayerRow {
            entity_id,
            revision_id,
            kind: "acad.layer".to_owned(),
            name: self.name,
            color: self.color,
            linetype_id: self.linetype_id,
            lineweight: self.lineweight,
            is_off: self.is_off,
            is_frozen: self.is_frozen,
            is_locked: self.is_locked,
            plot: self.plot,
        }
    }
}

/// One row of `acad.line`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct LineRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub kind: ::std::string::String,
    pub start_x: f64,
    pub start_y: f64,
    pub start_z: f64,
    pub end_x: f64,
    pub end_y: f64,
    pub end_z: f64,
    pub thickness: f64,
    pub normal_x: f64,
    pub normal_y: f64,
    pub normal_z: f64,
}

impl ::core::convert::From<LineRow> for crate::domain::Line {
    fn from(row: LineRow) -> Self {
        Self {
            start: bonyad_units::Point3 {
                x: bonyad_units::Length(row.start_x),
                y: bonyad_units::Length(row.start_y),
                z: bonyad_units::Length(row.start_z),
            },
            end: bonyad_units::Point3 {
                x: bonyad_units::Length(row.end_x),
                y: bonyad_units::Length(row.end_y),
                z: bonyad_units::Length(row.end_z),
            },
            thickness: bonyad_units::Length(row.thickness),
            normal: bonyad_units::Vector3 {
                x: row.normal_x,
                y: row.normal_y,
                z: row.normal_z,
            },
        }
    }
}

impl crate::domain::Line {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64) -> LineRow {
        LineRow {
            entity_id,
            revision_id,
            kind: "acad.line".to_owned(),
            start_x: self.start.x.0,
            start_y: self.start.y.0,
            start_z: self.start.z.0,
            end_x: self.end.x.0,
            end_y: self.end.y.0,
            end_z: self.end.z.0,
            thickness: self.thickness.0,
            normal_x: self.normal.x,
            normal_y: self.normal.y,
            normal_z: self.normal.z,
        }
    }
}

/// One row of `acad.linetype`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct LinetypeRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub kind: ::std::string::String,
    pub name: ::std::string::String,
    pub description: ::core::option::Option<::std::string::String>,
    pub pattern_length: ::core::option::Option<f64>,
}

impl ::core::convert::From<LinetypeRow> for crate::domain::Linetype {
    fn from(row: LinetypeRow) -> Self {
        Self {
            name: row.name,
            description: row.description,
            pattern_length: row.pattern_length.map(bonyad_units::Length),
        }
    }
}

impl crate::domain::Linetype {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64) -> LinetypeRow {
        LinetypeRow {
            entity_id,
            revision_id,
            kind: "acad.linetype".to_owned(),
            name: self.name,
            description: self.description,
            pattern_length: self.pattern_length.map(|v| v.0),
        }
    }
}

/// One row of `acad.lwpolyline`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct LwpolylineRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub kind: ::std::string::String,
    pub elevation: f64,
    pub closed: bool,
    pub constant_width: ::core::option::Option<f64>,
    pub thickness: f64,
    pub normal_x: f64,
    pub normal_y: f64,
    pub normal_z: f64,
}

impl ::core::convert::From<LwpolylineRow> for crate::domain::Lwpolyline {
    fn from(row: LwpolylineRow) -> Self {
        Self {
            elevation: bonyad_units::Length(row.elevation),
            closed: row.closed,
            constant_width: row.constant_width.map(bonyad_units::Length),
            thickness: bonyad_units::Length(row.thickness),
            normal: bonyad_units::Vector3 {
                x: row.normal_x,
                y: row.normal_y,
                z: row.normal_z,
            },
        }
    }
}

impl crate::domain::Lwpolyline {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64) -> LwpolylineRow {
        LwpolylineRow {
            entity_id,
            revision_id,
            kind: "acad.lwpolyline".to_owned(),
            elevation: self.elevation.0,
            closed: self.closed,
            constant_width: self.constant_width.map(|v| v.0),
            thickness: self.thickness.0,
            normal_x: self.normal.x,
            normal_y: self.normal.y,
            normal_z: self.normal.z,
        }
    }
}

/// One row of `acad.lwpolyline_vertex`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct LwpolylineVertexRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub position: i32,
    pub x: f64,
    pub y: f64,
    pub start_width: ::core::option::Option<f64>,
    pub end_width: ::core::option::Option<f64>,
    pub bulge: f64,
}

impl ::core::convert::From<LwpolylineVertexRow> for crate::domain::LwpolylineVertex {
    fn from(row: LwpolylineVertexRow) -> Self {
        Self {
            x: bonyad_units::Length(row.x),
            y: bonyad_units::Length(row.y),
            start_width: row.start_width.map(bonyad_units::Length),
            end_width: row.end_width.map(bonyad_units::Length),
            bulge: row.bulge,
        }
    }
}

impl crate::domain::LwpolylineVertex {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(
        self,
        entity_id: ::uuid::Uuid,
        revision_id: i64,
        position: i32,
    ) -> LwpolylineVertexRow {
        LwpolylineVertexRow {
            entity_id,
            revision_id,
            position,
            x: self.x.0,
            y: self.y.0,
            start_width: self.start_width.map(|v| v.0),
            end_width: self.end_width.map(|v| v.0),
            bulge: self.bulge,
        }
    }
}

/// One row of `acad.mesh`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct MeshRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub kind: ::std::string::String,
    pub subdivision_level: i32,
}

impl ::core::convert::From<MeshRow> for crate::domain::Mesh {
    fn from(row: MeshRow) -> Self {
        Self {
            subdivision_level: row.subdivision_level,
        }
    }
}

impl crate::domain::Mesh {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64) -> MeshRow {
        MeshRow {
            entity_id,
            revision_id,
            kind: "acad.mesh".to_owned(),
            subdivision_level: self.subdivision_level,
        }
    }
}

/// One row of `acad.mesh_face`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct MeshFaceRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub position: i32,
    pub vertex_indices: ::std::vec::Vec<i32>,
}

impl ::core::convert::From<MeshFaceRow> for crate::domain::MeshFace {
    fn from(row: MeshFaceRow) -> Self {
        Self {
            vertex_indices: row.vertex_indices,
        }
    }
}

impl crate::domain::MeshFace {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64, position: i32) -> MeshFaceRow {
        MeshFaceRow {
            entity_id,
            revision_id,
            position,
            vertex_indices: self.vertex_indices,
        }
    }
}

/// One row of `acad.mesh_vertex`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct MeshVertexRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub position: i32,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl ::core::convert::From<MeshVertexRow> for crate::domain::MeshVertex {
    fn from(row: MeshVertexRow) -> Self {
        Self {
            x: bonyad_units::Length(row.x),
            y: bonyad_units::Length(row.y),
            z: bonyad_units::Length(row.z),
        }
    }
}

impl crate::domain::MeshVertex {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(
        self,
        entity_id: ::uuid::Uuid,
        revision_id: i64,
        position: i32,
    ) -> MeshVertexRow {
        MeshVertexRow {
            entity_id,
            revision_id,
            position,
            x: self.x.0,
            y: self.y.0,
            z: self.z.0,
        }
    }
}

/// One row of `acad.point`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct PointRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub kind: ::std::string::String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub thickness: f64,
}

impl ::core::convert::From<PointRow> for crate::domain::Point {
    fn from(row: PointRow) -> Self {
        Self {
            x: bonyad_units::Length(row.x),
            y: bonyad_units::Length(row.y),
            z: bonyad_units::Length(row.z),
            thickness: bonyad_units::Length(row.thickness),
        }
    }
}

impl crate::domain::Point {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64) -> PointRow {
        PointRow {
            entity_id,
            revision_id,
            kind: "acad.point".to_owned(),
            x: self.x.0,
            y: self.y.0,
            z: self.z.0,
            thickness: self.thickness.0,
        }
    }
}

/// One row of `acad.text`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct TextRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub kind: ::std::string::String,
    pub insert_x: f64,
    pub insert_y: f64,
    pub insert_z: f64,
    pub height: f64,
    pub value: ::std::string::String,
    pub rotation: f64,
    pub width_factor: f64,
    pub oblique_angle: f64,
    pub style_name: ::core::option::Option<::std::string::String>,
    pub horizontal_alignment: i32,
    pub vertical_alignment: i32,
}

impl ::core::convert::From<TextRow> for crate::domain::Text {
    fn from(row: TextRow) -> Self {
        Self {
            insert: bonyad_units::Point3 {
                x: bonyad_units::Length(row.insert_x),
                y: bonyad_units::Length(row.insert_y),
                z: bonyad_units::Length(row.insert_z),
            },
            height: bonyad_units::Length(row.height),
            value: row.value,
            rotation: bonyad_units::Angle(row.rotation),
            width_factor: row.width_factor,
            oblique_angle: bonyad_units::Angle(row.oblique_angle),
            style_name: row.style_name,
            horizontal_alignment: row.horizontal_alignment,
            vertical_alignment: row.vertical_alignment,
        }
    }
}

impl crate::domain::Text {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64) -> TextRow {
        TextRow {
            entity_id,
            revision_id,
            kind: "acad.text".to_owned(),
            insert_x: self.insert.x.0,
            insert_y: self.insert.y.0,
            insert_z: self.insert.z.0,
            height: self.height.0,
            value: self.value,
            rotation: self.rotation.0,
            width_factor: self.width_factor,
            oblique_angle: self.oblique_angle.0,
            style_name: self.style_name,
            horizontal_alignment: self.horizontal_alignment,
            vertical_alignment: self.vertical_alignment,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn graphic_entity_round_trips_filled() {
        let row = GraphicEntityRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            type_code: "acad.arc".to_owned(),
            owner_block_id: ::uuid::Uuid::from_u128(1),
            layer_id: ::uuid::Uuid::from_u128(2),
            linetype_id: ::core::option::Option::Some(::uuid::Uuid::from_u128(3)),
            color: ::core::option::Option::Some(4),
            true_color: ::core::option::Option::Some(5),
            lineweight: ::core::option::Option::Some(6),
            linetype_scale: 3.00,
            visible: true,
            transparency: ::core::option::Option::Some(9),
            dxf_handle: ::core::option::Option::Some("x".to_owned()),
        };
        let value = crate::domain::GraphicEntity::from(row.clone());
        assert_eq!(
            value.into_row(row.entity_id, row.revision_id, row.type_code.clone()),
            row
        );
    }
    #[test]
    fn graphic_entity_round_trips_nulls() {
        let row = GraphicEntityRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            type_code: "acad.arc".to_owned(),
            owner_block_id: ::uuid::Uuid::from_u128(1),
            layer_id: ::uuid::Uuid::from_u128(2),
            linetype_id: ::core::option::Option::None,
            color: ::core::option::Option::None,
            true_color: ::core::option::Option::None,
            lineweight: ::core::option::Option::None,
            linetype_scale: 3.00,
            visible: true,
            transparency: ::core::option::Option::None,
            dxf_handle: ::core::option::Option::None,
        };
        let value = crate::domain::GraphicEntity::from(row.clone());
        assert_eq!(
            value.into_row(row.entity_id, row.revision_id, row.type_code.clone()),
            row
        );
    }

    #[test]
    fn arc_round_trips_filled() {
        let row = ArcRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.arc".to_owned(),
            center_x: 1.50,
            center_y: 1.75,
            center_z: 2.00,
            radius: 2.25,
            start_angle: 2.50,
            end_angle: 2.75,
            thickness: 3.00,
            normal_x: 3.25,
            normal_y: 3.50,
            normal_z: 3.75,
        };
        let value = crate::domain::Arc::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }

    #[test]
    fn block_record_round_trips_filled() {
        let row = BlockRecordRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.block_record".to_owned(),
            name: "x".to_owned(),
            is_layout: true,
            insertion_units: ::core::option::Option::Some(3),
            base_x: 2.25,
            base_y: 2.50,
            base_z: 2.75,
        };
        let value = crate::domain::BlockRecord::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }
    #[test]
    fn block_record_round_trips_nulls() {
        let row = BlockRecordRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.block_record".to_owned(),
            name: "x".to_owned(),
            is_layout: true,
            insertion_units: ::core::option::Option::None,
            base_x: 2.25,
            base_y: 2.50,
            base_z: 2.75,
        };
        let value = crate::domain::BlockRecord::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }

    #[test]
    fn circle_round_trips_filled() {
        let row = CircleRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.circle".to_owned(),
            center_x: 1.50,
            center_y: 1.75,
            center_z: 2.00,
            radius: 2.25,
            thickness: 2.50,
            normal_x: 2.75,
            normal_y: 3.00,
            normal_z: 3.25,
        };
        let value = crate::domain::Circle::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }

    #[test]
    fn face3d_round_trips_filled() {
        let row = Face3dRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.face3d".to_owned(),
            c1_x: 1.50,
            c1_y: 1.75,
            c1_z: 2.00,
            c2_x: 2.25,
            c2_y: 2.50,
            c2_z: 2.75,
            c3_x: 3.00,
            c3_y: 3.25,
            c3_z: 3.50,
            c4_x: 3.75,
            c4_y: 4.00,
            c4_z: 4.25,
            edge_flags: 13,
        };
        let value = crate::domain::Face3d::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }

    #[test]
    fn insert_round_trips_filled() {
        let row = InsertRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.insert".to_owned(),
            block_id: ::uuid::Uuid::from_u128(1),
            ins_x: 1.75,
            ins_y: 2.00,
            ins_z: 2.25,
            scale_x: 2.50,
            scale_y: 2.75,
            scale_z: 3.00,
            rotation: 3.25,
            column_count: 9,
            row_count: 10,
            column_spacing: ::core::option::Option::Some(4.00),
            row_spacing: ::core::option::Option::Some(4.25),
        };
        let value = crate::domain::Insert::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }
    #[test]
    fn insert_round_trips_nulls() {
        let row = InsertRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.insert".to_owned(),
            block_id: ::uuid::Uuid::from_u128(1),
            ins_x: 1.75,
            ins_y: 2.00,
            ins_z: 2.25,
            scale_x: 2.50,
            scale_y: 2.75,
            scale_z: 3.00,
            rotation: 3.25,
            column_count: 9,
            row_count: 10,
            column_spacing: ::core::option::Option::None,
            row_spacing: ::core::option::Option::None,
        };
        let value = crate::domain::Insert::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }

    #[test]
    fn layer_round_trips_filled() {
        let row = LayerRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.layer".to_owned(),
            name: "x".to_owned(),
            color: ::core::option::Option::Some(2),
            linetype_id: ::core::option::Option::Some(::uuid::Uuid::from_u128(3)),
            lineweight: ::core::option::Option::Some(4),
            is_off: true,
            is_frozen: true,
            is_locked: true,
            plot: true,
        };
        let value = crate::domain::Layer::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }
    #[test]
    fn layer_round_trips_nulls() {
        let row = LayerRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.layer".to_owned(),
            name: "x".to_owned(),
            color: ::core::option::Option::None,
            linetype_id: ::core::option::Option::None,
            lineweight: ::core::option::Option::None,
            is_off: true,
            is_frozen: true,
            is_locked: true,
            plot: true,
        };
        let value = crate::domain::Layer::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }

    #[test]
    fn line_round_trips_filled() {
        let row = LineRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.line".to_owned(),
            start_x: 1.50,
            start_y: 1.75,
            start_z: 2.00,
            end_x: 2.25,
            end_y: 2.50,
            end_z: 2.75,
            thickness: 3.00,
            normal_x: 3.25,
            normal_y: 3.50,
            normal_z: 3.75,
        };
        let value = crate::domain::Line::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }

    #[test]
    fn linetype_round_trips_filled() {
        let row = LinetypeRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.linetype".to_owned(),
            name: "x".to_owned(),
            description: ::core::option::Option::Some("x".to_owned()),
            pattern_length: ::core::option::Option::Some(2.00),
        };
        let value = crate::domain::Linetype::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }
    #[test]
    fn linetype_round_trips_nulls() {
        let row = LinetypeRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.linetype".to_owned(),
            name: "x".to_owned(),
            description: ::core::option::Option::None,
            pattern_length: ::core::option::Option::None,
        };
        let value = crate::domain::Linetype::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }

    #[test]
    fn lwpolyline_round_trips_filled() {
        let row = LwpolylineRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.lwpolyline".to_owned(),
            elevation: 1.50,
            closed: true,
            constant_width: ::core::option::Option::Some(2.00),
            thickness: 2.25,
            normal_x: 2.50,
            normal_y: 2.75,
            normal_z: 3.00,
        };
        let value = crate::domain::Lwpolyline::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }
    #[test]
    fn lwpolyline_round_trips_nulls() {
        let row = LwpolylineRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.lwpolyline".to_owned(),
            elevation: 1.50,
            closed: true,
            constant_width: ::core::option::Option::None,
            thickness: 2.25,
            normal_x: 2.50,
            normal_y: 2.75,
            normal_z: 3.00,
        };
        let value = crate::domain::Lwpolyline::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }

    #[test]
    fn lwpolyline_vertex_round_trips_filled() {
        let row = LwpolylineVertexRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            position: 3,
            x: 1.50,
            y: 1.75,
            start_width: ::core::option::Option::Some(2.00),
            end_width: ::core::option::Option::Some(2.25),
            bulge: 2.50,
        };
        let value = crate::domain::LwpolylineVertex::from(row.clone());
        assert_eq!(
            value.into_row(row.entity_id, row.revision_id, row.position),
            row
        );
    }
    #[test]
    fn lwpolyline_vertex_round_trips_nulls() {
        let row = LwpolylineVertexRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            position: 3,
            x: 1.50,
            y: 1.75,
            start_width: ::core::option::Option::None,
            end_width: ::core::option::Option::None,
            bulge: 2.50,
        };
        let value = crate::domain::LwpolylineVertex::from(row.clone());
        assert_eq!(
            value.into_row(row.entity_id, row.revision_id, row.position),
            row
        );
    }

    #[test]
    fn mesh_round_trips_filled() {
        let row = MeshRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.mesh".to_owned(),
            subdivision_level: 1,
        };
        let value = crate::domain::Mesh::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }

    #[test]
    fn mesh_face_round_trips_filled() {
        let row = MeshFaceRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            position: 3,
            vertex_indices: vec![1],
        };
        let value = crate::domain::MeshFace::from(row.clone());
        assert_eq!(
            value.into_row(row.entity_id, row.revision_id, row.position),
            row
        );
    }

    #[test]
    fn mesh_vertex_round_trips_filled() {
        let row = MeshVertexRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            position: 3,
            x: 1.50,
            y: 1.75,
            z: 2.00,
        };
        let value = crate::domain::MeshVertex::from(row.clone());
        assert_eq!(
            value.into_row(row.entity_id, row.revision_id, row.position),
            row
        );
    }

    #[test]
    fn point_round_trips_filled() {
        let row = PointRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.point".to_owned(),
            x: 1.50,
            y: 1.75,
            z: 2.00,
            thickness: 2.25,
        };
        let value = crate::domain::Point::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }

    #[test]
    fn text_round_trips_filled() {
        let row = TextRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.text".to_owned(),
            insert_x: 1.50,
            insert_y: 1.75,
            insert_z: 2.00,
            height: 2.25,
            value: "x".to_owned(),
            rotation: 2.75,
            width_factor: 3.00,
            oblique_angle: 3.25,
            style_name: ::core::option::Option::Some("x".to_owned()),
            horizontal_alignment: 10,
            vertical_alignment: 11,
        };
        let value = crate::domain::Text::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }
    #[test]
    fn text_round_trips_nulls() {
        let row = TextRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "acad.text".to_owned(),
            insert_x: 1.50,
            insert_y: 1.75,
            insert_z: 2.00,
            height: 2.25,
            value: "x".to_owned(),
            rotation: 2.75,
            width_factor: 3.00,
            oblique_angle: 3.25,
            style_name: ::core::option::Option::None,
            horizontal_alignment: 10,
            vertical_alignment: 11,
        };
        let value = crate::domain::Text::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }
}
