# LandXML 1.2 harvester

Reads the LandXML 1.2 XSD and writes one catalogue YAML per element to `catalogue/landxml/`
(format: `catalogue/FORMAT.md`, validator: `tools/catalogue`). The generated YAML is gitignored
(licence gate, see `catalogue/landxml/SOURCES.md`); regenerate it locally.

## Reproduce
```sh
curl -O http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd   # 225,951 bytes
cd tools/harvest/landxml && bun install
bun run harvest --xsd /path/to/LandXML-1.2.xsd --out ../../../catalogue/landxml   # refuses a file with another SHA-256
bun run check   --xsd /path/to/LandXML-1.2.xsd --dir ../../../catalogue/landxml    # counts + attribute coverage
LANDXML_XSD=/path/to/LandXML-1.2.xsd bun test                                      # includes the real-XSD test
(cd ../catalogue && bun run validate ../../catalogue)                              # format validator
```
Without `LANDXML_XSD` the real-XSD test is skipped; the rest runs on a small fixture.

## Modelling rules
See the header of `src/build.ts` (R1 to R6) plus the kind normalisation in `normaliseKinds`:
a type that contains other types, has a `base` or is a base is an `object` with a nullable
`container` reference to its XSD container; only leaf rows are ordered `child` types.
The coordinate text of a point element is the field `coordinates` (point3, x = easting, y = northing),
because `position` is reserved by the format.
