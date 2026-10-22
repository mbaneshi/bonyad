//! Unit newtypes for the generated catalogue crates (`logic/generated/*`).
//!
//! A `Length` is in the project's declared length unit, an `Angle` is always in radians. The
//! newtypes exist so a generated type cannot confuse the two. Pure: no I/O, no database.

use serde::{Deserialize, Serialize};

macro_rules! scalar_unit {
    ($(#[$doc:meta])* $name:ident) => {
        $(#[$doc])*
        #[derive(Debug, Clone, Copy, PartialEq, PartialOrd, Default, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub f64);

        impl $name {
            /// The raw number.
            pub fn get(self) -> f64 {
                self.0
            }
        }

        impl From<f64> for $name {
            fn from(value: f64) -> Self {
                Self(value)
            }
        }
    };
}

scalar_unit!(
    /// A length in the project's declared length unit.
    Length
);
scalar_unit!(
    /// An angle in radians (counter-clockwise positive unless the source says otherwise).
    Angle
);
scalar_unit!(
    /// An area in the project's length unit squared.
    Area
);
scalar_unit!(
    /// A volume in the project's length unit cubed.
    Volume
);
scalar_unit!(
    /// A dimensionless ratio.
    Ratio
);

impl Angle {
    /// Convert degrees (a source boundary concern) to radians.
    pub fn from_degrees(degrees: f64) -> Self {
        Self(degrees.to_radians())
    }

    /// The angle in degrees, for display only.
    pub fn to_degrees(self) -> f64 {
        self.0.to_degrees()
    }
}

/// A point in the plane.
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct Point2 {
    pub x: Length,
    pub y: Length,
}

/// A point in space.
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct Point3 {
    pub x: Length,
    pub y: Length,
    pub z: Length,
}

/// A direction or offset (components carry no unit of their own).
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct Vector3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// A 4x4 matrix, row-major: index `4 * row + column`. The catalogue records which convention
/// the source uses; this type never transposes.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Matrix4(pub [f64; 16]);

impl Default for Matrix4 {
    fn default() -> Self {
        Self::IDENTITY
    }
}

impl Matrix4 {
    pub const IDENTITY: Self = Self([
        1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
    ]);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newtypes_serialize_as_bare_numbers() {
        assert_eq!(serde_json::to_string(&Length(2.5)).unwrap(), "2.5");
        let a: Angle = serde_json::from_str("1.5").unwrap();
        assert_eq!(a, Angle(1.5));
    }

    #[test]
    fn degrees_convert_to_radians() {
        assert!((Angle::from_degrees(180.0).get() - std::f64::consts::PI).abs() < 1e-12);
        assert!((Angle(std::f64::consts::PI).to_degrees() - 180.0).abs() < 1e-12);
    }

    #[test]
    fn matrix_default_is_identity_and_round_trips() {
        let m = Matrix4::default();
        assert_eq!(m.0[0], 1.0);
        assert_eq!(m.0[5], 1.0);
        let json = serde_json::to_string(&m).unwrap();
        assert_eq!(serde_json::from_str::<Matrix4>(&json).unwrap(), m);
    }

    #[test]
    fn points_carry_lengths() {
        let p = Point3 {
            x: 1.0.into(),
            y: 2.0.into(),
            z: 3.0.into(),
        };
        assert_eq!(p.y.get(), 2.0);
    }
}
