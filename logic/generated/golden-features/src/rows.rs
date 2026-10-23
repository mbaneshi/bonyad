//! Row types for the `features` tables (sqlx::FromRow) and their conversions to the domain types.
//!
//! Key columns come first. `into_row` takes the key values a domain value does not carry.

/// One row of `features.element`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct ElementRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub type_code: ::std::string::String,
    pub label: ::core::option::Option<::std::string::String>,
    pub placement_m00: ::core::option::Option<f64>,
    pub placement_m01: ::core::option::Option<f64>,
    pub placement_m02: ::core::option::Option<f64>,
    pub placement_m03: ::core::option::Option<f64>,
    pub placement_m10: ::core::option::Option<f64>,
    pub placement_m11: ::core::option::Option<f64>,
    pub placement_m12: ::core::option::Option<f64>,
    pub placement_m13: ::core::option::Option<f64>,
    pub placement_m20: ::core::option::Option<f64>,
    pub placement_m21: ::core::option::Option<f64>,
    pub placement_m22: ::core::option::Option<f64>,
    pub placement_m23: ::core::option::Option<f64>,
    pub placement_m30: ::core::option::Option<f64>,
    pub placement_m31: ::core::option::Option<f64>,
    pub placement_m32: ::core::option::Option<f64>,
    pub placement_m33: ::core::option::Option<f64>,
}

impl ::core::convert::TryFrom<ElementRow> for crate::domain::Element {
    type Error = crate::ConversionError;

    fn try_from(row: ElementRow) -> ::core::result::Result<Self, Self::Error> {
        ::core::result::Result::Ok(Self {
            label: row.label,
            placement: {
                let parts = [
                    row.placement_m00,
                    row.placement_m01,
                    row.placement_m02,
                    row.placement_m03,
                    row.placement_m10,
                    row.placement_m11,
                    row.placement_m12,
                    row.placement_m13,
                    row.placement_m20,
                    row.placement_m21,
                    row.placement_m22,
                    row.placement_m23,
                    row.placement_m30,
                    row.placement_m31,
                    row.placement_m32,
                    row.placement_m33,
                ];
                if parts.iter().all(::core::option::Option::is_none) {
                    ::core::option::Option::None
                } else if parts.iter().all(::core::option::Option::is_some) {
                    let [
                        v0,
                        v1,
                        v2,
                        v3,
                        v4,
                        v5,
                        v6,
                        v7,
                        v8,
                        v9,
                        v10,
                        v11,
                        v12,
                        v13,
                        v14,
                        v15,
                    ] = parts.map(|v| v.unwrap_or_default());
                    ::core::option::Option::Some(bonyad_units::Matrix4([
                        v0, v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12, v13, v14, v15,
                    ]))
                } else {
                    return ::core::result::Result::Err(crate::ConversionError::new(
                        "placement",
                        "some components are null and some are not",
                    ));
                }
            },
        })
    }
}

impl crate::domain::Element {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(
        self,
        entity_id: ::uuid::Uuid,
        revision_id: i64,
        type_code: impl ::core::convert::Into<::std::string::String>,
    ) -> ElementRow {
        ElementRow {
            entity_id,
            revision_id,
            type_code: type_code.into(),
            label: self.label,
            placement_m00: self.placement.map(|v| v.0[0]),
            placement_m01: self.placement.map(|v| v.0[1]),
            placement_m02: self.placement.map(|v| v.0[2]),
            placement_m03: self.placement.map(|v| v.0[3]),
            placement_m10: self.placement.map(|v| v.0[4]),
            placement_m11: self.placement.map(|v| v.0[5]),
            placement_m12: self.placement.map(|v| v.0[6]),
            placement_m13: self.placement.map(|v| v.0[7]),
            placement_m20: self.placement.map(|v| v.0[8]),
            placement_m21: self.placement.map(|v| v.0[9]),
            placement_m22: self.placement.map(|v| v.0[10]),
            placement_m23: self.placement.map(|v| v.0[11]),
            placement_m30: self.placement.map(|v| v.0[12]),
            placement_m31: self.placement.map(|v| v.0[13]),
            placement_m32: self.placement.map(|v| v.0[14]),
            placement_m33: self.placement.map(|v| v.0[15]),
        }
    }
}

