-- First schema: a single project and independent geometry.
-- Design: docs/superpowers/specs/2026-10-21-first-slice-design.md, section 3.
--
-- Ownership rule: this schema owns INTEGRITY (keys, kinds, finite numbers).
-- Geometry rules (zero-length lines, polygon validity) and all calculations belong to
-- the Rust `geometry` crate; the database never recomputes geometry.
--
-- Finite numbers: in PostgreSQL NaN sorts above Infinity, so
-- `v > '-Infinity' and v < 'Infinity'` rejects NaN as well as both infinities.

create schema if not exists bonyad;

create table bonyad.projects (
    id         uuid primary key,
    name       text not null,
    unit       text not null default 'm' check (unit = 'm'),
    frame      text not null default 'local-cartesian' check (frame = 'local-cartesian'),
    created_at timestamptz not null default now()
);

-- Stable identity and type for every drawn thing.
create table bonyad.entities (
    id         uuid primary key,
    project_id uuid not null references bonyad.projects (id) on delete cascade,
    kind       text not null check (kind in ('point', 'line', 'surface')),
    label      text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- Lets each geometry table pin itself to exactly one kind (see below).
    unique (id, kind)
);

create index entities_project_idx on bonyad.entities (project_id);

-- Each geometry table repeats its kind as a constant and references (id, kind), so a
-- `points` row cannot exist for a line or a surface.

create table bonyad.points (
    entity_id uuid primary key,
    kind      text not null default 'point' check (kind = 'point'),
    x         double precision not null,
    y         double precision not null,
    check (x > '-Infinity'::float8 and x < 'Infinity'::float8
       and y > '-Infinity'::float8 and y < 'Infinity'::float8),
    foreign key (entity_id, kind) references bonyad.entities (id, kind) on delete cascade
);

-- A line owns its two endpoints; equal coordinates elsewhere imply no connection.
create table bonyad.lines (
    entity_id uuid primary key,
    kind      text not null default 'line' check (kind = 'line'),
    x1        double precision not null,
    y1        double precision not null,
    x2        double precision not null,
    y2        double precision not null,
    check (x1 > '-Infinity'::float8 and x1 < 'Infinity'::float8
       and y1 > '-Infinity'::float8 and y1 < 'Infinity'::float8
       and x2 > '-Infinity'::float8 and x2 < 'Infinity'::float8
       and y2 > '-Infinity'::float8 and y2 < 'Infinity'::float8),
    foreign key (entity_id, kind) references bonyad.entities (id, kind) on delete cascade
);

create table bonyad.surfaces (
    entity_id uuid primary key,
    kind      text not null default 'surface' check (kind = 'surface'),
    foreign key (entity_id, kind) references bonyad.entities (id, kind) on delete cascade
);

-- A surface owns its ordered boundary. The ring is stored open (A, B, C) and drawn closed.
create table bonyad.surface_vertices (
    entity_id uuid not null references bonyad.surfaces (entity_id) on delete cascade,
    position  integer not null check (position >= 0),
    x         double precision not null,
    y         double precision not null,
    primary key (entity_id, position),
    check (x > '-Infinity'::float8 and x < 'Infinity'::float8
       and y > '-Infinity'::float8 and y < 'Infinity'::float8)
);
