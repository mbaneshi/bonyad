// Pinned inputs. Changing any of this changes the catalogue: re-run harvest and review the diff.
export const REPO = "PixarAnimationStudios/OpenUSD";
export const COMMIT = "bc32a655a41770f8ded78ef43789b044be1ba5ea";
export const COMMIT_DATE = "2026-10-13";
export const VERSION = "OpenUSD development tree at commit bc32a65 (cmake/defaults/Version.cmake reads 0.27.2)";
export const ACCESSED_ON = "2026-10-23";
export const LICENCE =
  "Tomorrow Open Source Technology License 1.0 (Apache License 2.0 with a different Section 6, Trademarks); see LICENSE.txt at the pinned commit";

/** Every schema.usda that ships a library (test and codegen-template copies are excluded). */
export const MODULES = [
  "usd",
  "usdGeom",
  "usdShade",
  "usdLux",
  "usdSkel",
  "usdPhysics",
  "usdRender",
  "usdVol",
  "usdMedia",
  "usdUI",
  "usdProc",
  "usdMtlx",
  "usdLod",
  "usdSemantics",
  "usdProfiles",
  "usdRi",
  "usdHydra",
] as const;