/// One row of `features.beam`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct BeamRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub kind: ::std::string::String,
    pub span: f64,
    pub section_area: f64,
    pub volume: ::core::option::Option<f64>,
    pub share: f64,
    pub count: i64,
    pub profile: ::core::option::Option<::std::string::String>,
}

impl ::core::convert::TryFrom<BeamRow> for crate::domain::Beam {
    type Error = crate::ConversionError;

    fn try_from(row: BeamRow) -> ::core::result::Result<Self, Self::Error> {
        ::core::result::Result::Ok(Self {
            span: bonyad_units::Length(row.span),
            section_area: bonyad_units::Area(row.section_area),
            volume: row.volume.map(bonyad_units::Volume),
            share: bonyad_units::Ratio(row.share),
            count: row.count,
            profile: row
                .profile
                .as_deref()
                .map(|v| {
                    crate::domain::BeamProfile::parse(v)
                        .ok_or(crate::ConversionError::new("profile", "unknown enum value"))
                })
                .transpose()?,
        })
    }
}

impl crate::domain::Beam {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64) -> BeamRow {
        BeamRow {
            entity_id,
            revision_id,
            kind: "features.beam".to_owned(),
            span: self.span.0,
            section_area: self.section_area.0,
            volume: self.volume.map(|v| v.0),
            share: self.share.0,
            count: self.count,
            profile: self.profile.map(|v| v.as_str().to_owned()),
        }
    }
}

/// One row of `features.style`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct StyleRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub kind: ::std::string::String,
    pub name: ::std::string::String,
    pub end_x: ::core::option::Option<f64>,
    pub end_y: ::core::option::Option<f64>,
    pub end_z: ::core::option::Option<f64>,
    pub order: ::core::option::Option<i32>,
}

impl ::core::convert::TryFrom<StyleRow> for crate::domain::Style {
    type Error = crate::ConversionError;

    fn try_from(row: StyleRow) -> ::core::result::Result<Self, Self::Error> {
        ::core::result::Result::Ok(Self {
            name: row.name,
            end: {
                let parts = [row.end_x, row.end_y, row.end_z];
                if parts.iter().all(::core::option::Option::is_none) {
                    ::core::option::Option::None
                } else if parts.iter().all(::core::option::Option::is_some) {
                    let [v0, v1, v2] = parts.map(|v| v.unwrap_or_default());
                    ::core::option::Option::Some(bonyad_units::Point3 {
                        x: bonyad_units::Length(v0),
                        y: bonyad_units::Length(v1),
                        z: bonyad_units::Length(v2),
                    })
                } else {
                    return ::core::result::Result::Err(crate::ConversionError::new(
                        "end",
                        "some components are null and some are not",
                    ));
                }
            },
            order: row.order,
        })
    }
}

impl crate::domain::Style {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64) -> StyleRow {
        StyleRow {
            entity_id,
            revision_id,
            kind: "features.style".to_owned(),
            name: self.name,
            end_x: self.end.map(|v| v.x.0),
            end_y: self.end.map(|v| v.y.0),
            end_z: self.end.map(|v| v.z.0),
            order: self.order,
        }
    }
}

/// One row of `features.wall`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct WallRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub type_code: ::std::string::String,
    pub height: f64,
    #[sqlx(rename = "type")]
    pub r#type: ::std::string::String,
    pub offset_x: ::core::option::Option<f64>,
    pub offset_y: ::core::option::Option<f64>,
    pub direction_x: ::core::option::Option<f64>,
    pub direction_y: ::core::option::Option<f64>,
    pub direction_z: ::core::option::Option<f64>,
    pub built_on: ::core::option::Option<::time::Date>,
    pub recorded_at: ::core::option::Option<::time::OffsetDateTime>,
    pub payload: ::core::option::Option<::std::vec::Vec<u8>>,
    pub tolerances: ::std::vec::Vec<f64>,
    pub angles: ::core::option::Option<::std::vec::Vec<f64>>,
    pub host: ::core::option::Option<::uuid::Uuid>,
    #[sqlx(rename = "self")]
    pub self_: i32,
    pub tag: ::std::string::String,
}

