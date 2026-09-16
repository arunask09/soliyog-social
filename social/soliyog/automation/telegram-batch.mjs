#!/usr/bin/env node
/*
 * Post several bare-facts listings in one Telegram message, several times a day —
 * the high-volume counterpart to the once-a-day curated post (post.mjs). No human
 * review: there's no commentary to review here, just facts already public on
 * soliyog.com, so this runs fully autonomously off its own cron.
 *
 * Reuses next-post.mjs's scraping via pickCandidates(), but with { fresherOnly: false }
 * — unlike the curated pipeline, this takes ANY current listing, not just fresher/
 * junior/India-or-remote roles, to get real volume (the fresher-only bar left just
 * 1 of 72 current listings eligible). Uses lib-job.mjs's fetchJob() for the per-listing
 * salary/education/url the card scrape doesn't carry.
 *
 * Dedup is its own file (telegram-batch-seen.json), separate from seen-jobs.json —
 * this never consults the curated pipeline's state, so a listing already featured
 * there (or sitting in the queue) is still fair game here too. Different channel,
 * different audience — the same open role is worth mentioning in both. The only
 * thing this avoids re-posting is a listing THIS feed has already sent.
 *
 *   node telegram-batch.mjs             # scrape + post + commit + push
 *   node telegram-batch.mjs --dry-run   # print the composed message; touch nothing
 *
 * Env (from automation/.env or real env): TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID
 * (same credentials post.mjs uses for the curated Telegram post — no new secrets).
 *
 * Resilience: a scrape/parse failure is non-fatal (log + exit 0) — this is a
 * supplementary channel, never worth failing the workflow over an upstream site
 * hiccup. A real Telegram send failure DOES exit 1 — that's within our control and
 * should surface as a red X.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { HERE } from './lib.mjs';
import { scrapeAll, pickCandidates } from './next-post.mjs';
import { fetchJob } from './lib-job.mjs';

const envp = resolve(HERE, '.env');
if (existsSync(envp)) for (const l of readFileSync(envp, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID } = process.env;

const MAX_PER_BATCH = 3;
const SEEN_FILE = resolve(HERE, 'telegram-batch-seen.json');
const dry = process.argv.includes('--dry-run');

function readSeen(file) {
  if (!existsSync(file)) return [];
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return []; }
}

// One emoji-per-field block, competitor-style density — the batch feed's own voice,
// distinct from the calm single-post captions. Fields are omitted when the listing
// doesn't have them (never invented — same rule as build-caption.mjs). The disclaimer
// line is not a voice choice: it's on every listing regardless of format.
function formatListing(job) {
  const lines = [
    `🌟${job.company} is Hiring`,
    `👩‍💼Role: ${job.title}`,
    job.education ? `🎓Qualification: ${job.education}` : null,
    job.experience ? `💼 Experience: ${job.experience}` : null,
    job.location ? `📍Location: ${job.location}` : null,
    job.salary ? `💰Salary: ${job.salary}` : null,
    '',
    `👉 Apply Link 🔗${job.url}`,
    `(Not affiliated with ${job.company.replace(/\.+$/, '')} — verify on their careers page)`,
  ];
  return lines.filter((l) => l !== null).join('\n');
}

async function main() {
  const batchSeen = readSeen(SEEN_FILE);
  const seen = new Set(batchSeen);

  let rows;
  try {
    rows = await scrapeAll();
  } catch (e) {
    console.log(`listings scrape failed (${e.message}) — skipping, no batch posted`);
    return;
  }

  const candidates = pickCandidates(rows, seen, MAX_PER_BATCH, { fresherOnly: false });
  if (!candidates.length) {
    console.log('no unposted listings found — nothing to post');
    return;
  }

  const jobs = [];
  const newlySeen = [];
  for (const c of candidates) {
    try {
      jobs.push(await fetchJob(c.id));
    } catch (e) {
      console.log(`skipping job ${c.id} (${e.message.split('\n')[0]}) — recording as seen`);
    }
    newlySeen.push(c.id);
  }
  if (!jobs.length) {
    console.log('every candidate failed to fetch — nothing to post');
    writeFileSync(SEEN_FILE, JSON.stringify([...new Set([...batchSeen, ...newlySeen])], null, 0) + '\n');
    return;
  }

  const text = jobs.map(formatListing).join('\n\n');
  console.log(`composed ${jobs.length}-listing batch (${text.length} chars)`);

  if (dry) {
    console.log(`\n--- Telegram (sendMessage) ---\n`, { chat_id: TELEGRAM_CHANNEL_ID || '(TELEGRAM_CHANNEL_ID not set)', text });
    console.log('\nwould mark seen:', newlySeen);
    return;
  }

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
    console.error('missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL_ID — cannot post');
    process.exit(1);
  }

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHANNEL_ID, text, disable_web_page_preview: true }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`telegram: ${j.description || 'sendMessage failed'}`);
  console.log('Telegram batch ok', j.result.message_id);

  writeFileSync(SEEN_FILE, JSON.stringify([...new Set([...batchSeen, ...newlySeen])], null, 0) + '\n');

  const root = resolve(HERE, '../../..');
  const seenRel = 'social/soliyog/automation/telegram-batch-seen.json';
  const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'inherit' });
  try {
    git('add', seenRel);
    git('commit', '-m', `telegram-batch: ${jobs.length} listing(s) posted`, '--', seenRel);
    try { git('push'); }
    catch { git('pull', '--rebase', '--autostash', 'origin', 'main'); git('push'); }
  } catch (e) {
    // the message already sent — never fail the run over a commit/push hiccup. Worst
    // case, telegram-batch-seen.json isn't persisted and one of today's ids gets
    // re-picked (and re-posted) on the next run — a rare duplicate, not data loss.
    console.log(`could not commit ${seenRel} (${e.message.split('\n')[0]}) — will retry next run`);
  }
}

main().catch((e) => { console.error(`telegram-batch: ${e.message}`); process.exit(1); });
