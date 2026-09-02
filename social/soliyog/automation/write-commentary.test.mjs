import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUnfilled, buildPrompt, parseAndValidate } from './write-commentary.mjs';

test('isUnfilled: scaffold placeholder (all # lines) is unfilled', () => {
  assert.equal(isUnfilled(`# "What this role tests" — 3-4 bullets, read from THIS listing only
# Leave unfilled to omit the block from the poster.`), true);
});

test('isUnfilled: empty / whitespace is unfilled', () => {
  assert.equal(isUnfilled(''), true);
  assert.equal(isUnfilled('   \n  \n'), true);
  assert.equal(isUnfilled(undefined), true);
});

test('isUnfilled: real content is filled', () => {
  assert.equal(isUnfilled('- A strong accounting foundation\n- Hands-on Tally and Excel'), false);
  assert.equal(isUnfilled('# a comment\n- but also a real bullet'), false);
});

test('buildPrompt carries the listing facts and the voice rules', () => {
  const p = buildPrompt({
    title: 'Junior Accountant', company: 'Acme LLP', location: 'Delhi',
    experience: 'Freshers welcome', descriptionText: 'Tally, Excel, GST returns.',
  });
  assert.match(p, /Junior Accountant/);
  assert.match(p, /Acme LLP/);
  assert.match(p, /Tally, Excel, GST returns\./);
  assert.match(p, /realism/i);
  assert.match(p, /role_tests/);
  assert.match(p, /soliyog_read/);
});

test('parseAndValidate: happy path', () => {
  const r = parseAndValidate(JSON.stringify({
    role_tests: ['Entries, ledgers, reconciliations', 'Hands-on Tally and Excel', 'Basic GST and TDS'],
    soliyog_read: 'A standard first accounting job in a family-office setup. The reconciliation work builds habits senior finance roles assume you already have.',
  }));
  assert.equal(r.role_tests.length, 3);
  assert.match(r.soliyog_read, /family-office/);
});

test('parseAndValidate: tolerates a ```json fence and surrounding prose', () => {
  const r = parseAndValidate('Here you go:\n```json\n{"role_tests":["a bullet here","b bullet here"],"soliyog_read":"Short and calm enough to pass the length check."}\n```');
  assert.equal(r.role_tests.length, 2);
});

test('parseAndValidate: rejects non-JSON', () => {
  assert.throws(() => parseAndValidate('I cannot help with that.'));
});

test('parseAndValidate: rejects too few / too many bullets', () => {
  assert.throws(() => parseAndValidate(JSON.stringify({ role_tests: ['only one'], soliyog_read: 'x'.repeat(40) })));
  assert.throws(() => parseAndValidate(JSON.stringify({
    role_tests: ['a', 'b', 'c', 'd', 'e', 'f'], soliyog_read: 'x'.repeat(40),
  })));
});

test('parseAndValidate: rejects an overlong soliyog_read', () => {
  assert.throws(() => parseAndValidate(JSON.stringify({
    role_tests: ['a bullet', 'b bullet'], soliyog_read: 'word '.repeat(120),
  })));
});

test('parseAndValidate: rejects banned hype tokens', () => {
  assert.throws(() => parseAndValidate(JSON.stringify({
    role_tests: ['a bullet', 'b bullet'],
    soliyog_read: 'Unlock your dream job with this secret role. It is a great fit.',
  })));
});

test('parseAndValidate: sanitises an em-dash rather than failing', () => {
  const r = parseAndValidate(JSON.stringify({
    role_tests: ['a bullet', 'b bullet'],
    soliyog_read: 'A calm first role — one that builds real habits over time.',
  }));
  assert.doesNotMatch(r.soliyog_read, /—/);
});