impl ::core::convert::TryFrom<WallRow> for crate::domain::Wall {
    type Error = crate::ConversionError;

    fn try_from(row: WallRow) -> ::core::result::Result<Self, Self::Error> {
        ::core::result::Result::Ok(Self {
            height: bonyad_units::Length(row.height),
            r#type: crate::domain::WallType::parse(&row.r#type)
                .ok_or(crate::ConversionError::new("type", "unknown enum value"))?,
            offset: {
                let parts = [row.offset_x, row.offset_y];
                if parts.iter().all(::core::option::Option::is_none) {
                    ::core::option::Option::None
                } else if parts.iter().all(::core::option::Option::is_some) {
                    let [v0, v1] = parts.map(|v| v.unwrap_or_default());
                    ::core::option::Option::Some(bonyad_units::Point2 {
                        x: bonyad_units::Length(v0),
                        y: bonyad_units::Length(v1),
                    })
                } else {
                    return ::core::result::Result::Err(crate::ConversionError::new(
                        "offset",
                        "some components are null and some are not",
                    ));
                }
            },
            direction: {
                let parts = [row.direction_x, row.direction_y, row.direction_z];
                if parts.iter().all(::core::option::Option::is_none) {
                    ::core::option::Option::None
                } else if parts.iter().all(::core::option::Option::is_some) {
                    let [v0, v1, v2] = parts.map(|v| v.unwrap_or_default());
                    ::core::option::Option::Some(bonyad_units::Vector3 {
                        x: v0,
                        y: v1,
                        z: v2,
                    })
                } else {
                    return ::core::result::Result::Err(crate::ConversionError::new(
                        "direction",
                        "some components are null and some are not",
                    ));
                }
            },
            built_on: row.built_on,
            recorded_at: row.recorded_at,
            payload: row.payload,
            tolerances: row
                .tolerances
                .into_iter()
                .map(bonyad_units::Length)
                .collect(),
            angles: row
                .angles
                .map(|v| v.into_iter().map(bonyad_units::Angle).collect()),
            host: row.host,
            self_: row.self_,
            tag: row.tag,
        })
    }
}

impl crate::domain::Wall {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(
        self,
        entity_id: ::uuid::Uuid,
        revision_id: i64,
        type_code: impl ::core::convert::Into<::std::string::String>,
    ) -> WallRow {
        WallRow {
            entity_id,
            revision_id,
            type_code: type_code.into(),
            height: self.height.0,
            r#type: self.r#type.as_str().to_owned(),
            offset_x: self.offset.map(|v| v.x.0),
            offset_y: self.offset.map(|v| v.y.0),
            direction_x: self.direction.map(|v| v.x),
            direction_y: self.direction.map(|v| v.y),
            direction_z: self.direction.map(|v| v.z),
            built_on: self.built_on,
            recorded_at: self.recorded_at,
            payload: self.payload,
            tolerances: self.tolerances.into_iter().map(|x| x.0).collect(),
            angles: self.angles.map(|v| v.into_iter().map(|x| x.0).collect()),
            host: self.host,
            self_: self.self_,
            tag: self.tag,
        }
    }
}

/// One row of `features.wall_layer`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct WallLayerRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub position: i32,
    pub thickness: f64,
    pub material: ::std::string::String,
}

impl ::core::convert::From<WallLayerRow> for crate::domain::WallLayer {
    fn from(row: WallLayerRow) -> Self {
        Self {
            thickness: bonyad_units::Length(row.thickness),
            material: row.material,
        }
    }
}

