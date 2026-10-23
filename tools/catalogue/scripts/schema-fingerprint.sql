-- Structural fingerprint of one schema (default: acad), independent of constraint names.
-- Run with:  psql -At -v schema=acad -f schema-fingerprint.sql
-- Columns: type (domain name when there is one), udt, nullability, default, ordinal position;
-- constraints (primary key, unique, foreign key, check) as Postgres prints them; triggers.
select line from (
    select 'column   ' || c.table_name || '.' || c.column_name
           || ' #' || c.ordinal_position
           || ' type=' || coalesce(c.domain_schema || '.' || c.domain_name, c.data_type)
           || ' udt=' || c.udt_name
           || ' nullable=' || c.is_nullable
           || ' default=' || coalesce(c.column_default, '-') as line
      from information_schema.columns c
     where c.table_schema = :'schema'
    union all
    select 'constraint ' || cl.relname || ' ' || co.contype::text || ' ' || pg_get_constraintdef(co.oid)
      from pg_constraint co
      join pg_class cl on cl.oid = co.conrelid
     where cl.relnamespace = :'schema'::regnamespace
    union all
    select 'trigger  ' || cl.relname || ' ' || t.tgname || ' ' || pg_get_triggerdef(t.oid)
      from pg_trigger t
      join pg_class cl on cl.oid = t.tgrelid
     where cl.relnamespace = :'schema'::regnamespace and not t.tgisinternal
) x
order by line;
