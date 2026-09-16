#!/usr/bin/env node
/*
 * Build the FB / IG / LinkedIn / Telegram captions for a queued post, in Soliyog voice
 * (brand-guidelines.md: calm, factual, <=1 emoji, no fake urgency, 2 hashtags).
 * Facts come only from the soliyog.com listing (via lib-job.mjs). The one
 * "Soliyog's read" line is the per-post soliyog_read note (authored from the
 * listing in queue/<slug>.md front-matter), or omitted when there's none.
 *
 *   node build-caption.mjs <job url or id>      # prints the four captions (no read line)
 *   node build-caption.mjs <slug> --write       # writes them into queue/<slug>.md
 *
 * Env (from automation/.env or real env, optional): TELEGRAM_INVITE_LINK — when set,
 * adds a "join our Telegram" cross-promotion line to the Instagram/LinkedIn captions.
 * Omitted entirely when unset.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fetchJob } from './lib-job.mjs';
import { parseFront } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const envp = resolve(here, '.env');
if (existsSync(envp)) for (const l of readFileSync(envp, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { TELEGRAM_INVITE_LINK } = process.env;

const arg = process.argv[2];
const write = process.argv.includes('--write');
if (!arg) { console.error('usage: build-caption.mjs <job url|id|slug> [--write]'); process.exit(1); }

// resolve a source_url: direct id/url, or a queue slug (which also carries soliyog_read)
let src = arg;
let front = {};
if (!/^\d+$|soliyog\.com\/jobs\//.test(arg)) {
  const qf = resolve(here, `../queue/${arg}.md`);
  if (!existsSync(qf)) { console.error(`no queue file queue/${arg}.md`); process.exit(1); }
  front = parseFront(readFileSync(qf, 'utf8'));
  src = front.source_url || null;
  if (!src) { console.error(`queue/${arg}.md has no source_url`); process.exit(1); }
}

const job = await fetchJob(src);
const roleTag = job.title.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
const read = String(front.soliyog_read || '').split('\n')
  .filter((l) => !l.trim().startsWith('#')).join(' ').replace(/\s+/g, ' ').trim();

const facts = [
  ['Location', job.location],
  ['Type', job.employmentType],
  ['Experience', job.experience],
  ['Salary', job.salary],
  ['Apply by', job.applyBy],
].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');

const body = (linkLine, { includeRead = true } = {}) => [
  `${job.title} at ${job.company}`,
  '',
  facts,
  '',
  includeRead && read ? `Soliyog's read: ${read}` : null,
  includeRead && read ? '' : null,
  linkLine,
  `Not affiliated with ${job.company.replace(/\.+$/, '')}. Check their careers page before applying.`,
  '',
  `#${roleTag} #fresherjobs`,
].filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();

// Telegram photo captions are capped at 1024 chars (much tighter than the 4096-char
// text-message limit). Drop the optional "read" line first — cheapest content to lose,
// already optional elsewhere — then hard-truncate as a last resort.
const telegramLink = `Full listing and how to apply:\n${src}`;
let capTelegram = body(telegramLink);
if (capTelegram.length > 1024) capTelegram = body(telegramLink, { includeRead: false });
if (capTelegram.length > 1024) capTelegram = capTelegram.slice(0, 1021) + '...';

// Cross-promotion: point FB/IG/LinkedIn readers at the Telegram channel. Omitted
// entirely when TELEGRAM_INVITE_LINK isn't set, so this ships safely before the
// human supplies the real link. Instagram doesn't render in-body links as
// clickable, so it gets a text-only nudge instead of the raw URL.
const telegramCta = (withLink) => !TELEGRAM_INVITE_LINK ? null
  : withLink ? `Join our Telegram for daily fresher job alerts: ${TELEGRAM_INVITE_LINK}`
  : 'Join our Telegram for daily fresher job alerts — link in bio.';

const out = {
  caption_instagram: [body('Full listing and how to apply — link in bio.'), telegramCta(false)].filter(Boolean).join('\n\n'),
  // FB down-ranks posts with an outbound link in the body — post.mjs drops the
  // real link into the first comment instead.
  caption_facebook: body('Full listing and how to apply — link in the comments.'),
  // LinkedIn (posted via Buffer) has no first-comment step, and doesn't down-rank
  // outbound links the way FB does — so the real link goes straight in the body.
  caption_linkedin: [body(telegramLink), telegramCta(true)].filter(Boolean).join('\n\n'),
  // Telegram (Bot API sendPhoto) also puts the real link straight in the body, but
  // its photo-caption limit (1024 chars) is much tighter than the other platforms'.
  // No CTA here — this audience is already on the channel.
  caption_telegram: capTelegram,
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
  console.log(`wrote ${Object.keys(out).length} captions -> queue/${arg}.md`);
} else {
  for (const [k, v] of Object.entries(out)) console.log(`\n===== ${k} =====\n${v}`);
}
