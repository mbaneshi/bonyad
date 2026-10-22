-- Phase 1: the entity spine, an AutoCAD pilot, procedures and skills as data.
-- Issue #29. Design: docs/design/db/bonyad-phase1.dbml.
--
-- This sits ALONGSIDE the `bonyad` (milestones 1-2) and `agent` schemas and changes neither.
--
-- Rules this migration enforces:
--   * Every entity table is a HISTORY table keyed (entity_id, revision_id). A change inserts a new
--     version row. Rows are never updated, and never deleted directly (trigger below). Deleting a
--     whole project cascades, which is how a lab database is reset.
--   * core.entity_version is the only statement of "this entity exists at this revision". Every
--     entity table points at it with a composite foreign key that also pins the table's own type
--     code, so a row can never sit in the wrong table.
--   * Every version row belongs to the same project as its entity AND its revision.
--   * Numbers are finite (core.finite rejects NaN and both infinities, as in milestone 1).
--   * Angles are radians. Lengths are in the project's declared unit. No silent defaults.
--   * Postgres owns integrity. Geometry validity beyond simple checks and all calculation stay
--     in Rust (manifesto section 4).

create schema if not exists core;
create schema if not exists acad;
create schema if not exists proc;
create schema if not exists skill;

-- ------------------------------------------------------------------ core

create domain core.finite as double precision
    check (value > '-Infinity'::float8 and value < 'Infinity'::float8);

create function core.forbid_history_rewrite() returns trigger
language plpgsql as $$
begin
    if tg_op = 'UPDATE' then
        raise exception 'history table %.% is append-only: insert a new version instead of updating',
            tg_table_schema, tg_table_name using errcode = 'restrict_violation';
    end if;
    -- A direct DELETE runs at trigger depth 1; a cascade from a parent row runs deeper.
    if pg_trigger_depth() = 1 then
        raise exception 'history table %.% is append-only: rows are never deleted directly',
            tg_table_schema, tg_table_name using errcode = 'restrict_violation';
    end if;
    return old;
end
$$;

create table core.project (
    id          uuid primary key,
    name        text not null,
    unit_length text not null default 'm' check (unit_length in ('m', 'mm', 'cm', 'km', 'ft', 'in')),
    angle_unit  text not null default 'radian' check (angle_unit = 'radian'),
    axes        text not null default 'x-east-y-north-z-up' check (axes = 'x-east-y-north-z-up'),
    created_at  timestamptz not null default now()
);

create table core.actor (
    id   uuid primary key,
    kind text not null check (kind in ('human', 'agent')),
    name text not null
);

create table core.revision (
    id         bigint generated always as identity primary key,
    project_id uuid not null references core.project (id) on delete cascade,
    number     integer not null check (number >= 0),
    actor_id   uuid not null references core.actor (id),
    operation  text not null,
    created_at timestamptz not null default now(),
    unique (project_id, number),
    unique (id, project_id)
);

create table core.source (
    id          uuid primary key,
    software    text not null,
    document    text not null,
    section     text,
    url         text,
    version     text,
    accessed_on date
);

-- One row per entity table: what it is, in words, with a source.
create table core.entity_type (
    code      text primary key check (code ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),
    software  text not null,
    name      text not null,
    db_table  text not null unique,
    meaning   text not null,
    source_id uuid references core.source (id)
);

-- One row per column that needs explaining.
create table core.field_doc (
    type_code   text not null references core.entity_type (code) on delete cascade,
    column_name text not null,
    meaning     text not null,
    unit        text,
    source_ref  text,
    primary key (type_code, column_name)
);

create table core.entity (
    id                  uuid primary key,
    project_id          uuid not null references core.project (id) on delete cascade,
    type_code           text not null references core.entity_type (code),
    created_revision_id bigint not null,
    unique (id, project_id, type_code),
    foreign key (created_revision_id, project_id) references core.revision (id, project_id) on delete cascade
);

create table core.entity_version (
    entity_id   uuid not null,
    revision_id bigint not null,
    project_id  uuid not null,
    type_code   text not null,
    deleted     boolean not null default false,
    primary key (entity_id, revision_id),
    unique (entity_id, revision_id, type_code),
    foreign key (entity_id, project_id, type_code)
        references core.entity (id, project_id, type_code) on delete cascade,
    foreign key (revision_id, project_id)
        references core.revision (id, project_id) on delete cascade
);

