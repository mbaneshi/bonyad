// Attributes the LandXML 1.2 XSD carries although they follow from other data of the same
// element (stored length of a line, the delta of a curve, a parcel's area ...). They stay in the
// catalogue because the format carries them, and are marked in `meaning` as claims to verify
// (catalogue rule 2: derived values are never authority). Judgement list; see GAPS.md.
export const REDUNDANT: Record<string, string[]> = {
  Line: ["length", "dir"],
  Curve: ["chord", "delta", "dirEnd", "dirStart", "external", "length", "midOrd", "radius", "tangent"],
  Spiral: ["chord", "constant", "dirEnd", "dirStart", "theta", "totalX", "totalY", "tanLong", "tanShort"],
  Parcel: ["area", "dirClosure", "distClosure"],
  Definition: ["area2DSurf", "area3DSurf", "elevMax", "elevMin"],
};
