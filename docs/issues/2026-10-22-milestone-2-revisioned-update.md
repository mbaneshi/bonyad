# Milestone 2 — project revisions for accepted geometry updates

Status: implementation branch; review required

## Gap

Milestone 1 persists only current state. A caller can read the project, another caller can
change it, and the first caller can silently overwrite that change. There is no accepted
revision or recoverable normalized snapshot.

## Smallest useful slice

Add a project-level monotonic revision head and normalized snapshots for the accepted state.
Apply the complete compare-and-swap and snapshot contract to `UpdateGeometry` first:

1. `GET /v1/project` returns the current project revision.
2. `PUT /v1/entities/{id}/geometry` requires `expected_revision` and complete replacement geometry.
3. PostgreSQL locks the project head, rejects a stale revision, updates geometry, increments the
   head, and writes the normalized snapshot in one transaction.
4. UI and agent callers send the revision they observed.
5. A rejected or invalid update changes neither current state nor revision history.

## Explicitly outside this issue

Create and delete are still Milestone 1 current-state operations. Their revision-aware acceptance
will be the next small slice after this boundary is reviewed. Authentication, collaboration,
undo semantics, dependency graphs, and calculation provenance remain outside this issue.

## Acceptance

- Current revision is stable across reload and increments exactly once after an accepted update.
- Two updates based on the same revision cannot both succeed.
- A stale update returns `409 revision_conflict` with expected and current revisions.
- Invalid geometry and kind mismatch leave geometry, head, and snapshots unchanged.
- The accepted revision has one normalized snapshot of entity heads and geometry rows.
- UI and agent use the same revision-aware API operation.
- Fresh-database migrations and all existing Milestone 1 tests remain green.