create index entity_project_idx on core.entity (project_id);
create index entity_version_revision_idx on core.entity_version (revision_id);

-- ------------------------------------------------------------------ acad (pilot)
-- AutoCAD / DXF vocabulary. DXF handles are file-scoped, so they are a mapping column only.

-- Fields every graphic entity shares (DXF "common entity" group codes), stored once.
create table acad.graphic_entity (
    entity_id        uuid not null,
    revision_id      bigint not null,
    type_code        text not null check (type_code in (
        'acad.insert', 'acad.point', 'acad.line', 'acad.circle', 'acad.arc',
        'acad.lwpolyline', 'acad.face3d', 'acad.mesh', 'acad.text')),
    owner_block_id   uuid not null references core.entity (id) on delete cascade,
    layer_id         uuid not null references core.entity (id) on delete cascade,
    linetype_id      uuid references core.entity (id) on delete cascade,
    color            integer,
    true_color       integer,
    lineweight       integer,
    linetype_scale   core.finite not null default 1 check (linetype_scale > 0),
    visible          boolean not null default true,
    transparency     integer check (transparency between 0 and 90),
    dxf_handle       text,
    primary key (entity_id, revision_id),
    unique (entity_id, revision_id, type_code),
    foreign key (entity_id, revision_id, type_code)
        references core.entity_version (entity_id, revision_id, type_code) on delete cascade
);

create table acad.layer (
    entity_id   uuid not null,
    revision_id bigint not null,
    kind        text not null default 'acad.layer' check (kind = 'acad.layer'),
    name        text not null,
    color       integer,
    linetype_id uuid references core.entity (id) on delete cascade,
    lineweight  integer,
    is_off      boolean not null default false,
    is_frozen   boolean not null default false,
    is_locked   boolean not null default false,
    plot        boolean not null default true,
    primary key (entity_id, revision_id),
    foreign key (entity_id, revision_id, kind)
        references core.entity_version (entity_id, revision_id, type_code) on delete cascade
);

create table acad.linetype (
    entity_id      uuid not null,
    revision_id    bigint not null,
    kind           text not null default 'acad.linetype' check (kind = 'acad.linetype'),
    name           text not null,
    description    text,
    pattern_length core.finite,
    primary key (entity_id, revision_id),
    foreign key (entity_id, revision_id, kind)
        references core.entity_version (entity_id, revision_id, type_code) on delete cascade
);

create table acad.block_record (
    entity_id       uuid not null,
    revision_id     bigint not null,
    kind            text not null default 'acad.block_record' check (kind = 'acad.block_record'),
    name            text not null,
    is_layout       boolean not null default false,
    insertion_units integer,
    base_x          core.finite not null default 0,
    base_y          core.finite not null default 0,
    base_z          core.finite not null default 0,
    primary key (entity_id, revision_id),
    foreign key (entity_id, revision_id, kind)
        references core.entity_version (entity_id, revision_id, type_code) on delete cascade
);

create table acad.insert (
    entity_id      uuid not null,
    revision_id    bigint not null,
    kind           text not null default 'acad.insert' check (kind = 'acad.insert'),
    block_id       uuid not null references core.entity (id) on delete cascade,
    ins_x          core.finite not null,
    ins_y          core.finite not null,
    ins_z          core.finite not null,
    scale_x        core.finite not null default 1 check (scale_x <> 0),
    scale_y        core.finite not null default 1 check (scale_y <> 0),
    scale_z        core.finite not null default 1 check (scale_z <> 0),
    rotation       core.finite not null default 0,
    column_count   integer not null default 1 check (column_count >= 1),
    row_count      integer not null default 1 check (row_count >= 1),
    column_spacing core.finite,
    row_spacing    core.finite,
    primary key (entity_id, revision_id),
    foreign key (entity_id, revision_id, kind)
        references acad.graphic_entity (entity_id, revision_id, type_code) on delete cascade
);

create table acad.point (
    entity_id   uuid not null,
    revision_id bigint not null,
    kind        text not null default 'acad.point' check (kind = 'acad.point'),
    x           core.finite not null,
    y           core.finite not null,
    z           core.finite not null,
    thickness   core.finite not null default 0,
    primary key (entity_id, revision_id),
    foreign key (entity_id, revision_id, kind)
        references acad.graphic_entity (entity_id, revision_id, type_code) on delete cascade
);

