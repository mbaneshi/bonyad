-- Milestone 2, first slice: project-level optimistic revisions with normalized snapshots.
alter table bonyad.projects
  add column current_revision bigint not null default 0
  constraint projects_current_revision_non_negative check (current_revision >= 0);

create table bonyad.revisions (
  project_id uuid not null references bonyad.projects(id) on delete cascade,
  revision bigint not null check (revision >= 0),
  operation text not null,
  entity_id uuid,
  created_at timestamptz not null default now(),
  primary key (project_id, revision)
);

create table bonyad.revision_entities (
  project_id uuid not null,
  revision bigint not null,
  entity_id uuid not null,
  kind text not null check (kind in ('point', 'line', 'surface')),
  label text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (project_id, revision, entity_id),
  foreign key (project_id, revision) references bonyad.revisions(project_id, revision) on delete cascade
);

create table bonyad.revision_points (
  project_id uuid not null, revision bigint not null, entity_id uuid not null,
  x double precision not null, y double precision not null,
  primary key (project_id, revision, entity_id),
  foreign key (project_id, revision, entity_id) references bonyad.revision_entities(project_id, revision, entity_id) on delete cascade
);

create table bonyad.revision_lines (
  project_id uuid not null, revision bigint not null, entity_id uuid not null,
  x1 double precision not null, y1 double precision not null, x2 double precision not null, y2 double precision not null,
  primary key (project_id, revision, entity_id),
  foreign key (project_id, revision, entity_id) references bonyad.revision_entities(project_id, revision, entity_id) on delete cascade
);

create table bonyad.revision_surfaces (
  project_id uuid not null, revision bigint not null, entity_id uuid not null,
  primary key (project_id, revision, entity_id),
  foreign key (project_id, revision, entity_id) references bonyad.revision_entities(project_id, revision, entity_id) on delete cascade
);

create table bonyad.revision_surface_vertices (
  project_id uuid not null, revision bigint not null, entity_id uuid not null, position integer not null,
  x double precision not null, y double precision not null,
  primary key (project_id, revision, entity_id, position),
  foreign key (project_id, revision, entity_id) references bonyad.revision_surfaces(project_id, revision, entity_id) on delete cascade
);

-- Existing local data becomes the initial accepted snapshot. Fresh databases also receive
-- revision zero from the seed below.
insert into bonyad.revisions (project_id, revision, operation)
select id, current_revision, 'initial' from bonyad.projects;

insert into bonyad.revision_entities (project_id, revision, entity_id, kind, label, created_at, updated_at)
select e.project_id, p.current_revision, e.id, e.kind, e.label, e.created_at, e.updated_at
from bonyad.entities e join bonyad.projects p on p.id = e.project_id;

insert into bonyad.revision_points (project_id, revision, entity_id, x, y)
select e.project_id, p.current_revision, x.entity_id, x.x, x.y
from bonyad.points x join bonyad.entities e on e.id = x.entity_id join bonyad.projects p on p.id = e.project_id;

insert into bonyad.revision_lines (project_id, revision, entity_id, x1, y1, x2, y2)
select e.project_id, p.current_revision, x.entity_id, x.x1, x.y1, x.x2, x.y2
from bonyad.lines x join bonyad.entities e on e.id = x.entity_id join bonyad.projects p on p.id = e.project_id;

insert into bonyad.revision_surfaces (project_id, revision, entity_id)
select e.project_id, p.current_revision, x.entity_id
from bonyad.surfaces x join bonyad.entities e on e.id = x.entity_id join bonyad.projects p on p.id = e.project_id;

insert into bonyad.revision_surface_vertices (project_id, revision, entity_id, position, x, y)
select e.project_id, p.current_revision, v.entity_id, v.position, v.x, v.y
from bonyad.surface_vertices v join bonyad.entities e on e.id = v.entity_id join bonyad.projects p on p.id = e.project_id;
