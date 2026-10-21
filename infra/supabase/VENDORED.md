# Vendored: official self-hosted Supabase compose

- **Source:** https://github.com/supabase/supabase, directory `docker/`
- **Pinned commit:** `5491fb60bc0f27b8909a83100d79499aa7667ee5` (fetched 2026-10-21)
- **License:** Apache-2.0, copied as `LICENSE` from the same commit.
- **Local modifications:** none. Every Bonyad change lives in `../compose.yaml` (overrides)
  and the root `.env`.

## What is included

`docker-compose.yml`, `.env.example`, `utils/generate-keys.sh`, and `volumes/`
(`api/`, `db/`, `functions/`, `pooler/`). Left out on purpose: tests, the changelog and
config reference, the helper scripts (`setup.sh`, `run.sh`, `update.sh`, `reset.sh`;
our `justfile` replaces them), the optional logging, proxy and gateway overlays, and
`volumes/logs`, `volumes/proxy` (the base compose does not reference them).

Runtime directories `volumes/db/data`, `volumes/storage` and `volumes/snippets` are
created by Docker at run time and are git-ignored.

## Updating

Re-vendor deliberately, as one reviewable commit: sparse-clone the new upstream
commit, replace these files, update the commit above, run `just up` on a fresh
checkout, and read upstream's changelog for breaking changes first.
