// Post-build guard for the GitHub Pages sub-path (/bonyad/) and the two locales.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const BASE = '/bonyad';
const problems = [];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let pages = 0;
for (const file of walk(dist)) {
  if (!file.endsWith('.html')) continue;
  pages++;
  const html = readFileSync(file, 'utf8');
  const rel = file.slice(dist.length);
  // Root-relative URLs that escape the base path would 404 on Pages.
  for (const m of html.matchAll(/\s(?:href|src)="(\/[^"]*)"/g)) {
    const url = m[1];
    if (url.startsWith('//')) continue;
    if (url !== BASE && !url.startsWith(BASE + '/')) problems.push(`${rel}: ${url} is outside ${BASE}/`);
  }
}

function mustContain(path, needle, why) {
  let html = '';
  try {
    html = readFileSync(join(dist, path), 'utf8');
  } catch {
    problems.push(`${path}: missing`);
    return;
  }
  if (!html.includes(needle)) problems.push(`${path}: ${why}`);
}

mustContain('index.html', 'lang="en"', 'English landing must be lang="en"');
mustContain('fa/index.html', 'dir="rtl"', 'Persian landing must be dir="rtl"');
mustContain('fa/index.html', 'lang="fa"', 'Persian landing must be lang="fa"');
for (const p of ['manifesto', 'specs/first-slice-design', 'decisions/0001-first-slice-decisions', 'decisions/0002-reduced-first-slice', 'contributing', 'roadmap']) {
  mustContain(`${p}/index.html`, '<title>', 'page not built');
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`check-dist: ${pages} pages OK (base ${BASE}/, en + fa)`);