impl crate::domain::WallLayer {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(
        self,
        entity_id: ::uuid::Uuid,
        revision_id: i64,
        position: i32,
    ) -> WallLayerRow {
        WallLayerRow {
            entity_id,
            revision_id,
            position,
            thickness: self.thickness.0,
            material: self.material,
        }
    }
}

/// One row of `features.wall_standard`.
#[derive(Debug, Clone, PartialEq, ::sqlx::FromRow)]
pub struct WallStandardRow {
    pub entity_id: ::uuid::Uuid,
    pub revision_id: i64,
    pub kind: ::std::string::String,
}

impl ::core::convert::From<WallStandardRow> for crate::domain::WallStandard {
    fn from(_row: WallStandardRow) -> Self {
        Self {}
    }
}

impl crate::domain::WallStandard {
    /// The row for this value, with the key columns the value does not carry.
    pub fn into_row(self, entity_id: ::uuid::Uuid, revision_id: i64) -> WallStandardRow {
        WallStandardRow {
            entity_id,
            revision_id,
            kind: "features.wall_standard".to_owned(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn element_round_trips_filled() {
        let row = ElementRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            type_code: "features.beam".to_owned(),
            label: ::core::option::Option::Some("x".to_owned()),
            placement_m00: ::core::option::Option::Some(1.75),
            placement_m01: ::core::option::Option::Some(2.00),
            placement_m02: ::core::option::Option::Some(2.25),
            placement_m03: ::core::option::Option::Some(2.50),
            placement_m10: ::core::option::Option::Some(2.75),
            placement_m11: ::core::option::Option::Some(3.00),
            placement_m12: ::core::option::Option::Some(3.25),
            placement_m13: ::core::option::Option::Some(3.50),
            placement_m20: ::core::option::Option::Some(3.75),
            placement_m21: ::core::option::Option::Some(4.00),
            placement_m22: ::core::option::Option::Some(4.25),
            placement_m23: ::core::option::Option::Some(4.50),
            placement_m30: ::core::option::Option::Some(4.75),
            placement_m31: ::core::option::Option::Some(5.00),
            placement_m32: ::core::option::Option::Some(5.25),
            placement_m33: ::core::option::Option::Some(5.50),
        };
        let value =
            <crate::domain::Element as ::core::convert::TryFrom<ElementRow>>::try_from(row.clone())
                .expect("converts");
        assert_eq!(
            value.into_row(row.entity_id, row.revision_id, row.type_code.clone()),
            row
        );
    }
    #[test]
    fn element_round_trips_nulls() {
        let row = ElementRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            type_code: "features.beam".to_owned(),
            label: ::core::option::Option::None,
            placement_m00: ::core::option::Option::None,
            placement_m01: ::core::option::Option::None,
            placement_m02: ::core::option::Option::None,
            placement_m03: ::core::option::Option::None,
            placement_m10: ::core::option::Option::None,
            placement_m11: ::core::option::Option::None,
            placement_m12: ::core::option::Option::None,
            placement_m13: ::core::option::Option::None,
            placement_m20: ::core::option::Option::None,
            placement_m21: ::core::option::Option::None,
            placement_m22: ::core::option::Option::None,
            placement_m23: ::core::option::Option::None,
            placement_m30: ::core::option::Option::None,
            placement_m31: ::core::option::Option::None,
            placement_m32: ::core::option::Option::None,
            placement_m33: ::core::option::Option::None,
        };
        let value =
            <crate::domain::Element as ::core::convert::TryFrom<ElementRow>>::try_from(row.clone())
                .expect("converts");
        assert_eq!(
            value.into_row(row.entity_id, row.revision_id, row.type_code.clone()),
            row
        );
    }
    #[test]
    fn element_placement_rejects_partial_null() {
        let row = ElementRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            type_code: "features.beam".to_owned(),
            label: ::core::option::Option::None,
            placement_m00: ::core::option::Option::Some(1.75),
            placement_m01: ::core::option::Option::None,
            placement_m02: ::core::option::Option::None,
            placement_m03: ::core::option::Option::None,
            placement_m10: ::core::option::Option::None,
            placement_m11: ::core::option::Option::None,
            placement_m12: ::core::option::Option::None,
            placement_m13: ::core::option::Option::None,
            placement_m20: ::core::option::Option::None,
            placement_m21: ::core::option::Option::None,
            placement_m22: ::core::option::Option::None,
            placement_m23: ::core::option::Option::None,
            placement_m30: ::core::option::Option::None,
            placement_m31: ::core::option::Option::None,
            placement_m32: ::core::option::Option::None,
            placement_m33: ::core::option::Option::None,
        };
        assert!(
            <crate::domain::Element as ::core::convert::TryFrom<ElementRow>>::try_from(row)
                .is_err()
        );
    }

