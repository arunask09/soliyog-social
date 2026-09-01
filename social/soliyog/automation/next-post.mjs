#!/usr/bin/env node
/*
 * Auto-scaffold the next queue draft after a post publishes.
 *
 * Runs from daily-post.yml right after a successful publish. Scrapes the
 * soliyog.com job listings, picks the newest fresher/junior India role that
 * isn't already in the queue or the seen-jobs list, and shells out to
 * new-post.mjs to scaffold queue/<slug>.md as `status: draft`. A human still
 * writes the two commentary blocks and flips it to `ready` — this only keeps
 * the funnel fed.
 *
 *   node next-post.mjs             # scrape + scaffold + commit + push, emit GITHUB_OUTPUT
 *   node next-post.mjs --dry-run   # print the guard count, the pick, the target date; touch nothing
 *
 * Guard: stops once the queue holds 3 un-posted items (draft + ready + approved).
 * Non-fatal by design: a scrape failure or "no candidate" logs and exits 0 —
 * the post already went out and this must never fail the workflow.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERE, listItems } from './lib.mjs';

const LISTING = 'https://www.soliyog.com/jobs';
const SEEN_FILE = resolve(HERE, 'seen-jobs.json');
const PENDING = new Set(['draft', 'ready', 'approved']);
const BUFFER_CAP = 3;
const PAGES = 3;

const FRESHER_TITLE = /\b(junior|jr|trainee|graduate|apprentice|intern|internship|fresher|entry[\s-]?level)\b/i;
const SENIOR_EXP = /\b(?:[3-9]|[1-9]\d)\s*\+?\s*years?\b/i;
const INDIA_LOC = /\bindia\b/i;
const REMOTE_LOC = /\bremote\b|work from home|wfh/i;

// ---- pure helpers (unit-tested) --------------------------------------------

// Split the listings HTML into job cards and pull the fields printed on each card.
// Card shape (Next.js output): an overlay <a ... href="/jobs/ID"> then an <h3> title,
// a <p> company, and a <dl> with Experience / Location <dt><dd> pairs.
const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;|&#x27;/gi, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).trim();

export function parseListings(html) {
  const anchor = /<a\b[^>]*class="[^"]*absolute inset-0[^"]*"[^>]*href="\/jobs\/(\d+)"/g;
  const hits = [...html.matchAll(anchor)];
  const rows = [];
  for (let i = 0; i < hits.length; i++) {
    const id = hits[i][1];
    const chunk = html.slice(hits[i].index, hits[i + 1]?.index ?? html.length);
    const field = (label) =>
      decode(chunk.match(new RegExp(`${label}</dt><dd>([^<]*)</dd>`, 'i'))?.[1] || '');
    rows.push({
      id,
      title: decode(chunk.match(/<h3\b[^>]*>([^<]+)<\/h3>/i)?.[1] || ''),
      company: decode(chunk.match(/<p\b[^>]*>([^<]+)<\/p>/i)?.[1] || ''),
      experience: field('Experience'),
      location: field('Location'),
    });
  }
  return rows;
}

// Newest listing (page order) that is a fresher/junior India-or-remote role and
// not already seen. With { fallback: true }, if nothing matches, return the
// newest unseen row that at least has a title + company.
export function pickCandidate(rows, seen, { fallback = false } = {}) {
  const unseen = rows.filter((r) => r.id && !seen.has(r.id));
  const fresher = unseen.find((r) =>
    r.title && r.company &&
    FRESHER_TITLE.test(r.title) &&
    !SENIOR_EXP.test(r.experience) &&
    (!r.location || INDIA_LOC.test(r.location) || REMOTE_LOC.test(r.location)));
  if (fresher) return fresher;
  if (fallback) return unseen.find((r) => r.title && r.company) || null;
  return null;
}

// Day after the latest YYYY-MM-DD in the list; `today` when the list is empty.
export function nextDate(dates, today) {
  const latest = dates.filter(Boolean).sort().at(-1);
  if (!latest) return today;
  const d = new Date(`${latest}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// new-post.mjs's slug formula (date + title), with a numeric suffix if that
// slug already exists in the queue — repeated titles ("Article Trainee") are common.
export function uniqueSlug(date, title, existingSlugs) {
  const base = `${date}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
  const taken = new Set(existingSlugs);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export function countPending(items) {
  return items.filter((x) => PENDING.has(x.status)).length;
}

export function seenIds(items, seenList = []) {
  const ids = new Set(seenList.map(String));
  for (const x of items) {
    const m = String(x.source_url || '').match(/\/jobs\/(\d+)/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

// ---- orchestration --------------------------------------------------------

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (soliyog-social next-post)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function scrapeAll() {
  const rows = [];
  const seen = new Set();
  for (let p = 1; p <= PAGES; p++) {
    let html;
    try {
      html = await fetchText(p === 1 ? LISTING : `${LISTING}?page=${p}`);
    } catch (e) {
      if (p === 1) throw e;       // page 1 is required; later pages are best-effort
      console.log(`listings page ${p} failed (${e.message}) — using pages 1..${p - 1}`);
      break;
    }
    for (const r of parseListings(html)) {
      if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }
    }
  }
  return rows;
}

function readSeenFile() {
  if (!existsSync(SEEN_FILE)) return [];
  try { return JSON.parse(readFileSync(SEEN_FILE, 'utf8')); } catch { return []; }
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const items = listItems();

  const pending = countPending(items);
  if (pending >= BUFFER_CAP) {
    console.log(`buffer full — ${pending} pending item(s) in the queue, nothing to scaffold`);
    return;
  }

  const seen = seenIds(items, readSeenFile());

  let rows;
  try {
    rows = await scrapeAll();
  } catch (e) {
    console.log(`listings scrape failed (${e.message}) — skipping, no draft created`);
    return;
  }

  const pick = pickCandidate(rows, seen, { fallback: true });
  if (!pick) {
    console.log(`no un-seen listing found across ${PAGES} pages — nothing to scaffold`);
    return;
  }

  const date = nextDate(items.map((x) => x.date), new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10));
  const slug = uniqueSlug(date, pick.title, items.map((x) => x.slug));
  const url = `https://www.soliyog.com/jobs/${pick.id}`;
  console.log(`pick: ${pick.title} @ ${pick.company} (job ${pick.id}, "${pick.experience}", "${pick.location}") -> ${slug}`);

  if (dry) {
    console.log(`\n[dry-run] would: node new-post.mjs ${url} --slug ${slug} --date ${date}`);
    console.log('[dry-run] would: append id to seen-jobs.json, commit + push the draft, open a needs-commentary issue');
    return;
  }

  // scaffold via the existing path (writes queue/<slug>.md as draft, fills captions).
  // new-post.mjs calls fetchJob and exits non-zero if the listing has no JobPosting —
  // treat that as "bad candidate", record it as seen so we don't retry it, and stop.
  try {
    process.stdout.write(
      execFileSync('node', [resolve(HERE, 'new-post.mjs'), url, '--slug', slug, '--date', date], { encoding: 'utf8' }));
  } catch (e) {
    console.log(`new-post.mjs rejected job ${pick.id} (${e.message.split('\n')[0]}) — recording as seen, no draft`);
    writeFileSync(SEEN_FILE, JSON.stringify([...new Set([...readSeenFile(), pick.id])], null, 0) + '\n');
    recordSeenCommit();
    return;
  }

  writeFileSync(SEEN_FILE, JSON.stringify([...new Set([...readSeenFile(), pick.id])], null, 0) + '\n');

  const root = resolve(HERE, '../../..');
  const mdRel = `social/soliyog/queue/${slug}.md`;
  const seenRel = 'social/soliyog/automation/seen-jobs.json';
  const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'inherit' });
  try {
    git('add', mdRel, seenRel);
    git('commit', '-m', `prep: ${slug} -> draft (auto)`, '--', mdRel, seenRel);
    try { git('push'); }
    catch { git('pull', '--rebase', '--autostash', 'origin', 'main'); git('push'); }
  } catch (e) {
    // the post already went out — never fail the run. The draft is lost with the
    // fresh CI checkout and seen-jobs isn't persisted, so the next run re-picks it.
    console.log(`could not commit the draft (${e.message.split('\n')[0]}) — will retry next run`);
    return;
  }

  // issue title + body to files (repo pattern — see prep-post.mjs), so the workflow
  // never has to interpolate a job title through a shell string.
  const bodyFile = process.env.ISSUE_BODY_FILE || resolve(root, '_next-issue.md');
  const titleFile = `${bodyFile}.title`;
  writeFileSync(titleFile, `Write commentary — ${pick.title} at ${pick.company} (${date})`);
  writeFileSync(bodyFile, [
    `Auto-scaffolded \`social/soliyog/queue/${slug}.md\` as \`status: draft\`.`,
    '',
    `Listing: ${url}`,
    '',
    'Fill both front-matter blocks from the listing, then set `status: ready`:',
    '- `role_tests` — what this role actually tests (interview mode, stated requirements, the work itself). From this listing only.',
    "- `soliyog_read` — 1–2 calm sentences on why it's worth a look.",
    '',
    'Once `ready`, the afternoon prep job promotes it and opens the usual review issue.',
  ].join('\n'));

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT,
      `slug=${slug}\ntitle_file=${titleFile}\nbody_file=${bodyFile}\ncreated=1\n`);
  }
  console.log(`\nscaffolded queue/${slug}.md (draft) — write role_tests + soliyog_read, then set status: ready`);
}

function recordSeenCommit() {
  const root = resolve(HERE, '../../..');
  const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'inherit' });
  try {
    git('add', 'social/soliyog/automation/seen-jobs.json');
    git('commit', '-m', 'next-post: skip listing with no JobPosting');
    git('push');
  } catch { /* non-fatal */ }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.log(`next-post: ${e.message} — skipping`); });
}
