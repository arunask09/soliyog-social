import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagLinks } from './lib.mjs';

test('tagLinks adds UTM params to soliyog.com links', () => {
  const out = tagLinks('Full listing and how to apply:\nhttps://www.soliyog.com/jobs/1386', 'linkedin');
  assert.equal(
    out,
    'Full listing and how to apply:\nhttps://www.soliyog.com/jobs/1386?utm_source=linkedin&utm_medium=social&utm_campaign=daily-post',
  );
});

test('tagLinks keeps trailing punctuation outside the URL', () => {
  assert.equal(
    tagLinks('See https://www.soliyog.com/jobs/5.', 'telegram', 'telegram-batch'),
    'See https://www.soliyog.com/jobs/5?utm_source=telegram&utm_medium=social&utm_campaign=telegram-batch.',
  );
});

test('tagLinks leaves other links and already-tagged links alone', () => {
  const tg = 'Join us: https://t.me/soliyog';
  assert.equal(tagLinks(tg, 'linkedin'), tg);
  const tagged = 'https://www.soliyog.com/jobs/1?utm_source=x';
  assert.equal(tagLinks(tagged, 'linkedin'), tagged);
});

test('tagLinks tags every soliyog link in a caption, with or without www', () => {
  const out = tagLinks('a https://soliyog.com/jobs/1 b https://www.soliyog.com/', 'facebook');
  assert.equal((out.match(/utm_source=facebook/g) || []).length, 2);
});
