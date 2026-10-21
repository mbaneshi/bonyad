# tests/e2e: the whole slice in a real browser

Playwright drives Chromium against the real product: a throwaway PostgreSQL database
(migrations and seed applied), the Rust API, the agent service with a **scripted model**, and
the UI dev server. Viewports: 360, 768 and 1280 px.

```bash
just e2e      # needs the local stack (`just up`); uses this machine's Chrome, no browser download
```

CI runs the same suite against a plain `postgres:17` service and installs Chromium
(`.github/workflows/ci.yml`). Nothing here calls the real provider; that is `just agent-smoke`.

## How it works

`stack.mjs` is Playwright's `webServer`. It drops and recreates `bonyad_e2e`, applies
`db/migrations` and `db/seeds`, starts the API (58180), the agent (58190) and the UI (55273), and
tears all of it down, database included, when the run ends or fails. The ports differ from
`just serve` / `just ui`, so it never collides with a dev session.

Each test starts from an empty drawing and no conversations (`specs/fixtures.ts`).

## The scripted model

`fixtures/agent-script.json` is replayed in a loop (`BONYAD_FAKE_LOOP=1`), seven turns per
cycle: scenario 1 (3 turns), scenario 2 (3 turns), then one turn that never ends (for the stop
test). `specs/agent.spec.ts` consumes exactly one cycle per viewport, in file order. If you add an
agent test, change the script and the order together, or the cycle goes out of step.

## What is covered

| Spec | Proves |
|---|---|
| `manual.spec.ts` | The acceptance example by hand (point, line 4 m, surface 6 m², vertex to `۸` gives 12 m², reload keeps it, a bow-tie is refused in Persian and changes nothing); a zero-length line is refused next to its field |
| `agent.spec.ts` | Scenarios 1 and 2 through the assistant: streamed text, tool rows with the API's own answers, the drawing filling in without a reload, the API holding the moved vertex, the conversation restored after reload; stop cancels a run that never ends |

Every viewport also checks: no horizontal scroll, the open panel inside the viewport, the chat
input visible.
