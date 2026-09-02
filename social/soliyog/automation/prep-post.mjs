#!/usr/bin/env node
/*
 * Afternoon prep for the daily poster (runs ~13:00 IST, the day before).
 *
 * Promotes the next `status: ready` queue item to `status: approved`, renders its
 * poster + captions, commits, and emits a GitHub Issue body so the post can be
 * vetoed / edited / approved from a phone before the 09:00 IST publish.
 *
 * Opt-out model: no response => the item posts. So this only ever promotes items a
 * human already marked `ready` (commentary written, caption built) — never `draft`.
 *
 *   node prep-post.mjs                # promote + build + commit + write issue body
 *   node prep-post.mjs --dry-run      # print what it would do; touch nothing
 *   node prep-post.mjs --slug <slug>  # prep this specific item (skips the date filter)
 *
 * Selection: oldest item with status === 'ready' and date <= tomorrow (IST).
 * Non-dry output: writes $ISSUE_BODY_FILE (default ./_issue-body.md) and appends
 * slug / title / body_file / open_issue to $GITHUB_OUTPUT when set.
 */
import { writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { HERE, listItems, readItem, setFront } from './lib.mjs';
import { fetchJob } from './lib-job.mjs';

const dry = process.argv.includes('--dry-run');
const slugArg = process.argv.includes('--slug')
  ? process.argv[process.argv.indexOf('--slug') + 1]
  : null;

// "tomorrow" in IST (UTC+5:30) as YYYY-MM-DD
const istMs = Date.now() + 5.5 * 3600 * 1000;
const istTomorrow = new Date(istMs + 24 * 3600 * 1000).toISOString().slice(0, 10);

const item = slugArg
  ? listItems().find((x) => x.slug === slugArg)
  : listItems()
      .filter((x) => (x.status === 'ready' || x.status === 'draft') && (x.date || '9999') <= istTomorrow)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];

if (!item) {
  console.log(slugArg ? `no queue item "${slugArg}"` : 'no `ready` or `draft` item due — nothing to prep');
  process.exit(slugArg ? 1 : 0);
}

const slug = item.slug;

// Safety net: a draft that reached prep without commentary (its daily-post
// auto-commentary attempt failed). Try once more here before giving up.
if (readItem(slug).front.status === 'draft') {
  if (dry) { console.log(`[dry-run] ${slug} is draft — would run write-commentary.mjs first`); process.exit(0); }
  console.log(`${slug} is still draft — attempting auto-commentary`);
  try {
    execFileSync('node', [resolve(HERE, 'write-commentary.mjs'), '--slug', slug], { stdio: 'inherit' });
  } catch { /* non-fatal — status check below decides */ }
  if (readItem(slug).front.status !== 'ready') {
    console.log(`${slug} could not be made ready — leaving it for a human, nothing to prep`);
    process.exit(0);
  }
}
const { front } = readItem(slug);
if (!front.source_url) { console.error(`queue/${slug}.md has no source_url`); process.exit(1); }
const job = await fetchJob(front.source_url);
console.log(`prep: ${slug}  (${job.title} @ ${job.company}, ${front.date})`);

const root = resolve(HERE, '../../..');
const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'inherit' });
const gitOut = (...a) => execFileSync('git', a, { cwd: root }).toString().trim();
const push = () => {
  try { git('push'); }
  catch { git('pull', '--rebase', '--autostash', 'origin', 'main'); git('push'); }
};

// 1. build captions + poster (build-image also refreshes portal facts from the listing)
if (!dry) {
  execFileSync('node', [resolve(HERE, 'build-caption.mjs'), slug, '--write'], { stdio: 'inherit' });
  execFileSync('node', [resolve(HERE, 'build-image.mjs'), slug], { stdio: 'inherit' });
}

const base = `${front.date}-${slug}`;
const mdRel = `social/soliyog/queue/${slug}.md`;
const pngRel = `social/soliyog/queue/assets/${base}.png`;
const jpgRel = `social/soliyog/queue/assets/${base}.jpg`;

// 2. promote + commit (so the 09:00 cron will publish it) + push
if (!dry) {
  setFront(slug, 'status', 'approved');
  git('add', mdRel, pngRel, jpgRel);
  git('commit', '-m', `prep: ${slug} -> approved`, '--', mdRel, pngRel, jpgRel);
  push();
}

// 3. assemble the review issue body
const sha = gitOut('rev-parse', 'HEAD');
const repo = process.env.GITHUB_REPOSITORY || process.env.GH_REPO || 'OWNER/REPO';
const rawPng = `https://raw.githubusercontent.com/${repo}/${sha}/${pngRel}`;

const { front: f2 } = readItem(slug); // re-read: captions were just (re)written
const capIG = f2.caption_instagram || '';
const capFB = f2.caption_facebook || f2.caption_instagram || '';
const platforms = [].concat(front.platforms || ['instagram', 'facebook']).join(' + ');

const title = `Review by 09:00 IST — ${job.title} at ${job.company} (${front.date})`;
const body = [
  `<!-- soliyog-review slug=${slug} -->`,
  `**${job.title}** at **${job.company}** — ${[job.location, job.experience, job.applyBy && 'apply by ' + job.applyBy].filter(Boolean).join(' · ')}`,
  '',
  `![poster](${rawPng})`,
  '',
  `**Posts to ${platforms} at 09:00 IST tomorrow — unless you act below.**`,
  '',
  '<details><summary>Instagram caption</summary>',
  '',
  '```',
  capIG,
  '```',
  '</details>',
  '',
  '<details><summary>Facebook caption</summary>',
  '',
  '```',
  capFB,
  '```',
  '</details>',
  '',
  `Listing: ${front.source_url}`,
  '',
  '---',
  '**Comment on this issue to act:**',
  '',
  '- _(nothing)_ → it posts at 09:00 IST',
  '- `skip` → held; fix on a laptop and set `status: ready` again',
  '- `read: <one or two sentences>` → rewrites the "Soliyog’s read" line, rebuilds the poster, re-posts it here',
].join('\n');

const bodyFile = process.env.ISSUE_BODY_FILE || resolve(root, '_issue-body.md');

if (dry) {
  console.log(`\n[dry-run] would: status -> approved, commit "prep: ${slug} -> approved", push, open issue\n`);
  console.log(`--- issue title ---\n${title}\n\n--- issue body ---\n${body}\n`);
  process.exit(0);
}

writeFileSync(bodyFile, body);
const titleFile = `${bodyFile}.title`;
writeFileSync(titleFile, title);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT,
    `slug=${slug}\nbody_file=${bodyFile}\ntitle_file=${titleFile}\nopen_issue=1\n`);
}
console.log(`\nissue title -> ${titleFile}\nissue body  -> ${bodyFile}`);
