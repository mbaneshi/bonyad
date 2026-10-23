# Gaps in catalogue/acad

What the harvest could not cover, and why. Nothing here was guessed.

## Totals

- 198 types (63 entity, 10 symbol, 46 child, 64 object, 15 abstract) with 1221 fields.
- 961 ACadSharp properties carrying a group code were visited; 79 of the resulting fields have no description in either source (their `source_ref` says so and the `meaning` is the humanised property name).
- 63 types are flagged `needs_review`.

## Skipped Autodesk vertical-product classes

ACadSharp lists these classes but carries no DXF group codes for them (they belong to AutoCAD Architecture / Mechanical).

- `acad.aec_cleanup_group`: AEC_CLEANUP_GROUP_DEF (AecCleanupGroup). Autodesk Architecture/Mechanical vertical-product class; ACadSharp carries no DXF group codes for it.
- `acad.aec_wall_style`: AEC_WALL_STYLE (AecWallStyle). Autodesk Architecture/Mechanical vertical-product class; ACadSharp carries no DXF group codes for it.
- `acad.aec_bin_record`: BINRECORD (AecBinRecord). Autodesk Architecture/Mechanical vertical-product class; ACadSharp carries no DXF group codes for it.
- `acad.acm_part_list`: ACMPARTLIST (AcmPartList). Autodesk Architecture/Mechanical vertical-product class; ACadSharp carries no DXF group codes for it.
- `acad.acm_balloon`: ACMBALLOON (AcmBalloon). Autodesk Architecture/Mechanical vertical-product class; ACadSharp carries no DXF group codes for it.
- `acad.acm_part_ref`: ACMPARTREF (AcmPartRef). Autodesk Architecture/Mechanical vertical-product class; ACadSharp carries no DXF group codes for it.
- `acad.wall`: AEC_WALL (Wall). Autodesk Architecture/Mechanical vertical-product class; ACadSharp carries no DXF group codes for it.

## Types that cannot be stored under the format rules

- `acad.hatch_path_edge`: BoundaryPath.Edges. a field-less polymorphic list base; its subtypes carry the fields and an index field, so it is not stored.
- `acad.acdbplaceholder`: ACDBPLACEHOLDER. the source defines no data fields for this type (only the common object data); the format requires at least one field, so it is not stored as a table.
- `acad.vertex`: Vertex. its fields were copied into each subtype (a child type cannot have a base), so the base itself is not stored.

## Properties ACadSharp marks Ignored

They are not read or written by ACadSharp's DXF code, so no group code is certain.

- `acad.mtext`: MText.HorizontalWidth (group 42). ACadSharp marks the property Ignored (not written to or read from DXF, or derived).
- `acad.mtext`: MText.Rotation (group 50). ACadSharp marks the property Ignored (not written to or read from DXF, or derived).
- `acad.mtext`: MText.VerticalHeight (group 43). ACadSharp marks the property Ignored (not written to or read from DXF, or derived).
- `acad.plotsettings`: PlotSettings.ShadePlotIDHandle (group 333). ACadSharp marks the property Ignored (not written to or read from DXF, or derived).

## Properties with no mapping

- `acad.plotsettings`: PlotSettings.UnprintableMargin: PaperMargin. no mapping rule for this type.

## Types taken from ezdxf only

ACadSharp has no class for these DXF types; their fields come from ezdxf's attribute tables (`(fields from ezdxf)` means only part of the type was modelled there). Aliases mean ezdxf defines the type as a subclass with no attribute table of its own.

- LIGHT
- SUN
- HELIX
- MPOLYGON
- LARGE_RADIAL_DIMENSION
- TRACE
- PDFREFERENCE
- DWFUNDERLAY
- DGNUNDERLAY
- DWFDEFINITION
- DGNDEFINITION
- CLASS
- FIELDLIST (fields from ezdxf)
- REVOLVEDSURFACE (fields from ezdxf)
- 3DSOLID (fields from ezdxf)
- IMAGE (fields from ezdxf)
- BODY (fields from ezdxf)
- LOFTEDSURFACE (fields from ezdxf)
- EXTRUDEDSURFACE (fields from ezdxf)
- ATTRIB (fields from ezdxf)
- SWEPTSURFACE (fields from ezdxf)

## Structural adjustments forced by the format (FORMAT.md rules 5 and 9)

- flattened: 10
- reparented: 12
- dedupedFields: 1
- renamed: 3
- dropped: 3
- refsLoosened: 1
- rebased: 2

Each affected YAML file explains the change in its `notes`.

## Flagged needs_review

`acad.acdbdictionarywdflt`, `acad.attdef`, `acad.attrib`, `acad.block`, `acad.block_action`, `acad.block_action_base_pt`, `acad.block_element`, `acad.block_grip`, `acad.block_parameter`, `acad.block_representation_data`, `acad.blockalignmentgrip`, `acad.blockflipgrip`, `acad.blockgriplocationcomponent`, `acad.blocklineargrip`, `acad.blocklookupgrip`, `acad.blockpolargrip`, `acad.blockrotateaction`, `acad.blockrotationgrip`, `acad.blockrotationparameter`, `acad.blockscaleaction`, `acad.blockvisibilitygrip`, `acad.blockxygrip`, `acad.body`, `acad.dbcolor`, `acad.dictionaryvar`, `acad.dimassoc`, `acad.dynamic_block_purge_preventer`, `acad.extrudedsurface`, `acad.field`, `acad.fieldlist`, `acad.group`, `acad.image`, `acad.linked_data`, `acad.loftedsurface`, `acad.material`, `acad.mlinestyle`, `acad.modeler_geometry`, `acad.nurbsurface`, `acad.object_context_data`, `acad.ole2frame`, `acad.planesurface`, `acad.proxy_object`, `acad.rastervariables`, `acad.revolvedsurface`, `acad.scale`, `acad.solid3d`, `acad.sortentstable`, `acad.sweptsurface`, `acad.table_entity`, `acad.tablecontent`, `acad.tablestyle`, `acad.tolerance`, `acad.visualstyle`, `acad.wipeoutvariables`, `acad.light`, `acad.large_radial_dimension`, `acad.trace`, `acad.pdfreference`, `acad.dwfunderlay`, `acad.dgnunderlay`, `acad.dwfdefinition`, `acad.dgndefinition`, `acad.dxf_class`

## Not harvested at all

- Application-specific (closed) data inside proxy entities, and DWG-only objects.
- Header variables, the CLASSES section and the THUMBNAILIMAGE section are file structure, not entities; they are out of scope for this issue.
- Group codes that ACadSharp's DXF reader does not model are absent unless ezdxf lists them.
