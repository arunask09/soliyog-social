#!/usr/bin/env node
/*
 * Render one queued post's poster PNG. Portal facts come from lib-job.mjs; the poster
 * template's #post-data block is swapped and rendered via ../templates/render.sh.
 *
 *   node build-image.mjs <slug>
 *
 * Reads queue/<slug>.md front-matter: source_url (required), theme (dark|light), date,
 * role_tests + soliyog_read (per-post, authored from the listing), kicker (optional).
 * Output: queue/assets/<date>-<slug>.png   (2160x2700, for Facebook /photos)
 *         queue/assets/<date>-<slug>.jpg   (1080x1350, for Instagram /media — JPEG only)
 * Exit 3: images written, but the layout check failed (title overlapping the company,
 *         content outside the poster) — issues printed to stderr as "LAYOUT: ...".
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { HERE, readItem } from './lib.mjs';
import { fetchJob } from './lib-job.mjs';

const slug = process.argv[2];
if (!slug) { console.error('usage: build-image.mjs <slug>'); process.exit(1); }

const { front } = readItem(slug);
if (!front.source_url) { console.error(`queue/${slug}.md has no source_url`); process.exit(1); }

const job = await fetchJob(front.source_url);

// "What this role tests" + "why this one's worth a look" are authored per-post from the
// actual listing (queue front-matter role_tests / soliyog_read). No generic fallback:
// an unfilled block is omitted, not invented. Comment lines (# ...) in the block are skipped.
const cleanLines = (v) => String(v || '').split('\n')
  .map((s) => s.replace(/^[-*]\s*/, '').trim())
  .filter((s) => s && !s.startsWith('#'));
const roleTests = cleanLines(front.role_tests);
const soliyogRead = cleanLines(front.soliyog_read).join(' ').replace(/\s+/g, ' ').trim();

// drop legal-form / business-type noise so long names fit the hero lockup
const displayCompany = job.company
  .replace(/[\s,]+(private limited|pvt\.?\s*ltd\.?|limited|ltd\.?|llp|inc\.?|incorporated|corp\.?|corporation|multi[-\s]family office|family office)\.?$/i, '')
  .trim() || job.company;

const logoSlug = job.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const logoFile = ['png', 'webp', 'svg'].map((e) => `../assets/logos/${logoSlug}.${e}`)
  .find((p) => existsSync(resolve(HERE, '../templates', p))) || '';   // '' -> tile hidden

const data = {
  theme: front.theme === 'light' ? 'light' : 'dark',
  role: job.title,
  company: displayCompany,
  companyCity: [job.location, 'Hiring now'].filter(Boolean).join(' · '),
  logo: logoFile,
  kicker: front.kicker || 'Hiring',
  eligibility: [job.experience, job.industry].filter(Boolean).join(' · '),
  location: job.location,
  type: job.employmentType,
  experience: job.experience,
  salary: job.salary,
  applyBy: job.applyBy,
  posted: job.datePosted,
  'tests-title': roleTests.length ? 'What this role tests' : '',
  tests: roleTests,
  readtag: roleTests.length ? 'Based on the listing' : '',
  'why-title': soliyogRead ? "Why this one's worth a look" : '',
  why: soliyogRead,
  cta: `soliyog.com/jobs/${job.id}`,
  'disc-company': job.company,
};

const tpl = resolve(HERE, '../templates/drive-poster-1080x1350.html');
let html = readFileSync(tpl, 'utf8').replace(
  /<script id="post-data" type="application\/json">[\s\S]*?<\/script>/,
  `<script id="post-data" type="application/json">${JSON.stringify(data)}</script>`,
);

const buildName = `_build-${slug}-1080x1350.html`;
const buildPath = resolve(HERE, '../templates', buildName);
writeFileSync(buildPath, html);
let layout;
try {
  execFileSync('bash', ['./render.sh', buildName], { cwd: resolve(HERE, '../templates'), stdio: 'inherit' });
  layout = checkLayout(buildPath);
} finally {
  rmSync(buildPath, { force: true });
}

// The template measures itself after fitting (title vs company lockup, anything outside
// the canvas) and writes <body data-layout='{"ok":..}'>. Read it back with a second
// headless pass at the same window size, so the overlap check sees the exact layout.
function checkLayout(file) {
  const chrome = process.env.CHROME
    || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
      .find((p) => existsSync(p));
  if (!chrome) throw new Error('layout check: Chrome not found (set $CHROME)');
  const dom = execFileSync(chrome, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--allow-file-access-from-files',
    '--window-size=1080,1350', '--virtual-time-budget=6000', '--dump-dom', `file://${file}`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 << 20 });
  const m = dom.match(/<body[^>]*\sdata-layout="([^"]*)"/);
  if (!m) return { ok: false, issues: ['layout check did not run (no data-layout on <body>)'] };
  const unesc = m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return JSON.parse(unesc);
}

const outDir = resolve(HERE, '../queue/assets');
mkdirSync(outDir, { recursive: true });
const rendered = resolve(HERE, '../templates/exports', buildName.replace('.html', '.png'));
const base = `${front.date || 'nd'}-${slug}`;

// Facebook: the full 2x PNG.
const destPng = resolve(outDir, `${base}.png`);
renameSync(rendered, destPng);
console.log(`OK  ${destPng}`);

// Instagram: JPEG only, width <= 1440, aspect 4:5..1.91:1. 1080x1350 is IG's native portrait.
const destJpg = resolve(outDir, `${base}.jpg`);
await sharp(destPng)
  .resize(1080, 1350, { fit: 'cover' })
  .flatten({ background: '#ffffff' })
  .jpeg({ quality: 88, chromaSubsampling: '4:2:0', mozjpeg: true })
  .toFile(destJpg);
console.log(`OK  ${destJpg}  (${(statSync(destJpg).size / 1024).toFixed(0)} KB)`);

// Images are still written (so the broken one can be inspected), but a failed layout
// check exits 3 — prep-post holds the item instead of approving it, post.mjs won't publish.
if (!layout.ok) {
  for (const i of layout.issues) console.error(`LAYOUT: ${i}`);
  process.exit(3);
}
console.log(`layout OK  (hero ${layout.mode}, title ${layout.fontSize}px)`);
