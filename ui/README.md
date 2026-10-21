# ui: the drawing workspace

React 19 + strict TypeScript + Vite. Persian, right-to-left, mobile first. It talks to the
Rust API and nothing else; the server stays the only source of truth.

```bash
just serve      # API on 127.0.0.1:58080 (needs the local stack: see infra/README.md)
just ui         # this app on http://127.0.0.1:55173, /v1 proxied to the API
just ui-check   # typecheck, tests, generated client is current, production build
```

## What it does

Create, select, move, measure and delete points, lines and surfaces: the seven operations,
no more. Select from the canvas or the list; edit coordinates in the properties panel (a side
column on wide screens, a bottom sheet on narrow ones). Lengths and areas come from the API's
`measure`, never from the browser.

- **Errors.** A 422 shows each rule next to its field in Persian; a lost connection shows a
  banner with a retry; a rejected edit changes nothing on screen.
- **Numbers.** Coordinates accept Persian and Arabic-Indic digits and the Arabic decimal
  separator. They are displayed Latin and left-to-right (`<bdi dir="ltr">`).
- **Retries.** Each "new" form carries one client-chosen id, so a repeated submit cannot
  create a duplicate.
- **Assistant.** A chat tab in the side panel streams the agent service's events (text, tool
  progress, verified results, failures) and re-reads the drawing as each change lands; the last
  conversation is restored on reload. See `../agent/README.md`.
- **Strings.** One table, `src/fa.ts`. A real i18n library is deferred.

## The client is generated

`src/api/generated/schema.d.ts` is produced from `../contracts/openapi.json`
(`pnpm gen:api`) and never edited by hand. `pnpm gen:api:check` fails when it is stale.
There is no hand-written fetch: `src/api/client.ts` wraps the typed client and throws
`ApiError` carrying the API's stable `code` and `violations[]`.

TypeScript is pinned to 5.9: the client generator needs its JavaScript API, which TypeScript
7 does not provide yet.

## Layout

| Path | Role |
|---|---|
| `src/model.ts`, `numbers.ts`, `view.ts` | Pure: drafts, number parsing, fitting the model to the screen |
| `src/api/` | Generated types, typed client, hooks (TanStack Query) |
| `src/components/` | Canvas (SVG, Y flipped, 44px hit targets), list, form, measures |
| `src/fa.ts` | Persian strings, including one message per violation code |
