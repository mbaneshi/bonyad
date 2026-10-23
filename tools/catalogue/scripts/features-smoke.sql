-- Behaviour smoke for the generated `features` fixture (multi-level base, type_code discriminators).
-- Runs in the scratch database after features.sql and features.catalogue.sql. Rolled back.
begin;
do $$
declare
    p uuid := gen_random_uuid();
    a uuid := gen_random_uuid();
    e uuid := gen_random_uuid();
    r bigint;
    failed boolean;
begin
    insert into core.project (id, name) values (p, 'smoke');
    insert into core.actor (id, kind, name) values (a, 'human', 'smoke');
    insert into core.revision (project_id, number, actor_id, operation) values (p, 0, a, 'create') returning id into r;
    insert into core.entity (id, project_id, type_code, created_revision_id) values (e, p, 'features.wall', r);
    insert into core.entity_version (entity_id, revision_id, project_id, type_code) values (e, r, p, 'features.wall');

    -- the wall's row in its base table, then in its own table, then a child row
    insert into features.element (entity_id, revision_id, type_code) values (e, r, 'features.wall');
    insert into features.wall (entity_id, revision_id, type_code, height, type, tolerances)
        values (e, r, 'features.wall', 2.5, 'straight', '{0.1}');
    insert into features.wall_layer (entity_id, revision_id, position, thickness, material) values (e, r, 0, 0.2, 'brick');

    -- a row in the wrong table must be refused: a beam row on a wall's base row
    failed := false;
    begin
        insert into features.beam (entity_id, revision_id, span, section_area, count) values (e, r, 1, 1, 1);
    exception when foreign_key_violation then failed := true;
    end;
    if not failed then raise exception 'beam row on a wall entity was accepted'; end if;

    -- a check must hold
    failed := false;
    begin
        insert into features.wall (entity_id, revision_id, type_code, height, type, tolerances)
            values (e, r, 'features.wall', -1, 'straight', '{}');
    exception when check_violation or unique_violation then failed := true;
    end;
    if not failed then raise exception 'negative height was accepted'; end if;

    -- append-only
    failed := false;
    begin
        update features.wall set height = 3;
    exception when restrict_violation then failed := true;
    end;
    if not failed then raise exception 'update of a history row was accepted'; end if;

    raise notice 'features smoke ok';
end
$$;
rollback;
