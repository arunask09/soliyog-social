#!/usr/bin/env node
/*
 * Generate an image with Cloudflare Workers AI (FLUX.2) and save it.
 * Needs social/soliyog/automation/.env with CF_ACCOUNT_ID and CF_API_TOKEN
 * (create a token at dash.cloudflare.com -> My Profile -> API Tokens,
 *  template "Workers AI (Read + Run)"). Workers AI has a free daily allowance.
 *
 *   node gen-image.mjs "a prompt"  [--model flux-2-klein-9b] [--out ../assets/x.jpg] [--w 900] [--h 1200]
 *
 * No prompt -> uses the Soliyog drive-poster skyline prompt.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const envPath = resolve(here, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const { CF_ACCOUNT_ID: ACCOUNT, CF_API_TOKEN: TOKEN } = process.env;
if (!ACCOUNT || !TOKEN) {
  console.error('Missing CF_ACCOUNT_ID / CF_API_TOKEN — fill social/soliyog/automation/.env (see .env.example).');
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const prompt = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
  || 'Modern corporate office district at dusk, cluster of dark glass skyscrapers seen from '
   + 'below, deep indigo and navy tones, moody overcast sky, a few warm amber lit windows, '
   + 'clean minimal architecture, cinematic, no people, no text, no logos, muted low contrast';

const model = flag('model', 'flux-2-klein-9b');
const out = resolve(here, flag('out', `../assets/gen-${Date.now()}.jpg`));
const [w, h] = [flag('w', '900'), flag('h', '1200')];

const form = new FormData();
form.append('prompt', prompt);
form.append('width', String(w));
form.append('height', String(h));

console.log(`-> @cf/black-forest-labs/${model}  ${w}x${h}`);
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/black-forest-labs/${model}`,
  { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form },
);

const ct = res.headers.get('content-type') || '';
let buf;
if (ct.includes('json')) {
  const j = await res.json();
  if (j.success === false) { console.error(JSON.stringify(j.errors || j)); process.exit(1); }
  const b64 = j.result?.image ?? j.result?.image_b64;
  if (!b64) { console.error('no image in response:', JSON.stringify(j).slice(0, 400)); process.exit(1); }
  buf = Buffer.from(b64, 'base64');
} else if (res.ok) {
  buf = Buffer.from(await res.arrayBuffer());
} else {
  console.error(`HTTP ${res.status}`, await res.text());
  process.exit(1);
}

writeFileSync(out, buf);
console.log(`OK  ${out}  (${(buf.length / 1024).toFixed(0)} KB)`);
console.log('Tint/place it via the .skyline rules in templates/drive-poster-1080x1350.html');
