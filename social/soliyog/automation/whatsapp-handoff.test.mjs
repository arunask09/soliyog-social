import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whatsappCaption } from './whatsapp-handoff.mjs';

const tg = `Sales Trainee at Acme Pvt Ltd

Type: Full-time
Salary: ₹1,00,000–2,00,000/yr

Full listing and how to apply:
https://www.soliyog.com/jobs/1163
Not affiliated with Acme Pvt Ltd. Check their careers page before applying.

#salestrainee #fresherjobs
`;

test('whatsappCaption: bolds the title line', () => {
  assert.equal(whatsappCaption(tg).split('\n')[0], '*Sales Trainee at Acme Pvt Ltd*');
});

test('whatsappCaption: drops trailing hashtag lines and blank tail', () => {
  const out = whatsappCaption(tg);
  assert.ok(!out.includes('#salestrainee'));
  assert.ok(out.endsWith('Check their careers page before applying.'));
});

test('whatsappCaption: keeps the apply link and body untouched', () => {
  const out = whatsappCaption(tg);
  assert.ok(out.includes('https://www.soliyog.com/jobs/1163'));
  assert.ok(out.includes('Salary: ₹1,00,000–2,00,000/yr'));
});

test('whatsappCaption: leaves a title that already has * alone, and handles empty', () => {
  assert.equal(whatsappCaption('5* Hotel Steward\nbody').split('\n')[0], '5* Hotel Steward');
  assert.equal(whatsappCaption(''), '');
  assert.equal(whatsappCaption(undefined), '');
});
