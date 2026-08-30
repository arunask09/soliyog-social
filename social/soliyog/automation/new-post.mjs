#!/usr/bin/env node
/*
 * Scaffold a queue item from one soliyog.com listing.
 *   node new-post.mjs <job url or id> [--slug s] [--date YYYY-MM-DD]
 *
 * Fetches portal facts, alternates theme dark/light by date, writes queue/<slug>.md
 * as status:draft, then fills captions via build-caption.mjs --write.
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { HERE, QUEUE, qpath } from './lib.mjs';
import { fetchJob } from './lib-job.mjs';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const jobArg = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!jobArg) { console.error('usage: new-post.mjs <job url or id> [--slug s] [--date d]'); process.exit(1); }

const job = await fetchJob(jobArg);
const date = flag('date') || new Date().toISOString().slice(0, 10);
const slug = flag('slug') || `${date}-${job.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
// alternate: day-of-month parity
const theme = (new Date(date).getUTCDate() % 2 === 0) ? 'dark' : 'light';

mkdirSync(QUEUE, { recursive: true });
if (existsSync(qpath(slug))) { console.error(`queue/${slug}.md already exists`); process.exit(1); }

const md = `---
slug: ${slug}
date: ${date}
status: draft
theme: ${theme}
platforms: [instagram, facebook]
source_url: ${job.url}
fields:
  # optional overrides for Soliyog's own commentary; portal facts come from source_url
caption_instagram:
caption_facebook:
caption_linkedin:
image_url:
posted_at:
post_ids:
---

# ${job.title} — ${job.company}
Portal facts (auto): ${job.location || '—'} · ${job.employmentType || '—'} · ${job.experience || '—'}${job.salary ? ' · ' + job.salary : ''}${job.applyBy ? ' · apply by ' + job.applyBy : ''}

Review, then set \`status: approved\`.
`;
writeFileSync(qpath(slug), md);
console.log(`created queue/${slug}.md  (theme: ${theme})`);

execFileSync('node', [resolve(HERE, 'build-caption.mjs'), slug, '--write'], { stdio: 'inherit' });
