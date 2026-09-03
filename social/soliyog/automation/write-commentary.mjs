#!/usr/bin/env node
/*
 * Auto-write the two commentary blocks (role_tests + soliyog_read) for a queue
 * draft, from its listing, via Gemini — then flip status: draft -> ready.
 *
 *   node write-commentary.mjs --slug <slug>            # generate, write, commit, push
 *   node write-commentary.mjs --slug <slug> --dry-run  # print what it would write; touch nothing
 *
 * Acts only on `status: draft` items whose role_tests AND soliyog_read are still
 * the scaffold placeholder (every non-blank line starts with '#'). Idempotent.
 *
 * Never fails the caller: a Gemini error, a malformed response, or a listing that
 * won't parse -> log and exit 0, leaving the draft untouched for a human. Emits
 * still_draft=1 to $GITHUB_OUTPUT whenever it did NOT flip the item to ready, so
 * the workflow can fall back to opening a needs-commentary issue.
 */
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERE, readItem, setBlock, setFront } from './lib.mjs';
import { fetchJob } from './lib-job.mjs';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const VOICE = `Soliyog is a careers platform for Indian freshers entering IT and finance jobs.
Voice: straight-talking, practical, on the reader's side. Sell realism, not hype.
Do not use: hype or "dream job" framing, fake urgency, "secret"/"trick" framing,
guaranteed-salary claims, talking down to the reader, more than one emoji, or an
em-dash used as a stylistic tic.`;

// ---- pure helpers (unit-tested, no network) --------------------------------

// A block scalar is "unfilled" when every non-blank line is a '#' scaffold comment.
export function isUnfilled(block) {
  return String(block || '')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .length === 0;
}

export function buildPrompt(job) {
  const facts = [
    ['Title', job.title], ['Company', job.company], ['Location', job.location],
    ['Employment type', job.employmentType], ['Experience', job.experience],
    ['Industry', job.industry], ['Salary', job.salary], ['Education', job.education],
  ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');

  return `${VOICE}

Write two things about the job below, grounded ONLY in this listing — no
role-family stereotypes, no invented detail.

1. role_tests: 3-4 short bullets (each under 14 words, no trailing period) on
   what this role actually tests or involves: the technical skills and tools
   named, the day-to-day work, the interview rounds. Lead with the substance of
   the job. Ignore application mechanics, screening-question rules, and
   equal-opportunity boilerplate unless they genuinely shape the work.
2. soliyog_read: 1-2 calm sentences (under 45 words total) on why it is worth a
   look. Name the hard parts. If the stated experience means this is NOT a
   fresher role, say so plainly.

Listing:
${facts}

Description:
${job.descriptionText || '(none)'}

Reply with ONLY a JSON object, no prose, no code fence:
{"role_tests": ["bullet", "bullet", "bullet"], "soliyog_read": "one or two sentences"}`;
}

const BANNED = [
  /\bdream (job|career|role)\b/i, /\bunlock\b/i, /\bsecret\b/i, /\btrick\b/i,
  /🚀/, /\bguaranteed\b/i, /\b\d+\s*LPA\b/i, /last chance/i, /only today/i,
];

export function parseAndValidate(text) {
  let raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('no JSON object in response');

  const obj = JSON.parse(raw.slice(start, end + 1));

  // em-dash used as punctuation -> comma; en-dash in numeric ranges is left alone
  const deDash = (s) => String(s).replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim();

  const bullets = (Array.isArray(obj.role_tests) ? obj.role_tests : [])
    .map((s) => deDash(s)).filter(Boolean);
  const read = deDash(obj.soliyog_read || '');

  if (bullets.length < 2 || bullets.length > 5) throw new Error(`role_tests has ${bullets.length} bullets`);
  for (const b of bullets) if (b.length > 140) throw new Error(`bullet too long: "${b.slice(0, 40)}..."`);
  if (read.length < 20 || read.length > 360) throw new Error(`soliyog_read length ${read.length}`);
  if (read.split(/(?<=[.!?])\s+/).filter(Boolean).length > 3) throw new Error('soliyog_read runs past 3 sentences');

  const all = [...bullets, read].join(' ');
  for (const re of BANNED) if (re.test(all)) throw new Error(`banned token ${re}`);

  return { role_tests: bullets, soliyog_read: read };
}

// ---- orchestration --------------------------------------------------------

function emit(key, val) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${val}\n`);
}

async function callGemini(prompt, key, attempt = 1) {
  const text = attempt === 1 ? prompt
    : `${prompt}\n\nYour previous reply broke the length or format rules. Reply again, strictly: valid JSON only, 3-4 bullets each under 14 words, soliyog_read under 45 words.`;
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Gemini ${j.error.status || res.status}: ${j.error.message || 'error'}`);
  const t = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!t.trim()) throw new Error('empty Gemini response');
  return t;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const slug = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : null;
  if (!slug) { console.error('usage: write-commentary.mjs --slug <slug> [--dry-run]'); process.exit(1); }

  let front;
  try { ({ front } = readItem(slug)); }
  catch (e) { console.log(`${e.message} — nothing to do`); emit('still_draft', '0'); return; }

  if (front.status !== 'draft') {
    console.log(`${slug} is "${front.status}", not draft — skipping`); emit('still_draft', '0'); return;
  }
  if (!isUnfilled(front.role_tests) || !isUnfilled(front.soliyog_read)) {
    console.log(`${slug} already has commentary — skipping`); emit('still_draft', '0'); return;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.log('GEMINI_API_KEY not set — leaving draft for a human'); emit('still_draft', '1'); return; }
  if (!front.source_url) { console.log(`${slug} has no source_url — leaving draft`); emit('still_draft', '1'); return; }

  let result;
  try {
    const job = await fetchJob(front.source_url);
    const prompt = buildPrompt(job);
    let lastErr;
    for (let attempt = 1; attempt <= 2 && !result; attempt++) {
      try {
        result = parseAndValidate(await callGemini(prompt, key, attempt));
      } catch (e) {
        lastErr = e;
        console.log(`  attempt ${attempt}: ${e.message}`);
      }
    }
    if (!result) throw lastErr;
    console.log(`commentary for ${slug} (${job.title} @ ${job.company}):`);
  } catch (e) {
    console.log(`could not generate commentary (${e.message}) — leaving draft for a human`);
    emit('still_draft', '1');
    return;
  }

  const bullets = result.role_tests.map((b) => `- ${b}`).join('\n');
  console.log(`\nrole_tests:\n${bullets}\n\nsoliyog_read:\n${result.soliyog_read}\n`);

  if (dry) {
    console.log('[dry-run] would write both blocks, set status: ready, commit + push');
    emit('still_draft', '1');
    return;
  }

  setBlock(slug, 'role_tests', bullets);
  setBlock(slug, 'soliyog_read', result.soliyog_read);
  setFront(slug, 'status', 'ready');

  const root = resolve(HERE, '../../..');
  const mdRel = `social/soliyog/queue/${slug}.md`;
  const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'inherit' });
  try {
    git('add', mdRel);
    git('commit', '-m', `prep: ${slug} -> ready (auto-commentary)`, '--', mdRel);
    try { git('push'); }
    catch { git('pull', '--rebase', '--autostash', 'origin', 'main'); git('push'); }
  } catch (e) {
    console.log(`could not commit (${e.message.split('\n')[0]}) — will retry next run`);
    emit('still_draft', '1');
    return;
  }

  emit('still_draft', '0');
  emit('slug', slug);
  console.log(`${slug} -> ready`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.log(`write-commentary: ${e.message} — skipping`); emit('still_draft', '1'); });
}
