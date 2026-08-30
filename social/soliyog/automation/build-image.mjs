#!/usr/bin/env node
/*
 * Render one queued post's poster PNG. Portal facts come from lib-job.mjs; the poster
 * template's #post-data block is swapped and rendered via ../templates/render.sh.
 *
 *   node build-image.mjs <slug>
 *
 * Reads queue/<slug>.md front-matter: source_url (required), theme (dark|light),
 * fields{} (optional overrides for the "Soliyog's read" bits), date.
 * Output: queue/assets/<date>-<slug>.png
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { HERE, readItem } from './lib.mjs';
import { fetchJob } from './lib-job.mjs';
import roleNotes from './role-notes.json' with { type: 'json' };

const slug = process.argv[2];
if (!slug) { console.error('usage: build-image.mjs <slug>'); process.exit(1); }

const { front } = readItem(slug);
if (!front.source_url) { console.error(`queue/${slug}.md has no source_url`); process.exit(1); }

const job = await fetchJob(front.source_url);
const t = job.title.toLowerCase();
const note = Object.entries(roleNotes)
  .filter(([k]) => k !== '_comment')
  .map(([k, v]) => [Math.max(0, ...k.split('|').filter((x) => t.includes(x)).map((x) => x.length)), v])
  .filter(([len]) => len > 0).sort((a, b) => b[0] - a[0])[0]?.[1];

const f = front.fields || {};
const logoSlug = job.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const logoFile = ['png', 'webp', 'svg'].map((e) => `../assets/logos/${logoSlug}.${e}`)
  .find((p) => existsSync(resolve(HERE, '../templates', p))) || '';   // '' -> tile hidden

const data = {
  theme: front.theme === 'light' ? 'light' : 'dark',
  role: job.title,
  company: job.company,
  companyCity: [job.location, 'Hiring now'].filter(Boolean).join(' · '),
  logo: logoFile,
  kicker: f.kicker || 'Hiring',
  eligibility: [job.experience, job.industry].filter(Boolean).join(' · '),
  location: job.location,
  type: job.employmentType,
  experience: job.experience,
  salary: job.salary,
  applyBy: job.applyBy,
  posted: job.datePosted,
  'tests-title': 'What this role tests',
  tests: note ? note.tests : null,
  readtag: note ? "Soliyog's take — not from the listing" : null,
  'why-title': "Soliyog's read: why this one's worth a look",
  cta: `soliyog.com/jobs/${job.id}`,
  'disc-company': job.company,
};
// if there's no role note, hide the whole "Soliyog's take" left column heading + bullets
if (!note) { data['tests-title'] = ''; data.tests = []; data.readtag = ''; }

const tpl = resolve(HERE, '../templates/drive-poster-1080x1350.html');
let html = readFileSync(tpl, 'utf8').replace(
  /<script id="post-data" type="application\/json">[\s\S]*?<\/script>/,
  `<script id="post-data" type="application/json">${JSON.stringify(data)}</script>`,
);

const buildName = `_build-${slug}-1080x1350.html`;
const buildPath = resolve(HERE, '../templates', buildName);
writeFileSync(buildPath, html);
try {
  execFileSync('bash', ['./render.sh', buildName], { cwd: resolve(HERE, '../templates'), stdio: 'inherit' });
} finally {
  rmSync(buildPath, { force: true });
}

const outDir = resolve(HERE, '../queue/assets');
mkdirSync(outDir, { recursive: true });
const rendered = resolve(HERE, '../templates/exports', buildName.replace('.html', '.png'));
const dest = resolve(outDir, `${front.date || 'nd'}-${slug}.png`);
renameSync(rendered, dest);
console.log(`OK  ${dest}`);
