set shell := ["bash", "-euo", "pipefail", "-c"]
set dotenv-load := false

# The stack (up/down/reset) runs from the MAIN checkout only: its .env holds the generated
# secrets and its volumes/ holds the database. Worktrees are disposable (merging a pull
# request with --delete-branch removes them, untracked files included), so they must never
# hold either. The Rust recipes work from any worktree: they find the main checkout's .env.
compose := "docker compose -p bonyad --env-file .env --project-directory infra/supabase -f infra/supabase/docker-compose.yml -f infra/compose.yaml"

# Connection string for the local database, built from .env (empty if there is none yet).
export DATABASE_URL := `f="$(if [ -f .env ]; then echo .env; else echo "$(dirname "$(git rev-parse --git-common-dir)")/.env"; fi)"; [ -f "$f" ] || exit 0; pw="$(grep '^POSTGRES_PASSWORD=' "$f" | cut -d= -f2- | tr -d '"')"; port="$(grep '^BONYAD_DB_PORT=' "$f" | cut -d= -f2- | tr -d '"')"; printf 'postgres://postgres:%s@127.0.0.1:%s/postgres' "$pw" "$port"`

default:
    @just --list

# One-time: tools this repo needs that are not on PATH yet.
bootstrap:
    command -v sqlx >/dev/null || cargo install sqlx-cli --no-default-features --features postgres,rustls --locked

# Create the untracked .env (generates all secrets). Refuses to overwrite.
env:
    scripts/gen-env

# Start the full Supabase stack and wait until every service is healthy.
up:
    {{compose}} up -d --wait

# Stop the stack; data is kept.
down:
    {{compose}} down

# Service status.
ps:
    {{compose}} ps

[private]
needs-db:
    @[ -n "$DATABASE_URL" ] || { echo "no .env found. In the main checkout run: just env && just up" >&2; exit 1; }

# Apply db/migrations to the database (the only schema history).
migrate: needs-db
    sqlx migrate run --source db/migrations

# Load db/seeds (the single project row). Safe to repeat.
seed:
    for f in db/seeds/*.sql; do docker exec -i bonyad-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$f"; done

# psql shell inside the database container.
psql:
    docker exec -it bonyad-db psql -U postgres -d postgres

# DESTROYS this project's data (compose project `bonyad` only), then rebuilds it empty.
reset:
    {{compose}} down -v
    rm -rf infra/supabase/volumes/db/data infra/supabase/volumes/storage infra/supabase/volumes/snippets
    just up
    just migrate
    just seed

# Rust: formatting, lints, and every test (the tests run against the real local database).
logic-check: needs-db
    cd logic && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test

# Run the API on 127.0.0.1:58080 (set BONYAD_BIND to change; non-loopback is refused).
serve: needs-db
    cd logic && cargo run -p bonyad-server --bin bonyad-server

# Regenerate contracts/openapi.json after an intentional API change, then commit it.
openapi:
    cd logic && UPDATE_CONTRACT=1 cargo test -p bonyad-server --test contract

# UI: typecheck, tests, the generated client is current, and a production build.
ui-check:
    cd ui && pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm gen:api:check && pnpm build

# UI dev server on 127.0.0.1:55173 (proxies /v1 to the API; start `just serve` first).
ui:
    cd ui && pnpm install --frozen-lockfile && pnpm dev

# Agent: its tests run against a throwaway database and the real Rust API (never the provider).
agent-check: needs-db
    cd logic && cargo build -p bonyad-server --bin bonyad-server
    cd agent && bun install --frozen-lockfile && bun test

# Agent service on 127.0.0.1:58090 (needs `just serve` and ANTHROPIC_API_KEY for real runs).
agent: needs-db
    cd agent && bun install --frozen-lockfile && bun src/main.ts

# Opt-in: one REAL Anthropic stream through both scenarios. Spends a little money.
agent-smoke: needs-db
    cd agent && bun install --frozen-lockfile && bun test/smoke.ts

# Agent service with a SCRIPTED model (agent/demo): watch the agent path without an API key.
agent-demo: needs-db
    cd agent && bun install --frozen-lockfile && BONYAD_FAKE_SCRIPT=demo/scenarios.json bun src/main.ts
