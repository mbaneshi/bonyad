// DXF group-code value types, copied from ezdxf/src/ezdxf/lldxf/types.py (the same table the
// Autodesk DXF reference publishes as "Group Code Value Types"). Used for types harvested from ezdxf only.
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
const set = (...r: number[][]) => new Set(r.flat());
export const INT16 = set(range(60, 80), range(170, 180), range(270, 290), range(370, 390), range(400, 410), range(1060, 1071));
export const INT32 = set(range(90, 100), range(420, 430), range(440, 450), range(450, 460), [1071]);
export const INT64 = set(range(160, 170));
export const DOUBLE = set(range(10, 60), range(110, 150), range(210, 240), range(460, 470), range(1010, 1060));
export const BOOL = set(range(290, 300));
export const BINARY = new Set([310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 1004]);
export const POINTER = set(range(320, 370), range(390, 400), [480, 481, 1005]);
export const POINT_CODES = new Set([10, 11, 12, 13, 14, 15, 16, 17, 18, 110, 111, 112, 210, 211, 212, 213, 1010, 1011, 1012, 1013]);
