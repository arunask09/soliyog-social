#!/usr/bin/env node
/*
 * Build the FB / IG / LinkedIn captions for a queued post, in Soliyog voice
 * (brand-guidelines.md: calm, factual, <=1 emoji, no fake urgency, 2 hashtags).
 * Facts come only from the soliyog.com listing (via lib-job.mjs). The one
 * "Soliyog's read" line is a generic-by-role note from role-notes.json, or omitted.
 *
 *   node build-caption.mjs <job url or id>      # prints the three captions
 *   node build-caption.mjs <slug> --write       # writes them into queue/<slug>.md
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fetchJob } from './lib-job.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const notes = JSON.parse(readFileSync(resolve(here, 'role-notes.json'), 'utf8'));

const arg = process.argv[2];
const write = process.argv.includes('--write');
if (!arg) { console.error('usage: build-caption.mjs <job url|id|slug> [--write]'); process.exit(1); }

// resolve a source_url: direct id/url, or a queue slug
let src = arg;
if (!/^\d+$|soliyog\.com\/jobs\//.test(arg)) {
  const qf = resolve(here, `../queue/${arg}.md`);
  if (!existsSync(qf)) { console.error(`no queue file queue/${arg}.md`); process.exit(1); }
  src = readFileSync(qf, 'utf8').match(/^source_url:\s*(\S+)/m)?.[1];
  if (!src) { console.error(`queue/${arg}.md has no source_url`); process.exit(1); }
}

const job = await fetchJob(src);
const roleTag = job.title.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
const t = job.title.toLowerCase();
const note = Object.entries(notes)
  .filter(([k]) => k !== '_comment')
  .map(([k, v]) => [Math.max(0, ...k.split('|').filter((x) => t.includes(x)).map((x) => x.length)), v])
  .filter(([len]) => len > 0)
  .sort((a, b) => b[0] - a[0])[0]?.[1];

const facts = [
  ['Location', job.location],
  ['Type', job.employmentType],
  ['Experience', job.experience],
  ['Salary', job.salary],
  ['Apply by', job.applyBy],
].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');

const body = (linkLine) => [
  `${job.title} at ${job.company}`,
  '',
  facts,
  '',
  note ? `Soliyog's read: ${note.read}` : null,
  note ? '' : null,
  linkLine,
  `Not affiliated with ${job.company}. Check their careers page before applying.`,
  '',
  `#${roleTag} #fresherjobs`,
].filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();

const out = {
  caption_instagram: body('Full listing and how to apply — link in bio.'),
  caption_facebook: body(`Full listing and how to apply: ${job.url}`),
  caption_linkedin: body('Full listing and how to apply — link in the comments.'),
};

if (write) {
  const qf = resolve(here, `../queue/${arg}.md`);
  let md = readFileSync(qf, 'utf8');
  for (const [k, v] of Object.entries(out)) {
    const block = `${k}: |\n${v.split('\n').map((l) => '  ' + l).join('\n')}`;
    md = md.match(new RegExp(`^${k}:`, 'm'))
      ? md.replace(new RegExp(`^${k}:.*?(?=^\\w+:|^---)`, 'ms'), block + '\n')
      : md.replace(/^---\s*$/m, `${block}\n---`);
  }
  writeFileSync(qf, md);
  console.log(`wrote 3 captions -> queue/${arg}.md`);
} else {
  for (const [k, v] of Object.entries(out)) console.log(`\n===== ${k} =====\n${v}`);
}