create table acad.line (
    entity_id   uuid not null,
    revision_id bigint not null,
    kind        text not null default 'acad.line' check (kind = 'acad.line'),
    start_x     core.finite not null,
    start_y     core.finite not null,
    start_z     core.finite not null,
    end_x       core.finite not null,
    end_y       core.finite not null,
    end_z       core.finite not null,
    thickness   core.finite not null default 0,
    normal_x    core.finite not null default 0,
    normal_y    core.finite not null default 0,
    normal_z    core.finite not null default 1,
    primary key (entity_id, revision_id),
    foreign key (entity_id, revision_id, kind)
        references acad.graphic_entity (entity_id, revision_id, type_code) on delete cascade
);

create table acad.circle (
    entity_id   uuid not null,
    revision_id bigint not null,
    kind        text not null default 'acad.circle' check (kind = 'acad.circle'),
    center_x    core.finite not null,
    center_y    core.finite not null,
    center_z    core.finite not null,
    radius      core.finite not null check (radius > 0),
    thickness   core.finite not null default 0,
    normal_x    core.finite not null default 0,
    normal_y    core.finite not null default 0,
    normal_z    core.finite not null default 1,
    primary key (entity_id, revision_id),
    foreign key (entity_id, revision_id, kind)
        references acad.graphic_entity (entity_id, revision_id, type_code) on delete cascade
);

create table acad.arc (
    entity_id   uuid not null,
    revision_id bigint not null,
    kind        text not null default 'acad.arc' check (kind = 'acad.arc'),
    center_x    core.finite not null,
    center_y    core.finite not null,
    center_z    core.finite not null,
    radius      core.finite not null check (radius > 0),
    start_angle core.finite not null,
    end_angle   core.finite not null,
    thickness   core.finite not null default 0,
    normal_x    core.finite not null default 0,
    normal_y    core.finite not null default 0,
    normal_z    core.finite not null default 1,
    primary key (entity_id, revision_id),
    foreign key (entity_id, revision_id, kind)
        references acad.graphic_entity (entity_id, revision_id, type_code) on delete cascade
);

create table acad.lwpolyline (
    entity_id      uuid not null,
    revision_id    bigint not null,
    kind           text not null default 'acad.lwpolyline' check (kind = 'acad.lwpolyline'),
    elevation      core.finite not null default 0,
    closed         boolean not null default false,
    constant_width core.finite,
    thickness      core.finite not null default 0,
    normal_x       core.finite not null default 0,
    normal_y       core.finite not null default 0,
    normal_z       core.finite not null default 1,
    primary key (entity_id, revision_id),
    foreign key (entity_id, revision_id, kind)
        references acad.graphic_entity (entity_id, revision_id, type_code) on delete cascade
);

create table acad.lwpolyline_vertex (
    entity_id   uuid not null,
    revision_id bigint not null,
    position    integer not null check (position >= 0),
    x           core.finite not null,
    y           core.finite not null,
    start_width core.finite,
    end_width   core.finite,
    bulge       core.finite not null default 0,
    primary key (entity_id, revision_id, position),
    foreign key (entity_id, revision_id)
        references acad.lwpolyline (entity_id, revision_id) on delete cascade
);

create table acad.face3d (
    entity_id   uuid not null,
    revision_id bigint not null,
    kind        text not null default 'acad.face3d' check (kind = 'acad.face3d'),
    c1_x core.finite not null, c1_y core.finite not null, c1_z core.finite not null,
    c2_x core.finite not null, c2_y core.finite not null, c2_z core.finite not null,
    c3_x core.finite not null, c3_y core.finite not null, c3_z core.finite not null,
    c4_x core.finite not null, c4_y core.finite not null, c4_z core.finite not null,
    edge_flags  integer not null default 0 check (edge_flags between 0 and 15),
    primary key (entity_id, revision_id),
    foreign key (entity_id, revision_id, kind)
        references acad.graphic_entity (entity_id, revision_id, type_code) on delete cascade
);

create table acad.mesh (
    entity_id         uuid not null,
    revision_id       bigint not null,
    kind              text not null default 'acad.mesh' check (kind = 'acad.mesh'),
    subdivision_level integer not null default 0 check (subdivision_level >= 0),
    primary key (entity_id, revision_id),
    foreign key (entity_id, revision_id, kind)
        references acad.graphic_entity (entity_id, revision_id, type_code) on delete cascade
);

