#!/usr/bin/env node
/*
 * Generate an image with Google AI Studio's Gemini image models ("Nano Banana").
 * Needs GEMINI_API_KEY in env (set globally in ~/.claude/settings.json).
 *
 *   node gen-image-gemini.mjs "a prompt"  [--model gemini-3-pro-image] [--out ../assets/x.png] [--ar 3:4]
 *
 * Do not prompt for real company logos, brand marks, or copyrighted artwork —
 * generic architecture / scenery only.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY not set (restart Claude Code after adding it to settings.json).'); process.exit(1); }

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const prompt = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!prompt) { console.error('need a prompt'); process.exit(1); }

const model = flag('model', 'gemini-3-pro-image');
const ar = flag('ar', null);
const out = resolve(here, flag('out', `../assets/gemini-${Date.now()}.png`));

const body = { contents: [{ parts: [{ text: prompt }] }] };
if (ar) body.generationConfig = { imageConfig: { aspectRatio: ar } };

console.log(`-> ${model}${ar ? '  ' + ar : ''}`);
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(body) },
);
const j = await res.json();
if (j.error) { console.error(`ERROR ${j.error.status}: ${j.error.message}`); process.exit(1); }

const parts = j.candidates?.[0]?.content?.parts || [];
const img = parts.find((p) => p.inlineData?.data);
if (!img) { console.error('no image in response:', JSON.stringify(j).slice(0, 600)); process.exit(1); }

const buf = Buffer.from(img.inlineData.data, 'base64');
writeFileSync(out, buf);
console.log(`OK  ${out}  (${(buf.length / 1024).toFixed(0)} KB, ${img.inlineData.mimeType})`);
