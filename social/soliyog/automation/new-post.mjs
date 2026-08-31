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
role_tests: |
  # "What this role tests" — 3-4 bullets, read from THIS listing only (interview mode,
  # stated requirements, what the work actually is). No generic role-family stereotypes.
  # Leave unfilled to omit the block from the poster.
soliyog_read: |
  # "Why this one's worth a look" — 1-2 calm sentences grounded in what the listing says.
  # Leave unfilled to omit it from the poster and captions.
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
