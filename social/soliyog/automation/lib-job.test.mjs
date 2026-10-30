import { test } from 'node:test';
import assert from 'node:assert/strict';
import { experienceFromText } from './lib-job.mjs';

test('experienceFromText reads a real requirement', () => {
  assert.equal(experienceFromText('Candidates with 2 years of relevant experience preferred.'), '2+ yrs');
  assert.equal(experienceFromText('Requires 3-5 years experience in Java.'), '3–5 yrs');
  assert.equal(experienceFromText('Need 1 to 3 years of software development experience'), '1–3 yrs');
});

test('experienceFromText ignores company boilerplate (job 1325, Point72)', () => {
  const blurb = 'Building on more than 30 years of investing experience, Point72 seeks to deliver superior returns.';
  assert.equal(experienceFromText(blurb), '');
  assert.equal(experienceFromText('With 12 years of operating experience, our firm leads the market.'), '');
});

test('experienceFromText skips boilerplate but still finds a later real requirement', () => {
  const text = 'More than 30 years of investing experience. You have 2+ years experience with Python.';
  assert.equal(experienceFromText(text), '2+ yrs');
});

test('experienceFromText returns empty when nothing matches', () => {
  assert.equal(experienceFromText('Open to final-year students.'), '');
  assert.equal(experienceFromText(''), '');
});
