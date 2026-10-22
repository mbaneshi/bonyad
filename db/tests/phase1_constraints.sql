-- Constraint checks for the phase 1 spine (issue #29).
-- Runs inside one transaction that is ROLLED BACK, so it leaves no rows behind and is safe to repeat.
--   docker exec -i bonyad-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < db/tests/phase1_constraints.sql
-- Each "must fail" case names the error class it expects, so a wrong reason is a failure too.
begin;

create temp table _t (name text, ok boolean, detail text) on commit drop;

do $$
declare
    p1 uuid := gen_random_uuid();
    p2 uuid := gen_random_uuid();
    a1 uuid := gen_random_uuid();
    r0 bigint; r1 bigint; r2_0 bigint;
    b uuid := gen_random_uuid();   -- block
    l uuid := gen_random_uuid();   -- layer
    e1 uuid := gen_random_uuid();  -- line
    e2 uuid := gen_random_uuid();  -- circle
    e3 uuid := gen_random_uuid();  -- line (for the NaN case)
    sk uuid := gen_random_uuid();
    pr uuid := gen_random_uuid();
    pv uuid := gen_random_uuid();
    pm uuid := gen_random_uuid();
    rn uuid := gen_random_uuid();
    n int;
begin
    -- catalogue rows the fixtures need (the seed has them too; harmless to repeat)
    insert into core.entity_type (code, software, name, db_table, meaning) values
        ('acad.line', 'AutoCAD', 'LINE', 'acad.line', 'test'),
        ('acad.circle', 'AutoCAD', 'CIRCLE', 'acad.circle', 'test'),
        ('acad.layer', 'AutoCAD', 'LAYER', 'acad.layer', 'test'),
        ('acad.block_record', 'AutoCAD', 'BLOCK_RECORD', 'acad.block_record', 'test'),
        ('acad.arc', 'AutoCAD', 'ARC', 'acad.arc', 'test')
    on conflict (code) do nothing;

    insert into core.project (id, name) values (p1, 'p1'), (p2, 'p2');
    insert into core.actor (id, kind, name) values (a1, 'agent', 'test-agent');
    insert into core.revision (project_id, number, actor_id, operation) values (p1, 0, a1, 'create') returning id into r0;
    insert into core.revision (project_id, number, actor_id, operation) values (p1, 1, a1, 'edit') returning id into r1;
    insert into core.revision (project_id, number, actor_id, operation) values (p2, 0, a1, 'create') returning id into r2_0;

    -- T1 happy path: block, layer, a line and a circle with their graphic fields, all at revision r0
    begin
        insert into core.entity (id, project_id, type_code, created_revision_id) values
            (b, p1, 'acad.block_record', r0), (l, p1, 'acad.layer', r0),
            (e1, p1, 'acad.line', r0), (e2, p1, 'acad.circle', r0), (e3, p1, 'acad.line', r0);
        insert into core.entity_version (entity_id, revision_id, project_id, type_code) values
            (b, r0, p1, 'acad.block_record'), (l, r0, p1, 'acad.layer'),
            (e1, r0, p1, 'acad.line'), (e2, r0, p1, 'acad.circle'), (e3, r0, p1, 'acad.line');
        insert into acad.block_record (entity_id, revision_id, name) values (b, r0, '*Model_Space');
        insert into acad.layer (entity_id, revision_id, name) values (l, r0, '0');
        insert into acad.graphic_entity (entity_id, revision_id, type_code, owner_block_id, layer_id) values
            (e1, r0, 'acad.line', b, l), (e2, r0, 'acad.circle', b, l), (e3, r0, 'acad.line', b, l);
        insert into acad.line (entity_id, revision_id, start_x, start_y, start_z, end_x, end_y, end_z)
            values (e1, r0, 0, 0, 0, 4, 0, 0);
        insert into acad.circle (entity_id, revision_id, center_x, center_y, center_z, radius)
            values (e2, r0, 0, 0, 0, 2);
        insert into _t values ('T1 happy path inserts', true, null);
    exception when others then
        insert into _t values ('T1 happy path inserts', false, sqlerrm);
    end;

    -- T2 a line row cannot attach to a graphic_entity of another type (e2 is a circle)
    begin
        insert into acad.line (entity_id, revision_id, start_x, start_y, start_z, end_x, end_y, end_z)
            values (e2, r0, 0, 0, 0, 1, 1, 1);
        insert into _t values ('T2 line on a circle entity is rejected', false, 'inserted');
    exception when foreign_key_violation then
        insert into _t values ('T2 line on a circle entity is rejected', true, null);
    when others then
        insert into _t values ('T2 line on a circle entity is rejected', false, sqlstate || ' ' || sqlerrm);
    end;

    -- T3 the kind column is pinned to the table
    begin
        insert into acad.line (entity_id, revision_id, kind, start_x, start_y, start_z, end_x, end_y, end_z)
            values (e3, r0, 'acad.arc', 0, 0, 0, 1, 1, 1);
        insert into _t values ('T3 wrong kind value is rejected', false, 'inserted');
    exception when check_violation then
        insert into _t values ('T3 wrong kind value is rejected', true, null);
    when others then
        insert into _t values ('T3 wrong kind value is rejected', false, sqlstate || ' ' || sqlerrm);
    end;

    -- T4 a version cannot claim a different type than its entity
    begin
        insert into core.entity_version (entity_id, revision_id, project_id, type_code)
            values (e1, r1, p1, 'acad.circle');
        insert into _t values ('T4 version with another type is rejected', false, 'inserted');
    exception when foreign_key_violation then
        insert into _t values ('T4 version with another type is rejected', true, null);
    when others then
        insert into _t values ('T4 version with another type is rejected', false, sqlstate || ' ' || sqlerrm);
    end;

    -- T5 a version cannot use a revision from another project
    begin
        insert into core.entity_version (entity_id, revision_id, project_id, type_code)
            values (e1, r2_0, p1, 'acad.line');
        insert into _t values ('T5 revision from another project is rejected', false, 'inserted');
    exception when foreign_key_violation then
        insert into _t values ('T5 revision from another project is rejected', true, null);
    when others then
        insert into _t values ('T5 revision from another project is rejected', false, sqlstate || ' ' || sqlerrm);
    end;

    -- T6 history is append-only: UPDATE is refused
    begin
        update acad.line set thickness = 1 where entity_id = e1;
        insert into _t values ('T6 update of a history row is rejected', false, 'updated');
    exception when restrict_violation then
        insert into _t values ('T6 update of a history row is rejected', true, null);
    when others then
        insert into _t values ('T6 update of a history row is rejected', false, sqlstate || ' ' || sqlerrm);
    end;

    -- T7 history is append-only: a direct DELETE is refused
    begin
        delete from core.entity_version where entity_id = e1 and revision_id = r0;
        insert into _t values ('T7 direct delete of a version is rejected', false, 'deleted');
    exception when restrict_violation then
        insert into _t values ('T7 direct delete of a version is rejected', true, null);
    when others then
        insert into _t values ('T7 direct delete of a version is rejected', false, sqlstate || ' ' || sqlerrm);
    end;

    -- T8 non-finite coordinates are rejected
    begin
        insert into acad.line (entity_id, revision_id, start_x, start_y, start_z, end_x, end_y, end_z)
            values (e3, r0, 'NaN'::float8, 0, 0, 1, 1, 1);
        insert into _t values ('T8 NaN coordinate is rejected', false, 'inserted');
    exception when check_violation then
        insert into _t values ('T8 NaN coordinate is rejected', true, null);
    when others then
        insert into _t values ('T8 NaN coordinate is rejected', false, sqlstate || ' ' || sqlerrm);
    end;

    -- T9 a circle needs a positive radius
    begin
        -- a CHECK fires while the row is built, before any foreign key is looked at
        insert into acad.circle (entity_id, revision_id, center_x, center_y, center_z, radius)
            values (e2, r1, 0, 0, 0, 0);
        insert into _t values ('T9 zero radius is rejected', false, 'inserted');
    exception when check_violation then
        insert into _t values ('T9 zero radius is rejected', true, null);
    when others then
        insert into _t values ('T9 zero radius is rejected', false, sqlstate || ' ' || sqlerrm);
    end;

    -- T10 history grows by inserting a new version (not by updating)
    begin
        insert into core.entity_version (entity_id, revision_id, project_id, type_code) values (e1, r1, p1, 'acad.line');
        insert into acad.graphic_entity (entity_id, revision_id, type_code, owner_block_id, layer_id)
            values (e1, r1, 'acad.line', b, l);
        insert into acad.line (entity_id, revision_id, start_x, start_y, start_z, end_x, end_y, end_z)
            values (e1, r1, 0, 0, 0, 8, 0, 0);
        select count(*) into n from acad.line where entity_id = e1;
        insert into _t values ('T10 a second version is appended; both are kept', n = 2, 'versions=' || n);
    exception when others then
        insert into _t values ('T10 a second version is appended; both are kept', false, sqlerrm);
    end;

    -- T11 a workflow step of kind procedure needs a procedure
    begin
        insert into skill.skill (id, key, name, domain, goal, when_to_use, version, status)
            values (sk, 'test.skill', 'test', 'test', 'g', 'w', 1, 'draft');
        insert into skill.workflow_step (skill_id, position, kind, expectation, on_failure)
            values (sk, 0, 'procedure', 'x', 'stop');
        insert into _t values ('T11 procedure step without a procedure is rejected', false, 'inserted');
    exception when check_violation then
        insert into _t values ('T11 procedure step without a procedure is rejected', true, null);
    when others then
        insert into _t values ('T11 procedure step without a procedure is rejected', false, sqlstate || ' ' || sqlerrm);
    end;

    -- T12 a run input carries exactly one value
    begin
        insert into proc.procedure (id, key, name, meaning, effect, domain)
            values (pr, 'test.length', 'length', 'm', 'compute', 'test');
        insert into proc.procedure_version (id, procedure_id, version, status, impl_kind, impl_key)
            values (pv, pr, 1, 'active', 'rust_builtin', 'geometry::line_length');
        insert into proc.param (id, procedure_version_id, position, name, direction, value_type)
            values (pm, pv, 0, 'length', 'out', 'number');
        insert into proc.run (id, procedure_version_id, project_id, input_revision_id, actor_id, status)
            values (rn, pv, p1, r0, a1, 'ok');
        insert into proc.run_output (run_id, param_id, value_number, value_text) values (rn, pm, 4, 'four');
        insert into _t values ('T12 two values in one output are rejected', false, 'inserted');
    exception when check_violation then
        insert into _t values ('T12 two values in one output are rejected', true, null);
    when others then
        insert into _t values ('T12 two values in one output are rejected', false, sqlstate || ' ' || sqlerrm);
    end;

    -- T14 history is protected at the identity level too: a direct DELETE of an entity is refused
    begin
        delete from core.entity where id = e3;
        insert into _t values ('T14 direct delete of an entity is rejected', false, 'deleted');
    exception when restrict_violation then
        insert into _t values ('T14 direct delete of an entity is rejected', true, null);
    when others then
        insert into _t values ('T14 direct delete of an entity is rejected', false, sqlstate || ' ' || sqlerrm);
    end;

    -- T13 deleting a project cascades through history (the cascade is allowed, a direct delete is not)
    begin
        delete from core.project where id = p1;
        select count(*) into n from core.entity_version where project_id = p1;
        insert into _t values ('T13 project delete cascades through history', n = 0, 'left=' || n);
    exception when others then
        insert into _t values ('T13 project delete cascades through history', false, sqlstate || ' ' || sqlerrm);
    end;
end
$$;

select name, case when ok then 'PASS' else 'FAIL' end as result, coalesce(detail, '') as detail from _t order by name;

do $$
declare bad int;
begin
    select count(*) into bad from _t where not ok;
    if bad > 0 then
        raise exception '% constraint check(s) failed', bad;
    end if;
end
$$;

rollback;
