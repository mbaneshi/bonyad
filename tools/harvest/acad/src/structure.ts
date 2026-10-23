// Hand decisions about how ACadSharp's class model maps to catalogue types. Anything that cannot be
// derived mechanically lives here and nowhere else.
export const STRUCTURE = {
  // delimiters of the DXF file structure with no data of their own
  skipClasses: new Set(["BlockEnd", "Seqend", "UnknownEntity", "UnknownNonGraphicalObject"]),
  codeOverrides: {
    LineType: "acad.linetype",
    TextEntity: "acad.text",
    Face3D: "acad.face3d",
    Block: "acad.block",
    CadDictionary: "acad.dictionary",
    CadBody: "acad.body",
    MultiLeader: "acad.mleader",
    MultiLeaderObjectContextData: "acad.mleader_context_data",
    BlockReferenceObjectContextData: "acad.blkref_context_data",
    MTextAttributeObjectContextData: "acad.mtext_attribute_context_data",
    DynamicBlockPurgePreventer: "acad.dynamic_block_purge_preventer",
    BlockRepresentationData: "acad.block_representation_data",
    EvaluationGraph: "acad.evaluation_graph",
    BookColor: "acad.dbcolor",
  } as Record<string, string>,
  nameOverrides: {} as Record<string, string>,
  kindOverrides: { Block: "symbol", Vertex: "abstract" } as Record<string, "entity" | "symbol" | "object" | "child" | "abstract">,
  childOf: {
    Vertex2D: "acad.polyline2d",
    Vertex3D: "acad.polyline3d",
    PolygonMeshVertex: "acad.polygon_mesh",
    VertexFaceMesh: "acad.polyface_mesh",
    VertexFaceRecord: "acad.polyface_mesh",
  } as Record<string, string>,
  noEntityBase: new Set(["Vertex"]),
};
