// Pinned inputs. Changing any of this changes the catalogue: re-run harvest and review the diff.
export const REPO = "KhronosGroup/glTF";
export const COMMIT = "7cee0fcddd5730e90d488bfb5aa2e52171483dde";
export const ACCESSED_ON = "2026-10-23";
export const VERSION = "glTF 2.0 (KhronosGroup/glTF at commit 7cee0fc)";
export const CORE_DIR = "specification/2.0/schema";
export const EXT_DIR = "extensions/2.0/Khronos";
export const CORE_LICENCE = "CC-BY-4.0 (specification schemas, per COPYING.adoc and LICENSE.adoc)";
export const EXT_LICENCE = "LicenseRef-KhronosSpecCopyright (Khronos Specification Copyright; KHR extensions, per COPYING.adoc)";
/**
 * The KHR extension schemas are NOT under CC-BY: reproducing their text is restricted. While this is true the harvester
 * copies only structure (names, types, defaults, ranges, enum values) from them and writes its own neutral wording.
 * Flip to false only after the licence question is settled.
 */
export const WITHHOLD_EXTENSION_TEXT = true;
