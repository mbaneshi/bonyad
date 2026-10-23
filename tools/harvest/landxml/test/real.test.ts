// Runs against the real LandXML 1.2 XSD when LANDXML_XSD points at it (the file is not stored in
// the repository: its licence is not stated, see catalogue/landxml/SOURCES.md).
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildCatalogue } from "../src/build.ts";
import { coverage, count, unrepresentedElements } from "../src/check.ts";
import { LICENCE, XSD_SHA256, XSD_URL } from "../src/cli.ts";
import { REDUNDANT } from "../src/redundant.ts";
import { parseXsd } from "../src/xsd.ts";
import { createHash } from "node:crypto";

const path = process.env.LANDXML_XSD;

test.skipIf(!path)("real XSD: checksum, full attribute coverage, no dangling references", () => {
  const bytes = readFileSync(path!);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(XSD_SHA256);
  const schema = parseXsd(bytes.toString("utf8"));
  const { entries, unreachable, dropped } = buildCatalogue(schema, { accessedOn: "2026-10-23", sourceUrl: XSD_URL, xsdSha256: XSD_SHA256, licence: LICENCE, redundant: REDUNDANT });
  const c = count(entries);
  expect(unreachable).toEqual([]);
  expect(dropped).toEqual([]);
  expect(unrepresentedElements(schema, entries)).toEqual([]);
  expect(c.danglingRefs).toEqual([]);
  expect(c.danglingBases).toEqual([]);
  expect(c.danglingParents).toEqual([]);
  expect(coverage(schema, entries).missing).toEqual([]);
  expect(c.types).toBeGreaterThan(150);
});
