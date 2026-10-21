-- Local security cleanup.
--
-- SQLx keeps migration metadata in public._sqlx_migrations by default. The table is
-- not application data and must not be readable through PostgREST roles. The local
-- migration runner connects as postgres, so it continues to work with RLS enabled.
do $$
begin
  if to_regclass('public._sqlx_migrations') is not null then
    execute 'alter table public._sqlx_migrations enable row level security';
    execute 'revoke all on table public._sqlx_migrations from anon, authenticated';
  end if;
end
$$;
