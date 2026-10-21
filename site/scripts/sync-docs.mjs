// Copies the repository's Markdown sources into the Starlight content folder,
// adding frontmatter (title, status badge, banner, edit link). docs/ stays the
// single source of truth; the copies are gitignored.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const out = resolve(here, '..', 'src', 'content', 'docs');
const blob = 'https://github.com/mbaneshi/bonyad/blob/dev/';

// The three kinds of document are deliberately labelled differently.
const pages = [
  {
    src: 'docs/manifesto.md',
    dest: 'manifesto.md',
    description: 'The principles Bonyad is built on: viewpoint, separations, change contract, non-goals.',
    badge: { text: 'Principles', variant: 'note' },
    banner: 'Founding statement of principles. It guides design; it is not a specification.',
    order: 1,
  },
  {
    src: 'docs/superpowers/specs/2026-10-21-first-slice-design.md',
    dest: 'specs/first-slice-design.md',
    title: 'Architecture: first-slice design',
    description: 'Draft architecture, schema, API, agent design and build sequence for the first slice.',
    badge: { text: 'Draft', variant: 'caution' },
    banner: 'Draft specification. It describes the implemented first slice; its draft label records review status, not implementation status. A real-provider smoke run remains the final acceptance gap.',
    order: 1,
  },
  {
    src: 'docs/decisions/0001-first-slice-decisions.md',
    dest: 'decisions/0001-first-slice-decisions.md',
    title: 'ADR 0001: first-slice decisions',
    description: 'Each first-slice choice, what it replaced, and how reversible it is.',
    badge: { text: 'Proposed', variant: 'caution' },
    banner: 'These decisions are proposed. None has been accepted yet.',
    order: 1,
  },
  {
    src: 'docs/decisions/0002-reduced-first-slice.md',
    dest: 'decisions/0002-reduced-first-slice.md',
    title: 'ADR 0002: reduced first slice and layout',
    description: 'The owner-directed reduction of the first milestone, and the agreed repository layout.',
    badge: { text: 'Proposed', variant: 'caution' },
    banner: 'This decision is proposed. It has not been accepted yet.',
    order: 2,
  },
  {
    src: 'CONTRIBUTING.md',
    dest: 'contributing.md',
    description: 'How work is organised: issues, worktrees, pull requests into dev, and releases.',
    badge: { text: 'Guide', variant: 'tip' },
    order: 1,
  },
];

// Relative links between synced documents become site URLs; anything else is left
// untouched (the link validator then flags a genuinely broken link at build time).
const siteUrl = (dest) => `/bonyad/${dest.replace(/\.md$/, '')}/`;
const bySource = new Map(pages.map((p) => [resolve(repo, p.src), siteUrl(p.dest)]));
function rewriteLinks(markdown, srcPath) {
  return markdown.replace(/\]\(([^)#\s]+\.md)(#[^)\s]*)?\)/g, (whole, target, hash = '') => {
    if (/^[a-z]+:/i.test(target)) return whole;
    const resolved = resolve(dirname(resolve(repo, srcPath)), target);
    return bySource.has(resolved) ? `](${bySource.get(resolved)}${hash})` : whole;
  });
}

for (const p of pages) {
  const raw = readFileSync(resolve(repo, p.src), 'utf8');
  const h1 = raw.match(/^# (.+)\n/);
  if (!h1) throw new Error(`${p.src}: expected a top-level "# Title" on the first line`);
  const body = rewriteLinks(raw.slice(h1[0].length).replace(/^\n+/, ''), p.src);

  const fm = [
    '---',
    `title: ${JSON.stringify(p.title ?? h1[1])}`,
    `description: ${JSON.stringify(p.description)}`,
    `editUrl: ${JSON.stringify(blob + p.src)}`,
    ...(p.banner ? ['banner:', `  content: ${JSON.stringify(p.banner)}`] : []),
    'sidebar:',
    `  order: ${p.order}`,
    '  badge:',
    `    text: ${JSON.stringify(p.badge.text)}`,
    `    variant: ${p.badge.variant}`,
    '---',
    '',
  ].join('\n');

  const footer = `\n\n---\n\nSource of truth: [\`${p.src}\`](${blob + p.src}) in the repository.\n`;
  const file = resolve(out, p.dest);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, fm + body.trimEnd() + footer);
  console.log(`synced ${p.src} -> ${p.dest}`);
}
