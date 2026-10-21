-- The single project of this lab. Fixed id so every layer can refer to it.
-- Repeatable: running it twice changes nothing.
insert into bonyad.projects (id, name)
values ('00000000-0000-7000-8000-000000000001', 'Sample')
on conflict (id) do nothing;
