//! Entity kinds: the markers behind `Id<K>`. A kind names a thing with identity; it carries
//! no data and no behaviour. Geometry components and recipes live elsewhere.

entity_kinds! {
    // ---- 2D drawing (the current Bonyad slice) and shared geometry
    Point = "point",
    Line = "line",
    Surface = "surface",
    // ---- solid modelling
    /// A solid or sheet body.
    Body = "body",
    Sketch = "sketch",
    /// A timeline feature (a stored recipe step).
    Feature = "feature",
    Parameter = "parameter",
    // ---- meshes and scenes
    Mesh = "mesh",
    SceneNode = "scene_node",
    Controller = "controller",
    Stage = "stage",
    Layer = "layer",
    // ---- civil and survey
    Alignment = "alignment",
    VerticalProfile = "vertical_profile",
    TinSurface = "tin_surface",
    VolumeSurface = "volume_surface",
    SampleLineGroup = "sample_line_group",
    Corridor = "corridor",
    Assembly = "assembly",
    FeatureLine = "feature_line",
    PipeNetwork = "pipe_network",
    Parcel = "parcel",
    SurveyNetwork = "survey_network",
    // ---- building information
    Element = "element",
    ElementType = "element_type",
    Level = "level",
    Room = "room",
    Phase = "phase",
    DesignOption = "design_option",
    Workset = "workset",
    // ---- analysis
    AnalysisModel = "analysis_model",
    Material = "material",
    Section = "section",
    BoundaryCondition = "boundary_condition",
    Load = "load",
    Step = "step",
    ResultSet = "result_set",
    // ---- containers
    /// A parametric design: an ordered timeline of stored procedure calls.
    Design = "design",
    /// The unit of versioning: one head revision for many entities.
    Project = "project",
    // ---- verification
    /// A stored result record (provenance plus outcome).
    Record = "record",
}
