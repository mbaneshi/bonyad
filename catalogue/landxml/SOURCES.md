# LandXML 1.2 catalogue: sources and licence decision

## Sources
| Source | URL | Version / pin | Licence | Accessed |
|---|---|---|---|---|
| LandXML 1.2 XML Schema (the only input of the harvest) | http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd | 1.2, posted 2008-07-29; 225,951 bytes; SHA-256 `f4f732341970a923943f94592a3fde0838534515d564a699761e85420fad4d77` (the harvester refuses any other file) | **Not stated** in the file (no copyright or licence text in the XSD) | 2026-10-23 |
| LandXML 1.2 SDK (read for licence evidence only; nothing taken from it) | http://www.landxml.org/ (sdk12.zip, SHA-256 `e7b889757587efd1b1546783e280c744f6bbb15e19925ebc2521a10590a10c11`) | SDK 1.2, build 2008-08-18 | "The LandXML.org Open Software License, Version 1.0", a BSD-style licence: (c) 1999-2006 LandXML.org, redistribution and use in source and binary forms with attribution and disclaimer; originally based on Autodesk software (c) 2002-2006 | 2026-10-23 |
| LandXML.org documentation pages (doc12.zip, Spec.html) | http://www.landxml.org/ | not used for content; element meanings come from the XSD's own `xs:documentation` | n/a | 2026-10-23 |

Harvester: `tools/harvest/landxml/` (reproduction steps in its README). Known gaps: `GAPS.md`. Hand review: `REVIEW.md`.

## Licence decision
The issue says the licence was previously marked unknown. Finding: the BSD-style LandXML.org Open Software
License is printed in the SDK sources and says "This software" and "source and binary forms"; it is
written for the SDK software, and nothing in the XSD or on the pages read says it extends to the schema
itself. The schema file has no licence text. So the licence of the schema is **unclear**, and the
catalogue YAML reproduces its element names, attribute names, enumeration values and documentation
sentences (restructured, but plainly derived).

Decision (2026-10-23, issue #54):
- The maintainer decided the generated YAML is safe to publish, and `catalogue/landxml/*.yaml` is now committed. LandXML.org has not confirmed in writing that its Open Software License covers the schema; this is the maintainer's risk decision, not a licence grant.
- As if the BSD-style text applied, the notice "Copyright (c) 1999-2006 LandXML.org", the licence conditions and the disclaimer are kept in `NOTICE`.
- The 170 YAML files regenerate from the pinned XSD (checksum above).
- If LandXML.org objects, remove `catalogue/landxml/*.yaml` and restore the ignore rule.

This is an engineering decision, not legal advice.
