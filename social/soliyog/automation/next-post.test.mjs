import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseListings, pickCandidate, nextDate, countPending, seenIds, uniqueSlug } from './next-post.mjs';

const CARD = (id, title, company, exp, loc) => `
<a aria-hidden="true" tabindex="-1" class="absolute inset-0 z-10" href="/jobs/${id}"></a>
<div><span>Posted <!-- -->31 Aug 2026</span><span>IT</span></div>
<h3 class="font-nacelle text-base font-semibold text-gray-100">${title}</h3>
<p class="mt-0.5 text-sm font-medium text-fg-2">${company}</p>
<dl><div><dt>Qualification</dt><dd>See listing</dd></div>
<div><dt>Experience</dt><dd>${exp}</dd></div>
<div><dt>Location</dt><dd>${loc}</dd></div></dl>
<a aria-label="View details for ${title} at ${company}" class="group/apply">View details</a>`;

const PAGE = [
  CARD(94, 'Full Stack Developer (AI Agents)', 'Databricks', '3+ years', 'Bengaluru, India'),
  CARD(213, 'Junior Analyst', 'Objectways', 'Freshers', 'Chennai, India'),
  CARD(85, 'Software Engineer, Intern', 'Stripe', 'See listing', 'Remote'),
].join('\n<div class="card">\n');

test('parseListings pulls id, title, company, experience, location from each card', () => {
  const rows = parseListings(PAGE);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    id: '94',
    title: 'Full Stack Developer (AI Agents)',
    company: 'Databricks',
    experience: '3+ years',
    location: 'Bengaluru, India',
  });
  assert.equal(rows[1].id, '213');
  assert.equal(rows[1].title, 'Junior Analyst');
});

test('parseListings returns [] for markup with no job cards', () => {
  assert.deepEqual(parseListings('<html><body>no jobs here</body></html>'), []);
});

test('parseListings decodes HTML entities in title and company', () => {
  const rows = parseListings(CARD(9, 'R&amp;D Trainee', 'Chadha &amp; Chadha', 'Freshers', 'Delhi, India'));
  assert.equal(rows[0].title, 'R&D Trainee');
  assert.equal(rows[0].company, 'Chadha & Chadha');
});

test('pickCandidate does not treat a bare "Associate" as a fresher role', () => {
  const rows = parseListings(CARD(1, 'Threat Intelligence Associate', 'Deutsche Bank', 'Not specified', 'Pune, India'));
  assert.equal(pickCandidate(rows, new Set()), null);
});

test('pickCandidate picks the first fresher/junior India role not already seen', () => {
  const rows = parseListings(PAGE);
  const pick = pickCandidate(rows, new Set());
  assert.equal(pick.id, '213');
});

test('pickCandidate skips seen ids', () => {
  const rows = parseListings(PAGE);
  const pick = pickCandidate(rows, new Set(['213']));
  // 85 is an Intern (fresher title) with a non-India but remote location -> eligible
  assert.equal(pick.id, '85');
});

test('pickCandidate rejects senior experience even with a junior-ish title', () => {
  const rows = parseListings([
    CARD(1, 'Junior Architect', 'BigCo', '8+ years', 'Bengaluru, India'),
  ].join('\n'));
  assert.equal(pickCandidate(rows, new Set()), null);
});

test('pickCandidate falls back to newest unseen role when no fresher match', () => {
  const rows = parseListings([
    CARD(1, 'Staff Engineer', 'BigCo', '10+ years', 'London, UK'),
    CARD(2, 'Principal Engineer', 'BigCo', '12+ years', 'Berlin, Germany'),
  ].join('\n'));
  const pick = pickCandidate(rows, new Set(), { fallback: true });
  assert.equal(pick.id, '1');
});

test('pickCandidate returns null when fallback is off and nothing matches', () => {
  const rows = parseListings([
    CARD(1, 'Staff Engineer', 'BigCo', '10+ years', 'London, UK'),
  ].join('\n'));
  assert.equal(pickCandidate(rows, new Set()), null);
});

test('uniqueSlug builds a date+title slug and suffixes on collision', () => {
  assert.equal(uniqueSlug('2026-09-03', 'Article Trainee', []), '2026-09-03-article-trainee');
  assert.equal(
    uniqueSlug('2026-09-03', 'Article Trainee', ['2026-09-03-article-trainee']),
    '2026-09-03-article-trainee-2');
  assert.equal(
    uniqueSlug('2026-09-03', 'Article Trainee', ['2026-09-03-article-trainee', '2026-09-03-article-trainee-2']),
    '2026-09-03-article-trainee-3');
});

test('nextDate returns the day after the latest queue date', () => {
  assert.equal(nextDate(['2026-09-01', '2026-09-02', '2026-08-31']), '2026-09-03');
});

test('nextDate rolls over month boundaries', () => {
  assert.equal(nextDate(['2026-09-30']), '2026-10-01');
});

test('nextDate falls back to a given today when there are no queue dates', () => {
  assert.equal(nextDate([], '2026-09-05'), '2026-09-05');
});

test('countPending counts draft, ready and approved only', () => {
  const items = [
    { status: 'draft' }, { status: 'ready' }, { status: 'approved' },
    { status: 'posted' }, { status: 'failed' }, {},
  ];
  assert.equal(countPending(items), 3);
});

test('seenIds unions source_url ids with the seen-jobs list', () => {
  const items = [
    { source_url: 'https://www.soliyog.com/jobs/213' },
    { source_url: 'https://www.soliyog.com/jobs/4' },
    { slug: 'no-source' },
  ];
  const ids = seenIds(items, ['4', '99']);
  assert.deepEqual([...ids].sort(), ['213', '4', '99']);
});
