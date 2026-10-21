# infra: the local stack

A full self-hosted Supabase (Postgres, Studio, Auth, Storage, Realtime, Edge Functions,
the API gateway and the pooler), run from the official compose, **vendored and pinned**
in `supabase/` (see `supabase/VENDORED.md`) with Bonyad's overrides in `compose.yaml`.
This milestone uses only the database; the other services run but are not used yet.

**Local, single-user lab. There is no authentication, so everything binds to
`127.0.0.1`. Do not expose these ports to a network.**

## First run

```bash
just env        # creates the untracked .env and generates every secret (refuses to overwrite)
just bootstrap  # installs sqlx-cli once
just up         # starts and waits until all services are healthy
just migrate    # applies db/migrations
just seed       # inserts the project row
```

`just reset` destroys this project's data and rebuilds it empty (compose project
`bonyad` only; it never touches another stack).

## Ports (host, 127.0.0.1 only)

| Port | What |
|---|---|
| 58000 | Studio and the Supabase API gateway (dashboard login is `DASHBOARD_*` in `.env`) |
| 55432 | Postgres, direct (the Rust server and `just migrate` use this) |
| 55433 / 55434 | Pooler, session / transaction mode |

The range is shifted on purpose: a default Supabase stack on 5432, 8000, 3000 and 6543
may already be running on the same machine.

## Notes

- **Container names.** Upstream hard-codes `supabase-*` container names and the project
  name `supabase`, which collide with any other Supabase stack on the machine.
  `compose.yaml` renames every container `bonyad-*`. Realtime keeps the network alias
  `realtime-dev.supabase-realtime` because the gateway routes to that name.
- **Secrets** live only in `.env` (mode 600, git-ignored). `.env.example` holds
  placeholders for Bonyad's own settings.
- **Database data** is the bind mount `supabase/volumes/db/data` (git-ignored).
- **Schema history** is `db/migrations/` and nothing else. Do not add schema SQL to
  `supabase/volumes/db/`: that folder runs only on the first boot of an empty database.
