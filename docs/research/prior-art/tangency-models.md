# Prior art: the Tangency Labs `models` repository (a governed fixture set, with no models yet)

**Status:** research, not decisions. Read directly by the author of this note; nothing was run.
Repo `tangency-labs/models` at commit `57abdd6f71c4202fcda78d19dcfdb54dde80a7a9` (2026-10-20),
cloned to `refs/models` (216 KB). Licence: CC0-1.0 (the `LICENSE` file and README; not a legal
review). Inventory entry:
[`../code-inventory/tangency-labs-code-inventory.md`](../code-inventory/tangency-labs-code-inventory.md).

## What it contains

**At this commit it contains no model files.** The tracked files are:

- `README.md` (rules), `LICENSE`, `DISCLAIMER.md`, `.gitignore`;
- one `README.md` per format folder: `step/`, `iges/`, `3mf/`, `stl/`, `obj/`, `gltf/`, `ply/`;
- `results/README.md` and `results/TEMPLATE.md`;
- `scripts/check.py` (137 lines) and `scripts/test_check.py` (80 lines);
- `.github/workflows/ci.yml` and `.github/CODEOWNERS`.

The clone is shallow with one visible commit ("CI: check every pull request against the
README's rules"), so earlier history, if any, was not seen. The tree at `HEAD` has no model
folders, so **it cannot supply fixtures today.**

## The rules it enforces (Verified from `README.md` and `scripts/check.py`)

| Rule | Detail |
|---|---|
| Licence | A model must be the contributor's own work or already CC0-1.0. Other licences are not accepted, CC-BY included, "because the repository has one licence for every file" |
| Exclusions | Confidential or NDA parts; export-controlled designs; copies of commercial products or trademarked shapes; anything from datasets or sites with their own terms (named: ABC, MAMBO, Thingi10K, GrabCAD, Thingiverse, vendor sample libraries); native commercial CAD formats (`.prt`, `.sldprt`, `.catpart`, `.ipt`, `.f3d`, `.x_t`, `.sat`) |
| Layout | `<format>/<model>/<file>` plus a model `README.md`, one level deep; lower-case names with hyphens; each file under 50 MB |
| Required README fields | **Author, Made with** (software, version, export settings), **Size** (bodies, faces, edges, or triangles and vertices), **SHA-256**; also a name, a one-line description and "why it is interesting" |
| Hash check | `check.py` computes each model file's SHA-256 and **fails if the model's README does not contain it** (companion files such as `.mtl`, `.bin` and textures are exempt) |
| File types | `step` (`.step`, `.stp`), `iges` (`.iges`, `.igs`), `3mf`, `stl`, `obj` (plus `.mtl` and textures), `gltf` (`.gltf`, `.glb`, `.bin`, textures), `ply` |
| Results | `results/<yyyy-mm-dd>-<handle>-<software>.md` from `TEMPLATE.md` |
| CI | Runs the checker's own tests and then `scripts/check.py` on every pull request (standard-library Python only) |

## The benchmark protocol it defines

A result records: the model path and SHA-256; the software name, version and import settings
(healing, tessellation tolerance, units); the machine (CPU, cores and threads, RAM, GPU and
driver, storage, operating system); **what was timed and from where to where**; whether the
file was cold or in the OS cache; the **median of at least 3 runs** plus the minimum and
maximum; and peak memory if measurable. Results are "the submitters' own measurements,
published as submitted and not verified or endorsed". The README warns that some commercial
licences forbid publishing benchmarks.

## What it means for Bonyad (Interpretation)

1. **It is a governance pattern, not a corpus.** The useful ideas: one licence per repository;
   a mandatory provenance record per fixture (author, tool, settings); a **content hash
   enforced by CI**, so a benchmark names its exact input; and a results template that forces
   the environment to be stated.
2. **It states no expected values.** "Size" is free text; there is no mass, volume or
   face-count field a verifier could assert against. A Bonyad fixture rule should add a
   machine-readable expected-values block (with the source of each value) and a tolerance with
   a reason, in the style of the FieldCraft oracle cases
   ([`fieldcraft.md`](fieldcraft.md), section C).
3. **Its formats do not cover the format brief's corpus.** No DXF, IFC, LandXML, GeoPackage or
   USD. Only STEP, IGES, 3MF, STL, OBJ, glTF and PLY.
4. **Its exclusion list is a licensing stance, not a technical one.** Rejecting datasets with
   their own terms keeps redistribution simple; it does not restrict what Bonyad may study.

## Not verified

- The checker and its tests were not run.
- Earlier history and any model folders on other branches (only the shallow `HEAD` was seen).
- The CC0 claim beyond reading the `LICENSE` file and the README.
