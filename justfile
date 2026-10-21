set shell := ["bash", "-euo", "pipefail", "-c"]
set dotenv-load := false

compose := "docker compose -p bonyad --env-file .env --project-directory infra/supabase -f infra/supabase/docker-compose.yml -f infra/compose.yaml"
dburl   := "postgres://postgres:$(grep ^POSTGRES_PASSWORD= .env | cut -d= -f2-)@127.0.0.1:$(grep ^BONYAD_DB_PORT= .env | cut -d= -f2-)/postgres"

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

# Apply db/migrations to the database (the only schema history).
migrate:
    sqlx migrate run --source db/migrations --database-url "{{dburl}}"

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