    #[test]
    fn beam_round_trips_filled() {
        let row = BeamRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "features.beam".to_owned(),
            span: 1.50,
            section_area: 1.75,
            volume: ::core::option::Option::Some(2.00),
            share: 2.25,
            count: 5,
            profile: ::core::option::Option::Some("i".to_owned()),
        };
        let value =
            <crate::domain::Beam as ::core::convert::TryFrom<BeamRow>>::try_from(row.clone())
                .expect("converts");
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }
    #[test]
    fn beam_round_trips_nulls() {
        let row = BeamRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "features.beam".to_owned(),
            span: 1.50,
            section_area: 1.75,
            volume: ::core::option::Option::None,
            share: 2.25,
            count: 5,
            profile: ::core::option::Option::None,
        };
        let value =
            <crate::domain::Beam as ::core::convert::TryFrom<BeamRow>>::try_from(row.clone())
                .expect("converts");
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }

    #[test]
    fn style_round_trips_filled() {
        let row = StyleRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "features.style".to_owned(),
            name: "x".to_owned(),
            end_x: ::core::option::Option::Some(1.75),
            end_y: ::core::option::Option::Some(2.00),
            end_z: ::core::option::Option::Some(2.25),
            order: ::core::option::Option::Some(5),
        };
        let value =
            <crate::domain::Style as ::core::convert::TryFrom<StyleRow>>::try_from(row.clone())
                .expect("converts");
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }
    #[test]
    fn style_round_trips_nulls() {
        let row = StyleRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "features.style".to_owned(),
            name: "x".to_owned(),
            end_x: ::core::option::Option::None,
            end_y: ::core::option::Option::None,
            end_z: ::core::option::Option::None,
            order: ::core::option::Option::None,
        };
        let value =
            <crate::domain::Style as ::core::convert::TryFrom<StyleRow>>::try_from(row.clone())
                .expect("converts");
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }
    #[test]
    fn style_end_rejects_partial_null() {
        let row = StyleRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "features.style".to_owned(),
            name: "x".to_owned(),
            end_x: ::core::option::Option::Some(1.75),
            end_y: ::core::option::Option::None,
            end_z: ::core::option::Option::None,
            order: ::core::option::Option::None,
        };
        assert!(
            <crate::domain::Style as ::core::convert::TryFrom<StyleRow>>::try_from(row).is_err()
        );
    }

    #[test]
    fn wall_round_trips_filled() {
        let row = WallRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            type_code: "features.wall".to_owned(),
            height: 1.50,
            r#type: "straight".to_owned(),
            offset_x: ::core::option::Option::Some(2.00),
            offset_y: ::core::option::Option::Some(2.25),
            direction_x: ::core::option::Option::Some(2.50),
            direction_y: ::core::option::Option::Some(2.75),
            direction_z: ::core::option::Option::Some(3.00),
            built_on: ::core::option::Option::Some(
                ::time::Date::from_calendar_date(2026, ::time::Month::October, 23)
                    .expect("valid date"),
            ),
            recorded_at: ::core::option::Option::Some(::time::OffsetDateTime::UNIX_EPOCH),
            payload: ::core::option::Option::Some(vec![1, 2, 3]),
            tolerances: vec![4.00],
            angles: ::core::option::Option::Some(vec![4.25]),
            host: ::core::option::Option::Some(::uuid::Uuid::from_u128(13)),
            self_: 14,
            tag: "x".to_owned(),
        };
        let value =
            <crate::domain::Wall as ::core::convert::TryFrom<WallRow>>::try_from(row.clone())
                .expect("converts");
        assert_eq!(
            value.into_row(row.entity_id, row.revision_id, row.type_code.clone()),
            row
        );
    }
    #[test]
    fn wall_round_trips_nulls() {
        let row = WallRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            type_code: "features.wall".to_owned(),
            height: 1.50,
            r#type: "straight".to_owned(),
            offset_x: ::core::option::Option::None,
            offset_y: ::core::option::Option::None,
            direction_x: ::core::option::Option::None,
            direction_y: ::core::option::Option::None,
            direction_z: ::core::option::Option::None,
            built_on: ::core::option::Option::None,
            recorded_at: ::core::option::Option::None,
            payload: ::core::option::Option::None,
            tolerances: vec![4.00],
            angles: ::core::option::Option::None,
            host: ::core::option::Option::None,
            self_: 14,
            tag: "x".to_owned(),
        };
        let value =
            <crate::domain::Wall as ::core::convert::TryFrom<WallRow>>::try_from(row.clone())
                .expect("converts");
        assert_eq!(
            value.into_row(row.entity_id, row.revision_id, row.type_code.clone()),
            row
        );
    }
    #[test]
    fn wall_offset_rejects_partial_null() {
        let row = WallRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            type_code: "features.wall".to_owned(),
            height: 1.50,
            r#type: "straight".to_owned(),
            offset_x: ::core::option::Option::Some(2.00),
            offset_y: ::core::option::Option::None,
            direction_x: ::core::option::Option::None,
            direction_y: ::core::option::Option::None,
            direction_z: ::core::option::Option::None,
            built_on: ::core::option::Option::None,
            recorded_at: ::core::option::Option::None,
            payload: ::core::option::Option::None,
            tolerances: vec![4.00],
            angles: ::core::option::Option::None,
            host: ::core::option::Option::None,
            self_: 14,
            tag: "x".to_owned(),
        };
        assert!(<crate::domain::Wall as ::core::convert::TryFrom<WallRow>>::try_from(row).is_err());
    }
    #[test]
    fn wall_direction_rejects_partial_null() {
        let row = WallRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            type_code: "features.wall".to_owned(),
            height: 1.50,
            r#type: "straight".to_owned(),
            offset_x: ::core::option::Option::None,
            offset_y: ::core::option::Option::None,
            direction_x: ::core::option::Option::Some(2.50),
            direction_y: ::core::option::Option::None,
            direction_z: ::core::option::Option::None,
            built_on: ::core::option::Option::None,
            recorded_at: ::core::option::Option::None,
            payload: ::core::option::Option::None,
            tolerances: vec![4.00],
            angles: ::core::option::Option::None,
            host: ::core::option::Option::None,
            self_: 14,
            tag: "x".to_owned(),
        };
        assert!(<crate::domain::Wall as ::core::convert::TryFrom<WallRow>>::try_from(row).is_err());
    }

    #[test]
    fn wall_layer_round_trips_filled() {
        let row = WallLayerRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            position: 3,
            thickness: 1.50,
            material: "x".to_owned(),
        };
        let value = crate::domain::WallLayer::from(row.clone());
        assert_eq!(
            value.into_row(row.entity_id, row.revision_id, row.position),
            row
        );
    }

    #[test]
    fn wall_standard_round_trips_filled() {
        let row = WallStandardRow {
            entity_id: ::uuid::Uuid::from_u128(100),
            revision_id: 7,
            kind: "features.wall_standard".to_owned(),
        };
        let value = crate::domain::WallStandard::from(row.clone());
        assert_eq!(value.into_row(row.entity_id, row.revision_id), row);
    }
}
