# Bonyad — manifesto

Bonyad (بنیاد, "foundation") is an independent, open-source engineering software
lab. It investigates a shared computational foundation for engineering software:
a core in which engineering knowledge can be defined, composed, computed,
validated, revised and presented — and on which each discipline is then built.

It develops on the founder's machine first. It is independent of Nexus.

## 1. Viewpoint

We look at engineering through mathematics and computer science: entities, typed
values, relationships, constraints, procedures, composition and revisions, all
defined explicitly.

- **LEGO** — a small set of parts, explicit connection rules, and any assembly
  can become a reusable part.
- **Type systems / Rust semantics** — types, capabilities and contracts say what
  is valid and which operations are allowed on it.
- **Functional programming** — state, computation, proposed change and committed
  effect are kept apart; inputs, outputs and state transitions are explicit.
- **OOP / composition** — reusable structure and behaviour, without one universal
  inheritance tree.

These guide design. Whether the core is sufficient is proven by real scenarios,
not by a large abstract framework built ahead of a working example.

## 2. Goal: cumulative knowledge

A new capability must be able to use earlier definitions, data, procedures and
contracts. Once units, coordinates, dependency or revision exist, the next
discipline extends that infrastructure instead of growing a parallel model.

**Composition is first-class:** an assembly has identity, type, parameters and a
version, and can itself be used as a part.

## 3. Separations (each is a contract, not a convention)

| Concept | Question it answers |
|---|---|
| Entity & identity | What exists, and how do we refer to it stably? |
| State vs procedure | What holds now vs. what computes or transforms? |
| Geometry vs presentation | Where is it vs. how do we draw it? |
| Definition vs instance | What kind of thing vs. this particular one? |
| Computation vs persistence | What is derived vs. what is stored? |
| Current state vs revision | What holds now vs. what was accepted, and how? |
| Authoritative vs derived | What can we trust as source vs. what can be recomputed? |

Core order of concepts: **Entity → Procedure → Revision → Component/composition.**
Each has one consistent expression across PostgreSQL, Rust and TypeScript; there
are never three competing domain models.

## 4. Change contract

```text
evaluate(state, request)          -> result | proposed changeset
accept(changeset, expected rev)   -> new revision | explicit conflict
```

An accepted change is traceable. A concurrent change never silently overwrites
another. A past revision never later acquires a different meaning. A computed
result is tied to its inputs and the procedure version, so staleness is
detectable.

## 5. Humans and agents

An AI agent is a first-class actor: same model and operations as a person, same
permissions, constraints and acceptance rules; its requests and changes carry its
identity; its suggestions stay distinct from approved data.

## 6. Fixed technical decisions

- Dockerized, persistent volumes; local development first.
- Full self-hosted Supabase (official Docker Compose baseline): Auth, Storage,
  Realtime, Studio, Edge Functions, PostgreSQL functions.
- PostgreSQL holds authoritative state and stored definitions.
- Rust is the server and the engineering-computation core.
- React + TypeScript for the UI; Edge Functions in TypeScript for integration
  where useful. A service being available does not oblige us to invent a use for
  it.
- Persian, RTL, responsive and mobile-usable from the start.
- Every procedure has exactly one executable owner; its logic is not duplicated
  across Rust, SQL and Edge Functions.

## 7. Non-goals and anti-goals

- No entity–attribute–value store, universal JSON schema, plugin framework or
  workflow engine ahead of need. Concrete types first; learn what they teach.
- No event sourcing, branching or collaborative editing without evidence that a
  slice needs it.
- A scaffold or an architecture document is not an outcome. The outcome is a
  working proof that one model can persist, compute, present, change and reload
  coherently.

## 8. Path of proof

Disciplines in order: surveying, civil, architecture, MEP, traffic, urbanism.
The first complete flow is surveying: create project → enter points → table and
map → build a region → compute → change a point → revise → recompute → reopen
and export.

**Guiding question for every extension: which existing concepts express this, and
which new concept is genuinely needed?**
