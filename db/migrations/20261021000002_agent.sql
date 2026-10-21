-- Agent run records (milestone 1, step 5). Owned by the agent service; the Rust API never
-- reads these. No RLS and no auth: this is a single-user local lab (ADR 0002).
create schema if not exists agent;

create table agent.conversations (
    id         uuid primary key,
    created_at timestamptz not null default now()
);

-- Append-only. `provider_content` holds the provider's content blocks verbatim (assistant
-- blocks exactly as returned, tool results as sent) so history replays unchanged after a
-- reload. `text` is what the UI shows; it is null for tool-result messages.
create table agent.messages (
    conversation_id  uuid not null references agent.conversations (id) on delete cascade,
    seq              integer not null,
    role             text not null check (role in ('user', 'assistant')),
    text             text,
    provider_content jsonb not null,
    created_at       timestamptz not null default now(),
    primary key (conversation_id, seq)
);

create table agent.runs (
    id              uuid primary key,
    conversation_id uuid not null references agent.conversations (id) on delete cascade,
    status          text not null check (status in ('running', 'completed', 'failed', 'cancelled')),
    model           text not null,
    task            text not null,
    limits          jsonb not null,
    usage           jsonb,
    error           jsonb,
    -- what the run changed before it ended: [{tool, entity_id}]
    committed       jsonb not null default '[]'::jsonb,
    started_at      timestamptz not null default now(),
    finished_at     timestamptz
);
create index runs_conversation_idx on agent.runs (conversation_id, started_at);

-- The streamed log (text deltas are stream-only and not stored).
create table agent.run_events (
    run_id     uuid not null references agent.runs (id) on delete cascade,
    seq        integer not null,
    type       text not null,
    data       jsonb not null,
    created_at timestamptz not null default now(),
    primary key (run_id, seq)
);
