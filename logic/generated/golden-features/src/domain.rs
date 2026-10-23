//! Pure domain types for the `features` catalogue: units as newtypes, no database dependency.
//!
//! Each struct holds the type's OWN fields. A type with a `base` keeps the base fields in the base
//! type's struct (see the row types in `rows`).

/// Element: Root of the fixture hierarchy; carries a label and an optional placement matrix shared by all elements. (`features.element`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct Element {
    /// Free-text label
    pub label: ::core::option::Option<::std::string::String>,
    /// Optional placement, row-major
    pub placement: ::core::option::Option<bonyad_units::Matrix4>,
}

/// Beam: A leaf type that attaches to the nearest tabled ancestor (element) across an untabled abstract type. (`features.beam`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct Beam {
    /// Span
    pub span: bonyad_units::Length,
    /// Cross-section area
    pub section_area: bonyad_units::Area,
    /// Volume
    pub volume: ::core::option::Option<bonyad_units::Volume>,
    /// A ratio between 0 and 1
    pub share: bonyad_units::Ratio,
    /// A bigint counter
    pub count: i64,
    /// Optional profile
    pub profile: ::core::option::Option<BeamProfile>,
}

/// Optional profile (`features.beam.profile`)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, ::serde::Serialize, ::serde::Deserialize)]
pub enum BeamProfile {
    /// I profile
    #[serde(rename = "i")]
    I,
    /// Box profile
    #[serde(rename = "box")]
    Box,
}

impl BeamProfile {
    /// Every value, in catalogue order.
    pub const ALL: [BeamProfile; 2] = [BeamProfile::I, BeamProfile::Box];

    /// The stored text (what the database column holds).
    pub fn as_str(self) -> &'static str {
        match self {
            BeamProfile::I => "i",
            BeamProfile::Box => "box",
        }
    }

    /// The value for stored text, if it is one of the catalogue's values.
    pub fn parse(text: &str) -> ::core::option::Option<Self> {
        match text {
            "i" => ::core::option::Option::Some(BeamProfile::I),
            "box" => ::core::option::Option::Some(BeamProfile::Box),
            _ => ::core::option::Option::None,
        }
    }
}

/// Style: A standalone symbol type with no base. (`features.style`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct Style {
    /// Style name
    pub name: ::std::string::String,
    /// A SQL reserved word as a column name prefix
    pub end: ::core::option::Option<bonyad_units::Point3>,
    /// A SQL reserved word as a column name
    pub order: ::core::option::Option<i32>,
}

/// Wall: A concrete type that also has a subtype, so its table carries a type_code discriminator. Exercises enums, nullable composites, dates, blobs and arrays. (`features.wall`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct Wall {
    /// Height of the wall
    pub height: bonyad_units::Length,
    /// Wall form (a Rust keyword as a field name)
    pub r#type: WallType,
    /// Optional plan offset
    pub offset: ::core::option::Option<bonyad_units::Point2>,
    /// Optional direction
    pub direction: ::core::option::Option<bonyad_units::Vector3>,
    /// Construction date
    pub built_on: ::core::option::Option<::time::Date>,
    /// When it was recorded
    pub recorded_at: ::core::option::Option<::time::OffsetDateTime>,
    /// Opaque binary payload
    pub payload: ::core::option::Option<::std::vec::Vec<u8>>,
    /// Tolerances, may be empty
    pub tolerances: ::std::vec::Vec<bonyad_units::Length>,
    /// Optional list of angles
    pub angles: ::core::option::Option<::std::vec::Vec<bonyad_units::Angle>>,
    /// Optional reference to any entity
    pub host: ::core::option::Option<::uuid::Uuid>,
    /// A Rust keyword that cannot be a raw identifier
    pub self_: i32,
    /// Text default with a quote
    pub tag: ::std::string::String,
}

/// Wall form (a Rust keyword as a field name) (`features.wall.type`)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, ::serde::Serialize, ::serde::Deserialize)]
pub enum WallType {
    /// Straight wall
    #[serde(rename = "straight")]
    Straight,
    /// Curved wall
    #[serde(rename = "curved")]
    Curved,
    /// Polygonal wall; the value is not a Rust identifier
    #[serde(rename = "polygonal-x")]
    PolygonalX,
    /// Starts with a digit
    #[serde(rename = "2d")]
    V2d,
}

impl WallType {
    /// Every value, in catalogue order.
    pub const ALL: [WallType; 4] = [
        WallType::Straight,
        WallType::Curved,
        WallType::PolygonalX,
        WallType::V2d,
    ];

    /// The stored text (what the database column holds).
    pub fn as_str(self) -> &'static str {
        match self {
            WallType::Straight => "straight",
            WallType::Curved => "curved",
            WallType::PolygonalX => "polygonal-x",
            WallType::V2d => "2d",
        }
    }

    /// The value for stored text, if it is one of the catalogue's values.
    pub fn parse(text: &str) -> ::core::option::Option<Self> {
        match text {
            "straight" => ::core::option::Option::Some(WallType::Straight),
            "curved" => ::core::option::Option::Some(WallType::Curved),
            "polygonal-x" => ::core::option::Option::Some(WallType::PolygonalX),
            "2d" => ::core::option::Option::Some(WallType::V2d),
            _ => ::core::option::Option::None,
        }
    }
}

/// WallLayer: One ordered layer of a wall; a child of a table that has a type_code discriminator. (`features.wall_layer`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct WallLayer {
    /// Layer thickness
    pub thickness: bonyad_units::Length,
    /// Material name
    pub material: ::std::string::String,
}

/// WallStandard: A subtype that adds no fields; its row exists only in the base tables. (`features.wall_standard`)
#[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
pub struct WallStandard {}
