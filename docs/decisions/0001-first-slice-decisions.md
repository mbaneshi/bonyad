# ADR 0001 — First-slice decisions

Date: 2026-10-21 · Status: proposed (founder review pending)

Context: see `docs/superpowers/specs/2026-10-21-first-slice-design.md`.

| # | Decision | Alternative rejected | Reversibility |
|---|---|---|---|
| 1 | SQLx typed SQL, no ORM | Diesel | Cheap: queries are isolated in one module |
| 2 | Domain tables in schema `bonyad`, not exposed through PostgREST; no write grants for `authenticated` | Direct browser writes via `supabase-js` | Cheap: add a grant |
| 3 | Rust verifies the Supabase JWT, then runs each request as role `authenticated` with the caller's claims, so RLS is the single permission source | Rust-side ACL, or service-role + manual filtering | Medium |
| 4 | Length and area are derived and never stored in this slice | Persist results | Cheap; revisit with dependency tracking |
| 5 | Ownership rule: Postgres = integrity + atomic accept + revision CAS; Rust = geometry rules + computation; Edge Functions = outside integration | Geometry in SQL functions | Medium; revisit if a rule needs both |
| 6 | Revisions are snapshot + changeset per revision | Event sourcing | Cheap at this size |
| 7 | Defer React Hook Form, Zod and Radix | Add now | Cheap |
| 8 | Bonyad runs its own Supabase compose project on shifted ports; the existing local Supabase stack is never reused | Share the running stack | Cheap |
| 9 | License: recommend Apache-2.0; **not applied** | AGPL-3.0, MIT | Founder's decision |
