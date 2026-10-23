//! Declaration macros. Every procedure is declared once, in one place, so that all of them
//! have the same shape: typed input, typed output, stable error codes, a kind and an effect.

/// Applies the wire derives (debug, clone, equality, serde) to a struct or enum.
/// Enums serialise with snake_case variant names.
macro_rules! wire {
    ($(#[$m:meta])* $v:vis struct $n:ident $($rest:tt)*) => {
        #[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
        $(#[$m])*
        $v struct $n $($rest)*
    };
    ($(#[$m:meta])* $v:vis enum $n:ident $($rest:tt)*) => {
        #[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
        #[serde(rename_all = "snake_case")]
        $(#[$m])*
        $v enum $n $($rest)*
    };
}

/// Declares entity kinds (the markers behind `Id<K>`).
macro_rules! entity_kinds {
    ($( $(#[$m:meta])* $name:ident = $s:literal ),* $(,)?) => {
        $(
            $(#[$m])*
            #[derive(Debug, Clone, Copy)]
            pub struct $name;
            impl $crate::contract::EntityKind for $name { const NAME: &'static str = $s; }
        )*
        /// Every declared entity kind name.
        pub const ALL_KINDS: &[&str] = &[ $( $s ),* ];
    };
}

/// Declares a group of procedures. For each one it generates a module with `Input`,
/// `Output`, `Error` (a copyable enum with stable string codes), a `SPEC` constant and a
/// `Spec` marker implementing [`Procedure`](crate::contract::Procedure). It also generates the
/// group's `SPECS` list.
macro_rules! procedures {
    (
        $(
            $(#[$meta:meta])*
            $name:ident {
                key: $key:literal,
                version: $ver:literal,
                kind: $kind:ident,
                effect: $effect:ident,
                input { $( $(#[$im:meta])* $if:ident : $it:ty ),* $(,)? }
                output { $( $(#[$om:meta])* $of:ident : $ot:ty ),* $(,)? }
                errors { $( $(#[$em:meta])* $ev:ident = $ec:literal ),+ $(,)? }
            }
        )*
    ) => {
        $(
            $(#[$meta])*
            pub mod $name {
                #[allow(unused_imports)]
                use super::*;

                /// Typed input. An unknown key is an error, never silently ignored.
                #[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
                #[serde(deny_unknown_fields)]
                pub struct Input { $( $(#[$im])* pub $if: $it, )* }

                /// Typed output.
                #[derive(Debug, Clone, PartialEq, ::serde::Serialize, ::serde::Deserialize)]
                pub struct Output { $( $(#[$om])* pub $of: $ot, )* }

                /// Reasons this procedure can reject its input. The string is the stable code.
                #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, ::serde::Serialize, ::serde::Deserialize)]
                pub enum Error { $( $(#[$em])* #[serde(rename = $ec)] $ev, )+ }

                impl Error {
                    /// Every error of this procedure.
                    pub const ALL: &'static [Error] = &[ $( Error::$ev ),+ ];
                    /// The stable machine-readable code.
                    pub const fn code(self) -> &'static str {
                        match self { $( Self::$ev => $ec, )+ }
                    }
                }
                impl $crate::contract::ProcedureError for Error {
                    fn code(self) -> &'static str { Error::code(self) }
                }

                /// The static description of this procedure.
                pub const SPEC: $crate::contract::ProcedureSpec = $crate::contract::ProcedureSpec {
                    key: $key,
                    version: $ver,
                    kind: $crate::contract::Kind::$kind,
                    effect: $crate::contract::Effect::$effect,
                    input_fields: &[ $( stringify!($if) ),* ],
                    output_fields: &[ $( stringify!($of) ),* ],
                    error_codes: &[ $( $ec ),+ ],
                };

                /// Marker type: the procedure as a type.
                pub struct Spec;
                impl $crate::contract::Procedure for Spec {
                    const SPEC: &'static $crate::contract::ProcedureSpec = &SPEC;
                    type Input = Input;
                    type Output = Output;
                    type Error = Error;
                }
            }
        )*

        /// The procedures declared in this group.
        pub const SPECS: &[&$crate::contract::ProcedureSpec] = &[ $( &$name::SPEC ),* ];
    };
}
