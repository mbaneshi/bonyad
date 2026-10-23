// The 16 acad tables that already exist in db/migrations/20261023000005_phase1_entity_spine.sql.
// Their field lists are written out here, by hand, so the generated catalogue agrees with the migration
// column for column (test/catalogue.test.ts parses the SQL and compares). Meanings and source refs are
// still taken from the sources: `from` names the ACadSharp class (and group codes) a meaning is read from,
// `meaning` overrides it when the source has no wording for a pilot-specific column.
import type { Field } from "./catalogue.ts";

export type Spec = Omit<Field, "meaning" | "source_ref"> & { from?: number[]; meaning?: string; source_ref?: string };
export type ExistingType = {
  code: string;
  cs: string; // ACadSharp class the DXF knowledge comes from (null-ish for hand structures)
  kind: "entity" | "symbol" | "child";
  base?: string;
  parent?: string;
  fields: Spec[];
  notes: string;
};

const N = { nullable: true } as const;
const normal: Spec = { name: "normal", type: "vector3", default: [0, 0, 1], from: [210, 220, 230] };
const thickness: Spec = { name: "thickness", type: "length", default: 0, from: [39] };

export const EXISTING: ExistingType[] = [
  {
    code: "acad.graphic_entity", cs: "Entity", kind: "entity",
    notes:
      "Hand-curated to equal the pilot table acad.graphic_entity. Common entity group codes DXF defines that the pilot table does not carry (material 347, colour-book name 430, paper-space flag 67, shadow mode 284, visual style 348, plot style 380/390) are listed in GAPS.md. transparency is stored as a percent 0..90 (the migration's check); DXF group 440 holds a 32-bit value, converted at the source boundary. color/true_color/lineweight are the raw DXF group 62/420/370 integers.",
    fields: [
      { name: "owner_block_id", type: "ref", ref_to: "acad.block_record", meaning: "The block definition (model space, paper space or a block) that contains this entity.", source_ref: "group code 330 (owner handle) of the entity" },
      { name: "layer_id", type: "ref", ref_to: "acad.layer", meaning: "The layer the entity is drawn on; DXF stores the layer name.", from: [8] },
      { name: "linetype_id", type: "ref", ref_to: "acad.linetype", ...N, meaning: "Explicit linetype of the entity; null means ByLayer. DXF stores the linetype name.", from: [6] },
      { name: "color", type: "int", ...N, meaning: "AutoCAD Color Index (group 62): 0 ByBlock, 256 ByLayer, 1..255 an index; null means unset.", from: [62] },
      { name: "true_color", type: "int", ...N, meaning: "24-bit true colour 0x00RRGGBB (group 420); null when the entity uses an index colour.", from: [420] },
      { name: "lineweight", type: "int", ...N, meaning: "Lineweight in 1/100 mm (group 370); negative values are the special ByLayer (-1), ByBlock (-2) and Default (-3).", from: [370] },
      { name: "linetype_scale", type: "ratio", default: 1, check: "positive", meaning: "Linetype scale multiplier of the entity.", from: [48] },
      { name: "visible", type: "bool", default: true, meaning: "True when the entity is visible; the inverse of the DXF invisibility flag (group 60).", source_ref: "group code 60 (invisible = 1), inverted" },
      { name: "transparency", type: "int", ...N, meaning: "Entity transparency in percent, 0 to 90 (the migration check); DXF group 440 stores a 32-bit value that is converted at the source boundary.", from: [440] },
      { name: "dxf_handle", type: "text", ...N, meaning: "The entity's handle in the DXF file it was imported from; file-scoped, a mapping column only.", from: [5] },
    ],
  },
  {
    code: "acad.layer", cs: "Layer", kind: "symbol",
    notes: "Hand-curated to equal the pilot table. DXF layer fields not carried by the pilot table (flags bits other than frozen/locked, true colour 420, plot style 390, material 347) are listed in GAPS.md.",
    fields: [
      { name: "name", type: "text", meaning: "Layer name.", from: [2] },
      { name: "color", type: "int", ...N, meaning: "AutoCAD Color Index of the layer (group 62); in DXF a negative index means the layer is off, which is carried separately in is_off.", from: [62] },
      { name: "linetype_id", type: "ref", ref_to: "acad.linetype", ...N, meaning: "Default linetype of the layer; DXF stores the linetype name.", from: [6] },
      { name: "lineweight", type: "int", ...N, meaning: "Default lineweight of the layer in 1/100 mm (group 370).", from: [370] },
      { name: "is_off", type: "bool", default: false, meaning: "True when the layer is switched off; DXF encodes this as a negative colour index (group 62).", source_ref: "group code 62 (negative = off), ezdxf acdb_layer_table_record comment; ACadSharp Layer.Color remarks" },
      { name: "is_frozen", type: "bool", default: false, meaning: "True when the layer is frozen (flag bit 1 of group 70).", source_ref: "group code 70, bit 1 (LayerFlags.Frozen)" },
      { name: "is_locked", type: "bool", default: false, meaning: "True when the layer is locked (flag bit 4 of group 70).", source_ref: "group code 70, bit 4 (LayerFlags.Locked)" },
      { name: "plot", type: "bool", default: true, meaning: "True when the layer is plotted.", from: [290] },
    ],
  },
  {
    code: "acad.linetype", cs: "LineType", kind: "symbol",
    notes: "Hand-curated to equal the pilot table. The dash/dot/text/shape segments of the DXF LTYPE (group 73 count, 49, 74, ...) are not in the pilot table; see GAPS.md.",
    fields: [
      { name: "name", type: "text", meaning: "Linetype name.", from: [2] },
      { name: "description", type: "text", ...N, meaning: "Descriptive text of the linetype.", from: [3] },
      { name: "pattern_length", type: "length", ...N, meaning: "Total pattern length.", from: [40] },
    ],
  },
  {
    code: "acad.block_record", cs: "BlockRecord", kind: "symbol",
    notes: "Hand-curated to equal the pilot table. DXF BLOCK_RECORD fields not carried by the pilot table (explodability 280, scalability 281, preview 310, layout handle 340) are listed in GAPS.md. The base point belongs to the BLOCK entity in DXF (group 10/20/30); the pilot stores it here.",
    fields: [
      { name: "name", type: "text", meaning: "Block name; model and paper space are blocks named *Model_Space and *Paper_Space*.", from: [2] },
      { name: "is_layout", type: "bool", default: false, meaning: "True for the blocks that back a layout (model space or a paper space).", source_ref: "group code 340 (layout handle present) of BLOCK_RECORD; ACadSharp BlockRecord.Layout" },
      { name: "insertion_units", type: "int", ...N, meaning: "Block insertion units code (INSUNITS value); null when unset.", source_ref: "BLOCK_RECORD group code 70 in ezdxf BlockRecord.units (ACadSharp BlockRecord.Units, UnitsType)" },
      { name: "base", type: "point3", default: [0, 0, 0], meaning: "Base point of the block definition.", source_ref: "BLOCK entity group codes 10, 20, 30" },
    ],
  },
  {
    code: "acad.insert", cs: "Insert", kind: "entity", base: "acad.graphic_entity",
    notes: "Hand-curated to equal the pilot table. DXF INSERT fields not carried by the pilot table (normal 210, has-attributes 66) are listed in GAPS.md. Angles are radians; DXF stores degrees. Column/row counts are DXF 70/71 (MINSERT arrays).",
    fields: [
      { name: "block_id", type: "ref", ref_to: "acad.block_record", meaning: "The block definition this entity places; DXF stores the block name.", from: [2] },
      { name: "ins", type: "point3", meaning: "Insertion point (WCS).", from: [10, 20, 30] },
      { name: "scale_x", type: "ratio", default: 1, check: "non_zero", meaning: "X scale factor.", from: [41] },
      { name: "scale_y", type: "ratio", default: 1, check: "non_zero", meaning: "Y scale factor.", from: [42] },
      { name: "scale_z", type: "ratio", default: 1, check: "non_zero", meaning: "Z scale factor.", from: [43] },
      { name: "rotation", type: "angle", default: 0, meaning: "Rotation angle in radians (DXF group 50 stores degrees).", from: [50] },
      { name: "column_count", type: "int", default: 1, meaning: "Column count of a multiple insert (MINSERT); 1 for a single placement.", from: [70] },
      { name: "row_count", type: "int", default: 1, meaning: "Row count of a multiple insert (MINSERT); 1 for a single placement.", from: [71] },
      { name: "column_spacing", type: "length", ...N, meaning: "Column spacing of a multiple insert.", from: [44] },
      { name: "row_spacing", type: "length", ...N, meaning: "Row spacing of a multiple insert.", from: [45] },
    ],
  },
  {
    code: "acad.point", cs: "Point", kind: "entity", base: "acad.graphic_entity",
    notes: "Hand-curated to equal the pilot table (x, y, z columns). Angle of the X axis (group 50) and normal (210) are listed in GAPS.md.",
    fields: [
      { name: "x", type: "length", meaning: "X coordinate of the point.", source_ref: "group code 10" },
      { name: "y", type: "length", meaning: "Y coordinate of the point.", source_ref: "group code 20" },
      { name: "z", type: "length", meaning: "Z coordinate of the point.", source_ref: "group code 30" },
      { ...thickness },
    ],
  },
  {
    code: "acad.line", cs: "Line", kind: "entity", base: "acad.graphic_entity",
    notes: "Hand-curated to equal the pilot table.",
    fields: [
      { name: "start", type: "point3", meaning: "Start point.", from: [10, 20, 30] },
      { name: "end", type: "point3", meaning: "End point.", from: [11, 21, 31] },
      { ...thickness },
      { ...normal },
    ],
  },
  {
    code: "acad.circle", cs: "Circle", kind: "entity", base: "acad.graphic_entity",
    notes: "Hand-curated to equal the pilot table.",
    fields: [
      { name: "center", type: "point3", meaning: "Centre point.", from: [10, 20, 30] },
      { name: "radius", type: "length", check: "positive", meaning: "Radius.", from: [40] },
      { ...thickness },
      { ...normal },
    ],
  },
  {
    code: "acad.arc", cs: "Arc", kind: "entity", base: "acad.graphic_entity",
    notes: "Hand-curated to equal the pilot table. Angles are radians counter-clockwise; DXF stores degrees. In DXF an ARC extends CIRCLE (same centre, radius, thickness, normal); the pilot table repeats them.",
    fields: [
      { name: "center", type: "point3", meaning: "Centre point.", from: [10, 20, 30] },
      { name: "radius", type: "length", check: "positive", meaning: "Radius.", from: [40] },
      { name: "start_angle", type: "angle", meaning: "Start angle in radians, counter-clockwise (DXF group 50 stores degrees).", from: [50] },
      { name: "end_angle", type: "angle", meaning: "End angle in radians, counter-clockwise (DXF group 51 stores degrees).", from: [51] },
      { ...thickness },
      { ...normal },
    ],
  },
  {
    code: "acad.lwpolyline", cs: "LwPolyline", kind: "entity", base: "acad.graphic_entity",
    notes: "Hand-curated to equal the pilot table. The Plinegen flag (bit 128 of group 70) is not carried; see GAPS.md.",
    fields: [
      { name: "elevation", type: "length", default: 0, meaning: "Elevation (Z) of the polyline plane in the OCS.", from: [38] },
      { name: "closed", type: "bool", default: false, meaning: "True when the polyline is closed (bit 1 of group 70).", source_ref: "group code 70, bit 1 (LwPolylineFlags.Closed)" },
      { name: "constant_width", type: "length", ...N, meaning: "Constant width of all segments; null when widths are per vertex.", from: [43] },
      { ...thickness },
      { ...normal },
    ],
  },
  {
    code: "acad.lwpolyline_vertex", cs: "LwPolyline.Vertex", kind: "child", parent: "acad.lwpolyline",
    notes: "Hand-curated to equal the pilot table. Rows are ordered by the implicit position column. DXF also stores a vertex id (91) and a curve-fit tangent direction (50); the pilot table has neither (GAPS.md).",
    fields: [
      { name: "x", type: "length", meaning: "Vertex X coordinate (OCS).", source_ref: "group code 10" },
      { name: "y", type: "length", meaning: "Vertex Y coordinate (OCS).", source_ref: "group code 20" },
      { name: "start_width", type: "length", ...N, meaning: "Starting width of the segment leaving this vertex.", from: [40] },
      { name: "end_width", type: "length", ...N, meaning: "Ending width of the segment leaving this vertex.", from: [41] },
      { name: "bulge", type: "float", default: 0, meaning: "Bulge: tangent of a quarter of the included angle of the arc segment, negative for clockwise; 0 is a straight segment.", from: [42] },
    ],
  },
  {
    code: "acad.face3d", cs: "Face3D", kind: "entity", base: "acad.graphic_entity",
    notes: "Hand-curated to equal the pilot table. edge_flags is 0..15 (four invisible-edge bits); the range check is a table constraint the catalogue cannot express.",
    fields: [
      { name: "c1", type: "point3", meaning: "First corner (WCS).", from: [10, 20, 30] },
      { name: "c2", type: "point3", meaning: "Second corner (WCS).", from: [11, 21, 31] },
      { name: "c3", type: "point3", meaning: "Third corner (WCS).", from: [12, 22, 32] },
      { name: "c4", type: "point3", meaning: "Fourth corner (WCS); equal to the third corner for a triangle.", from: [13, 23, 33] },
      { name: "edge_flags", type: "int", default: 0, meaning: "Invisible-edge bit flags: 1 first, 2 second, 4 third, 8 fourth edge invisible; 0 to 15.", from: [70] },
    ],
  },
  {
    code: "acad.mesh", cs: "Mesh", kind: "entity", base: "acad.graphic_entity",
    notes: "Hand-curated to equal the pilot table. DXF MESH (SubD mesh) also carries blend-crease (72), edges with crease values and the property-override section; vertices and faces are the child tables below (GAPS.md).",
    fields: [
      { name: "subdivision_level", type: "int", default: 0, check: "non_negative", meaning: "Number of subdivision levels.", from: [91] },
    ],
  },
  {
    code: "acad.mesh_vertex", cs: "Mesh", kind: "child", parent: "acad.mesh",
    notes: "Hand-curated to equal the pilot table; ordered by the implicit position column. In DXF the vertices of level 0 are repeated 10/20/30 triples after the count in group 92.",
    fields: [
      { name: "x", type: "length", meaning: "Vertex X coordinate.", source_ref: "group code 10 (repeated, count in 92)" },
      { name: "y", type: "length", meaning: "Vertex Y coordinate.", source_ref: "group code 20 (repeated, count in 92)" },
      { name: "z", type: "length", meaning: "Vertex Z coordinate.", source_ref: "group code 30 (repeated, count in 92)" },
    ],
  },
  {
    code: "acad.mesh_face", cs: "Mesh", kind: "child", parent: "acad.mesh",
    notes: "Hand-curated to equal the pilot table; ordered by the implicit position column. At least three indices per face is a table constraint the catalogue cannot express. DXF stores each face as a vertex count followed by that many indices, all in group 90.",
    fields: [
      { name: "vertex_indices", type: "array", of: "int", meaning: "Zero-based indices into the mesh's vertex list, in face order.", source_ref: "group code 90 (repeated, preceded by the count; face list of level 0, count in 93)" },
    ],
  },
  {
    code: "acad.text", cs: "TextEntity", kind: "entity", base: "acad.graphic_entity",
    notes: "Hand-curated to equal the pilot table. Angles are radians; DXF stores degrees. DXF TEXT also carries a second alignment point (11), generation flags (71), thickness (39) and a normal (210); the pilot table does not (GAPS.md).",
    fields: [
      { name: "insert", type: "point3", meaning: "First alignment point (OCS).", from: [10, 20, 30] },
      { name: "height", type: "length", check: "positive", meaning: "Text height.", from: [40] },
      { name: "value", type: "text", meaning: "The text string.", from: [1] },
      { name: "rotation", type: "angle", default: 0, meaning: "Rotation in radians (DXF group 50 stores degrees).", from: [50] },
      { name: "width_factor", type: "ratio", default: 1, check: "positive", meaning: "Relative X scale factor (width).", from: [41] },
      { name: "oblique_angle", type: "angle", default: 0, meaning: "Oblique angle in radians (DXF group 51 stores degrees).", from: [51] },
      { name: "style_name", type: "text", ...N, meaning: "Name of the text style; null means the default style.", from: [7] },
      { name: "horizontal_alignment", type: "int", default: 0, meaning: "Horizontal justification code: 0 left, 1 center, 2 right, 3 aligned, 4 middle, 5 fit.", from: [72] },
      { name: "vertical_alignment", type: "int", default: 0, meaning: "Vertical justification code: 0 baseline, 1 bottom, 2 middle, 3 top.", from: [73] },
    ],
  },
];