create table acad.mesh_vertex (
    entity_id   uuid not null,
    revision_id bigint not null,
    position    integer not null check (position >= 0),
    x           core.finite not null,
    y           core.finite not null,
    z           core.finite not null,
    primary key (entity_id, revision_id, position),
    foreign key (entity_id, revision_id) references acad.mesh (entity_id, revision_id) on delete cascade
);

create table acad.mesh_face (
    entity_id       uuid not null,
    revision_id     bigint not null,
    position        integer not null check (position >= 0),
    vertex_indices  integer[] not null check (cardinality(vertex_indices) >= 3),
    primary key (entity_id, revision_id, position),
    foreign key (entity_id, revision_id) references acad.mesh (entity_id, revision_id) on delete cascade
);

create table acad.text (
    entity_id            uuid not null,
    revision_id          bigint not null,
    kind                 text not null default 'acad.text' check (kind = 'acad.text'),
    insert_x             core.finite not null,
    insert_y             core.finite not null,
    insert_z             core.finite not null,
    height               core.finite not null check (height > 0),
    value                text not null,
    rotation             core.finite not null default 0,
    width_factor         core.finite not null default 1 check (width_factor > 0),
    oblique_angle        core.finite not null default 0,
    style_name           text,
    horizontal_alignment integer not null default 0,
    vertical_alignment   integer not null default 0,
    primary key (entity_id, revision_id),
    foreign key (entity_id, revision_id, kind)
        references acad.graphic_entity (entity_id, revision_id, type_code) on delete cascade
);

-- ------------------------------------------------------------------ proc
-- A procedure's executable owner is the compiled Rust named by impl_key. A row alone runs nothing.

create table proc.procedure (
    id      uuid primary key,
    key     text not null unique,
    name    text not null,
    meaning text not null,
    effect  text not null check (effect in ('read', 'compute', 'change')),
    domain  text not null
);

create table proc.procedure_version (
    id           uuid primary key,
    procedure_id uuid not null references proc.procedure (id) on delete cascade,
    version      integer not null check (version >= 1),
    status       text not null check (status in ('draft', 'active', 'retired')),
    impl_kind    text not null check (impl_kind in ('rust_builtin', 'wasm')),
    impl_key     text not null,
    impl_hash    text,
    created_at   timestamptz not null default now(),
    unique (procedure_id, version)
);

create table proc.param (
    id                   uuid primary key,
    procedure_version_id uuid not null references proc.procedure_version (id) on delete cascade,
    position             integer not null check (position >= 0),
    name                 text not null,
    direction            text not null check (direction in ('in', 'out')),
    value_type           text not null check (value_type in ('number', 'text', 'boolean', 'entity')),
    entity_type_code     text references core.entity_type (code),
    unit                 text,
    required             boolean not null default true,
    unique (procedure_version_id, name, direction),
    check ((value_type = 'entity') = (entity_type_code is not null))
);

create table proc.run (
    id                   uuid primary key,
    procedure_version_id uuid not null references proc.procedure_version (id),
    project_id           uuid not null,
    input_revision_id    bigint not null,
    actor_id             uuid not null references core.actor (id),
    status               text not null check (status in ('ok', 'failed')),
    error_code           text,
    started_at           timestamptz not null default now(),
    finished_at          timestamptz,
    foreign key (input_revision_id, project_id) references core.revision (id, project_id) on delete cascade,
    check ((status = 'failed') = (error_code is not null))
);

create table proc.run_input (
    run_id       uuid not null references proc.run (id) on delete cascade,
    param_id     uuid not null references proc.param (id),
    entity_id    uuid references core.entity (id) on delete cascade,
    value_number core.finite,
    value_text   text,
    primary key (run_id, param_id),
    check (num_nonnulls(entity_id, value_number, value_text) = 1)
);

create table proc.run_output (
    run_id       uuid not null references proc.run (id) on delete cascade,
    param_id     uuid not null references proc.param (id),
    entity_id    uuid references core.entity (id) on delete cascade,
    value_number core.finite,
    value_text   text,
    primary key (run_id, param_id),
    check (num_nonnulls(entity_id, value_number, value_text) = 1)
);

-- ------------------------------------------------------------------ skill
-- One day-to-day domain problem, packaged so an LLM can pursue a goal with it.

