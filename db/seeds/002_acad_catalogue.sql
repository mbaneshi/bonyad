-- Catalogue rows for the acad pilot: one per entity table, plus a few column meanings.
-- Safe to repeat. Meanings come from general DXF knowledge and the ezdxf documentation; they are
-- NOT yet checked against Autodesk's own DXF reference (see the source row).

insert into core.source (id, software, document, section, url, version, accessed_on) values
    ('00000000-0000-4000-8000-00000000d001', 'AutoCAD', 'DXF reference, as documented by ezdxf',
     'entities and group codes (not yet verified against the Autodesk reference)',
     'https://ezdxf.readthedocs.io/', null, '2026-10-22')
on conflict (id) do nothing;

insert into core.entity_type (code, software, name, db_table, meaning, source_id) values
    ('acad.layer',        'AutoCAD', 'LAYER',        'acad.layer',        'A named group that controls colour, linetype, visibility and plotting of the entities placed on it.', '00000000-0000-4000-8000-00000000d001'),
    ('acad.linetype',     'AutoCAD', 'LTYPE',        'acad.linetype',     'A named dash/gap pattern used to draw curves.', '00000000-0000-4000-8000-00000000d001'),
    ('acad.block_record', 'AutoCAD', 'BLOCK_RECORD', 'acad.block_record', 'A block definition: a reusable group of entities. Model space and paper-space layouts are blocks too.', '00000000-0000-4000-8000-00000000d001'),
    ('acad.insert',       'AutoCAD', 'INSERT',       'acad.insert',       'One placement of a block definition, with position, scale and rotation; may be an array.', '00000000-0000-4000-8000-00000000d001'),
    ('acad.point',        'AutoCAD', 'POINT',        'acad.point',        'A single location in 3D space.', '00000000-0000-4000-8000-00000000d001'),
    ('acad.line',         'AutoCAD', 'LINE',         'acad.line',         'A straight segment between two 3D points.', '00000000-0000-4000-8000-00000000d001'),
    ('acad.circle',       'AutoCAD', 'CIRCLE',       'acad.circle',       'A circle given by its centre and radius, lying in a plane set by its normal.', '00000000-0000-4000-8000-00000000d001'),
    ('acad.arc',          'AutoCAD', 'ARC',          'acad.arc',          'A circular arc: centre, radius, start and end angle (radians, counter-clockwise).', '00000000-0000-4000-8000-00000000d001'),
    ('acad.lwpolyline',   'AutoCAD', 'LWPOLYLINE',   'acad.lwpolyline',   'A lightweight 2D polyline at one elevation; each vertex may carry a bulge that turns its segment into an arc.', '00000000-0000-4000-8000-00000000d001'),
    ('acad.face3d',       'AutoCAD', '3DFACE',       'acad.face3d',       'A flat face with three or four corners in 3D space.', '00000000-0000-4000-8000-00000000d001'),
    ('acad.mesh',         'AutoCAD', 'MESH',         'acad.mesh',         'A faceted surface made of vertices and faces.', '00000000-0000-4000-8000-00000000d001'),
    ('acad.text',         'AutoCAD', 'TEXT',         'acad.text',         'A single line of text with a height, rotation and style.', '00000000-0000-4000-8000-00000000d001')
on conflict (code) do nothing;

insert into core.field_doc (type_code, column_name, meaning, unit, source_ref) values
    ('acad.line', 'start_x',   'X of the start point', 'project length unit', 'DXF group code 10'),
    ('acad.line', 'start_y',   'Y of the start point', 'project length unit', 'DXF group code 20'),
    ('acad.line', 'start_z',   'Z of the start point', 'project length unit', 'DXF group code 30'),
    ('acad.line', 'end_x',     'X of the end point',   'project length unit', 'DXF group code 11'),
    ('acad.line', 'end_y',     'Y of the end point',   'project length unit', 'DXF group code 21'),
    ('acad.line', 'end_z',     'Z of the end point',   'project length unit', 'DXF group code 31'),
    ('acad.line', 'thickness', 'Extrusion thickness along the normal; 0 means flat', 'project length unit', 'DXF group code 39'),
    ('acad.line', 'normal_x',  'X of the extrusion direction (default 0,0,1)', null, 'DXF group code 210'),
    ('acad.line', 'normal_y',  'Y of the extrusion direction', null, 'DXF group code 220'),
    ('acad.line', 'normal_z',  'Z of the extrusion direction', null, 'DXF group code 230'),
    ('acad.lwpolyline', 'closed',         'True when the last vertex joins back to the first', null, 'DXF group code 70, bit 1'),
    ('acad.lwpolyline', 'elevation',      'Z of the plane the polyline lies in', 'project length unit', 'DXF group code 38'),
    ('acad.lwpolyline', 'constant_width', 'One width for every segment, when set', 'project length unit', 'DXF group code 43'),
    ('acad.arc', 'start_angle', 'Start angle, counter-clockwise from the plane X axis', 'radian', 'DXF group code 50 (degrees in DXF; radians here)'),
    ('acad.arc', 'end_angle',   'End angle, counter-clockwise from the plane X axis',   'radian', 'DXF group code 51 (degrees in DXF; radians here)')
on conflict (type_code, column_name) do nothing;
