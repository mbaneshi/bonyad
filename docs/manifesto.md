# Bonyad — manifesto

Bonyad (بنیاد, "foundation") is an independent, open-source engineering software
lab. It investigates a shared computational foundation for engineering software:
a core in which engineering knowledge can be defined, composed, computed,
validated, revised and presented — and on which each discipline is then built.

It develops on the founder's machine first. It is independent of Nexus.

## 1. The core idea

**Our core idea is to make engineering knowledge composable and cumulative.** We
want a foundation where new capabilities build on established meaning, data and
procedures rather than repeatedly reconstructing them.

Mathematics, physics and computer science contribute different parts:

| Foundation | Contribution to Bonyad |
|---|---|
| **Mathematics** | Precise structures, quantities, relationships, transformations, and conditions of validity |
| **Physics** | Meaning about the physical world: units, laws, assumptions, materials, loads, and boundary conditions |
| **Computer science** | Executable representations: types, algorithms, state, composition, persistence, and interfaces |

**The intersection is an executable engineering model:** something we can describe
precisely, calculate from, change through explicit operations, and compare against
requirements or observations.

## 2. Why LEGO, OOP, Rust, and functional programming matter

These are complementary lessons:

- **LEGO teaches composition:** parts have connection rules; an assembly can become
  a reusable part of something larger.
- **OOP teaches identity and encapsulation:** an object has meaning and permitted
  behavior. We favor composition rather than forcing engineering into one
  inheritance tree.
- **Rust teaches explicit contracts:** types and capabilities express what an
  operation accepts and permits. Some errors can be prevented before execution.
- **Functional programming teaches explicit transformation:** separate values and
  calculations from effects such as database writes or external requests.

No one technique guarantees engineering correctness. Together, they encourage us to
**make assumptions and boundaries explicit**. Whether the core is sufficient is
proven by real scenarios, not by a large abstract framework built ahead of a working
example.

## 3. What we separate — and connect

| Concept | Its responsibility |
|---|---|
| **Entity** | What exists, with stable identity |
| **State** | Its values and relationships |
| **Procedure** | How something is calculated or transformed |
| **Contract and constraint** | What inputs, states, and outcomes are acceptable |
| **Dependency** | Which results depend on which inputs |
| **Revision** | Which accepted state and history we mean |
| **Composition** | How existing pieces form reusable structures |
| **Presentation** | How we inspect and interact with the model |

Separation makes change manageable; explicit contracts make the separated parts work
together. Each concept has one consistent expression across PostgreSQL, Rust and
TypeScript; there are never three competing domain models.

Along the way we also keep apart: definition and instance, computation and
persistence, current state and revision, and authoritative data and derived results.

## 4. Who does what

**PostgreSQL preserves authoritative state and persistent definitions. Rust executes
engineering logic. React presents and manipulates the model. The agent interprets
intentions and invokes the same operations.**

The database is foundational, but rows alone do not supply meaning: our types,
relationships, contracts, and procedures do.

## 5. Change contract

```text
evaluate(state, request)          -> result | proposed changeset
accept(changeset, expected rev)   -> new revision | explicit conflict
```

An accepted change is traceable. A concurrent change never silently overwrites
another. A past revision never later acquires a different meaning. A computed
result is tied to its inputs and the procedure version, so staleness is
detectable.

This is the target contract. The first milestone implements current state only; the
revision machinery arrives with milestone 2 (see the path below).

## 6. Humans and agents

An AI agent is a first-class actor: same model and operations as a person, same
permissions, constraints and acceptance rules; its requests and changes carry its
identity; its suggestions stay distinct from approved data.

## 7. Fixed technical decisions

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

## 8. Non-goals and anti-goals

- No entity–attribute–value store, universal JSON schema, plugin framework or
  workflow engine ahead of need. Concrete types first; learn what they teach.
- No event sourcing, branching or collaborative editing without evidence that a
  slice needs it.
- A scaffold or an architecture document is not an outcome. The outcome is a
  working proof that one model can persist, compute, present, change and reload
  coherently.

## 9. Our paved path

We do not need to define all engineering upfront. We establish the foundation
through progressively stronger examples:

1. **Point, line, surface:** prove persistence, calculation, display, editing, and
   agent execution.
2. **Revision:** preserve accepted changes and recover earlier states.
3. **Relationships and constraints:** express intentional connections and
   dependencies.
4. **Composition:** turn a useful collection into a reusable definition.
5. **Surveying workflows:** add observations, coordinate systems, accuracy, and
   calculations.
6. **Further disciplines:** extend into civil, architecture, MEP, traffic, and urban
   planning using the accumulated foundation.

At every step, we ask:

> **Can this capability use existing concepts while preserving their meaning? What
> new concept is actually necessary?**

That is the ambition of Bonyad: **a small, coherent foundation that grows through
composition — so our engineering knowledge accumulates as the software expands.**