create table skill.skill (
    id          uuid primary key,
    key         text not null,
    name        text not null,
    domain      text not null,
    goal        text not null,
    when_to_use text not null,
    version     integer not null check (version >= 1),
    status      text not null check (status in ('draft', 'active', 'retired')),
    unique (key, version)
);

create table skill.context (
    id        uuid primary key,
    skill_id  uuid not null references skill.skill (id) on delete cascade,
    position  integer not null check (position >= 0),
    kind      text not null check (kind in ('definition', 'rule_of_thumb', 'warning', 'example')),
    text      text not null,
    source_id uuid references core.source (id),
    unique (skill_id, position)
);

create table skill.query (
    id       uuid primary key,
    skill_id uuid not null references skill.skill (id) on delete cascade,
    name     text not null,
    purpose  text not null,
    sql_text text not null,
    unique (skill_id, name)
);

create table skill.workflow_step (
    skill_id     uuid not null references skill.skill (id) on delete cascade,
    position     integer not null check (position >= 0),
    kind         text not null check (kind in ('query', 'procedure', 'check', 'ask_human')),
    query_id     uuid references skill.query (id),
    procedure_id uuid references proc.procedure (id),
    expectation  text not null,
    on_failure   text not null check (on_failure in ('stop', 'retry', 'ask_human')),
    primary key (skill_id, position),
    check ((kind = 'query') = (query_id is not null)),
    check ((kind = 'procedure') = (procedure_id is not null))
);

create table skill.test (
    id         uuid primary key,
    skill_id   uuid not null references skill.skill (id) on delete cascade,
    name       text not null,
    setup_note text not null,
    unique (skill_id, name)
);

create table skill.test_check (
    test_id         uuid not null references skill.test (id) on delete cascade,
    position        integer not null check (position >= 0),
    target          text not null,
    expected_number core.finite,
    expected_text   text,
    tolerance       core.finite check (tolerance >= 0),
    unit            text,
    primary key (test_id, position),
    check (num_nonnulls(expected_number, expected_text) = 1)
);

-- ------------------------------------------------------------------ append-only history
do $$
declare
    t text;
begin
    foreach t in array array[
        'core.revision', 'core.entity', 'core.entity_version',
        'acad.graphic_entity', 'acad.layer', 'acad.linetype', 'acad.block_record', 'acad.insert',
        'acad.point', 'acad.line', 'acad.circle', 'acad.arc', 'acad.lwpolyline',
        'acad.lwpolyline_vertex', 'acad.face3d', 'acad.mesh', 'acad.mesh_vertex',
        'acad.mesh_face', 'acad.text']
    loop
        execute format(
            'create trigger %I before update or delete on %s for each row execute function core.forbid_history_rewrite()',
            replace(t, '.', '_') || '_append_only', t);
    end loop;
end
$$;

-- ------------------------------------------------------------------ meaning (mirrors core.entity_type)
comment on schema core  is 'Shared spine: identity, revisions, provenance, and the meaning of every entity table.';
comment on schema acad  is 'Pilot: entity tables faithful to AutoCAD / DXF vocabulary. History tables keyed (entity_id, revision_id).';
comment on schema proc  is 'Procedures as data: a typed contract and a pointer to compiled Rust, plus every run.';
comment on schema skill is 'Domain problems packaged for an LLM: context, queries, workflow, tests.';

comment on table core.entity_version     is 'Existence of an entity at a revision. Append-only. Every entity table points here.';
comment on table core.entity             is 'Stable identity of a thing for its whole life, with its type.';
comment on table acad.graphic_entity     is 'Fields every AutoCAD graphic entity shares (DXF common group codes). One row per version.';
comment on table acad.line               is 'AutoCAD LINE: a straight segment between two 3D points.';
comment on table acad.circle             is 'AutoCAD CIRCLE: centre and radius.';
comment on table acad.arc                is 'AutoCAD ARC: centre, radius, start and end angle (radians, counter-clockwise).';
comment on table acad.lwpolyline         is 'AutoCAD LWPOLYLINE: a 2D polyline; vertices carry a bulge for arc segments.';
comment on table acad.insert             is 'AutoCAD INSERT: one placement of a block definition (block_record).';
comment on table acad.block_record       is 'AutoCAD block definition; model space and paper space are blocks too.';
comment on table proc.procedure_version  is 'A versioned, typed contract. impl_key names the compiled Rust that runs it.';
comment on table proc.run                is 'One execution of a procedure version at an input revision.';
