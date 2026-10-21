# Procedure study: polygon area, planar and geodesic

**Body of knowledge:** C (procedures). **Discipline:** surveying, 2D geometry.

## Record

| Field | Planar area (shoelace) | Geodesic polygon area |
|---|---|---|
| Purpose | Area enclosed by a ring in a plane | Area enclosed by geodesic edges on an ellipsoid |
| Typed inputs | Ring of (x, y) in one linear unit | Ring of (latitude, longitude) in degrees on a stated ellipsoid |
| Outputs | Signed area in unit squared (positive for counter-clockwise) | Signed area in m^2 and perimeter in m |
| Frame / units | Any Cartesian frame; result is only as good as the frame | Geographic CRS on WGS84 in `geographiclib-rs` and `geo` |
| Basis | Green's theorem, sum of cross products | Area under a geodesic, Karney (2013) section 6, series in `I4` |
| Assumptions | Simple (non-self-intersecting) ring; vertices in order | Edges are geodesics; signed API assumes polygons smaller than half the Earth |
| Tolerances | Bonyad: absolute `1e-9` in `ZERO_AREA_EPS` (`logic/crates/geometry/src/validate.rs`) | Library-defined; see below |
| Failure modes | Self-intersection gives a meaningless sum; huge coordinates lose precision | Wrong winding or very large rings give wrong or negative results (`geo` docs) |
| Implementation | `bonyad-geometry` `signed_area` (verified in source) | `geographiclib-rs` 0.2.7 (MIT), `geo` 0.33.1 (MIT OR Apache-2.0) |

## Sources (all accessed 2026-10-21)

- **Verified.** Karney, "Algorithms for geodesics", J. Geodesy 87(1), 43-55 (2013),
  DOI 10.1007/s00190-012-0578-z, arXiv:1109.4448, via
  https://geographiclib.sourceforge.io/geod.html (GeographicLib, MIT licence).
- **Verified.** Test set `GeodTest.dat.gz`: 500,000 WGS84 cases (100,000 random plus
  50,000 in each of eight special categories), 10 columns, `S12` (area under the
  geodesic) accurate to 1 mm^2, from
  https://geographiclib.sourceforge.io/C++/doc/geodesic.html (Zenodo
  DOI 10.5281/zenodo.32156). The page does not give a polygon-area accuracy figure.
- **Verified.** `geo` 0.33.1 `GeodesicArea` uses Karney (2013), signed methods require
  counter-clockwise exteriors and clockwise holes, and rings under half the Earth
  (https://docs.rs/geo/latest/geo/algorithm/geodesic_area/trait.GeodesicArea.html).
  The page does not name the ellipsoid or state axis order explicitly (examples use
  longitude as `x`).
- **Verified.** crates.io API: `geographiclib-rs` 0.2.7, MIT, updated 2026-02-17;
  `geo` 0.33.1, MIT OR Apache-2.0. The `geographiclib-rs` README lists `direct`,
  `inverse` and `PolygonArea`, and makes no claim about passing GeodTest.
- **Verified.** Bonyad's own implementation: `measure.rs` computes `signed_area` by the
  shoelace formula (positive counter-clockwise) and `area` as its absolute value.

## Reference case (run, not asserted)

Four vertices on WGS84 starting at 25.2 N, 55.27 E: walk 1000 m east, then south, then
west (geodesic direct problems), close the ring. Compare the geodesic area with the planar
shoelace area of the same vertices in a local azimuthal-equidistant frame (origin at
vertex 0; coordinates from the geodesic inverse problem). `geographiclib` 2.1 (Python),
run with `uv run --with geographiclib python -I refcase.py`:

| Walk length | Geodesic area (m^2) | Planar area, local frame (m^2) | Relative difference |
|---|---|---|---|
| 1,000 m | 1,000,036.8630 | 1,000,036.8630 | 1.4e-13 |
| 10,000 m | 100,036,832.3075 | 100,036,832.3301 | 2.3e-10 |
| 100,000 m | 10,036,526,077.4339 | 10,036,528,328.3301 | 2.2e-7 |

Also **Verified** by the same run: reading a `(north, east)` pair as `(x, y)` flips the
sign of the shoelace result for the same ring. A LandXML `CgPoint` read naively therefore
reverses the winding.

```python
import math
from geographiclib.geodesic import Geodesic
from geographiclib.polygonarea import PolygonArea
g = Geodesic.WGS84
lat0, lon0 = 25.2, 55.27
def run(side):
    pts = [(lat0, lon0)]
    for a in (90, 180, 270):
        la, lo = pts[-1]; r = g.Direct(la, lo, a, side); pts.append((r['lat2'], r['lon2']))
    pa = PolygonArea(g, False)
    for la, lo in pts: pa.AddPoint(la, lo)
    _, _, geo = pa.Compute(False, True)
    E, N = [], []
    for la, lo in pts:
        r = g.Inverse(lat0, lon0, la, lo); s = r['s12']; z = math.radians(r['azi1'])
        E.append(s * math.sin(z)); N.append(s * math.cos(z))
    sh = 0.5 * sum(E[i] * N[(i + 1) % 4] - E[(i + 1) % 4] * N[i] for i in range(4))
    return abs(geo), abs(sh)
for side in (1000, 10000, 100000):
    geo, sh = run(side)
    print(side, geo, sh, (geo - sh) / geo)
```

### What this does and does not show

- **Interpretation.** Within about 10 km, planar area in an equidistant local frame is
  indistinguishable from geodesic area for engineering purposes. The frame matters: this
  is the best case.
- **Not tested (H1).** A *projected* CRS such as a UTM zone has a scale factor (about
  0.9996 at the central meridian for UTM) that changes areas by roughly twice that
  fraction. The reference case does not measure that; it must not be cited as a
  statement about projected coordinates. The scale factor is background knowledge, not
  verified in this batch.
- **Not tested.** GeodTest itself was not downloaded or run against any Rust code.

## Suitability for Bonyad

Keep the planar procedure in the pure geometry crate. A geodesic procedure should be a
separate procedure behind an interface that names its CRS and ellipsoid, owned by one
executable (a Rust library), not re-implemented. Recommendation R3.
