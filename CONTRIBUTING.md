# Contributing

Bonyad is at design stage and has no license yet (Apache-2.0 is recommended, the
decision is the maintainer's). Until a `LICENSE` file lands, please open issues and
discussions, and hold off on non-trivial code contributions.

## The flow

1. **Issue first.** Every change starts as a GitHub issue; the issue body is the brief.
2. **One issue = one worktree branch off `dev`.** `scripts/new-issue <number> <slug>`
   creates `.worktrees/feat/<number>-<slug>/` from the freshest `origin/dev`. A
   short-lived `docs/<slug>` or `chore/<slug>` branch is fine for non-feature work.
   Do not keep long-lived parallel branches.
3. **One pull request into `dev`.** `dev` is the default, integration branch. Land
   work only by merging a PR; direct pushes to `dev` and `main` are blocked.
4. **Releases.** `main` is the released line and advances only by a version tag:
   the maintainer runs `scripts/promote vX.Y.Z`. Contributors never touch `main`.

After cloning, run **`scripts/setup-hooks`** once. Without it the local `pre-push`
guard is not wired, because `core.hooksPath` is not cloned.

## Bigger changes: write an RFC first

Anything that changes the shared model, spans several systems, touches identity or
secrets, or has plausible-but-wrong alternatives starts as a GitHub **Discussion**
in the RFC category. Link the outcome from the issue. Accepted outcomes are recorded
as decision records in `docs/decisions/`.

## Documents have a status

| Kind | Where | Meaning |
|---|---|---|
| Manifesto | `docs/manifesto.md` | Principles. Guides design; not a specification |
| Specification | `docs/superpowers/specs/` | Draft until reviewed; says what is proposed |
| Decision record | `docs/decisions/` | **Proposed** until the maintainer accepts it |

Do not describe a proposed or draft item as decided or built.

## Working on the website

The site lives in `site/` (Astro + Starlight) and renders the Markdown in `docs/`
and this file. Edit the sources, not the generated copies.

```bash
cd site
pnpm install
pnpm dev        # http://localhost:4321/bonyad/
pnpm build      # validates internal links, the /bonyad/ base path and both locales
```

Hand-written links inside `site/src/content/docs/` must start with `/bonyad/`.
The site publishes from `dev` independently of application releases.
