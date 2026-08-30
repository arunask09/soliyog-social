#!/usr/bin/env node
/*
 * Fetch a hiring company's own logo via Brandfetch (used unmodified, to identify the
 * employer on a real job-listing post — nominative use, like a job-board card).
 *
 * Needs BRANDFETCH_CLIENT_ID in env or automation/.env
 * (free: brandfetch.com/developers -> "Logo Link" -> client ID).
 *
 *   node fetch-logo.mjs "Company Name"  [--out ../assets/logos/company.png]
 *
 * Resolves the domain via companies.json. Exits 3 (not an error) when the company
 * is unmapped or no logo is found — the poster then falls back to the text company line.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
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
const CLIENT_ID = process.env.BRANDFETCH_CLIENT_ID;

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const company = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!company) { console.error('need a company name'); process.exit(1); }

const map = JSON.parse(readFileSync(resolve(here, 'companies.json'), 'utf8'));
const domain = map[company]
  || map[Object.keys(map).find((k) => k.toLowerCase() === company.toLowerCase())];
if (!domain) {
  console.error(`no domain for "${company}" in companies.json — add a row. Falling back to text.`);
  process.exit(3);
}
if (!CLIENT_ID) {
  console.error('BRANDFETCH_CLIENT_ID not set (automation/.env). Falling back to text.');
  process.exit(3);
}

const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const outDir = resolve(here, '../assets/logos');
mkdirSync(outDir, { recursive: true });
const out = resolve(here, flag('out', `${outDir}/${slug}.png`));

// Brandfetch Logo Link is built for <img> embedding — it needs a browser UA + Referer,
// otherwise it redirects to the usage-guidelines page.
const url = `https://cdn.brandfetch.io/${domain}/w/400/h/400?c=${CLIENT_ID}`;
const res = await fetch(url, {
  redirect: 'follow',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    Referer: 'https://www.soliyog.com/',
    Accept: 'image/avif,image/webp,image/png,*/*',
  },
});
const ct = res.headers.get('content-type') || '';
if (!res.ok || !ct.startsWith('image/')) {
  console.error(`no logo for ${domain} (HTTP ${res.status}, ${ct}). Falling back to text.`);
  process.exit(3);
}
const ext = ct.includes('webp') ? 'webp' : ct.includes('svg') ? 'svg' : ct.includes('jpeg') ? 'jpg' : 'png';
const dest = out.replace(/\.\w+$/, `.${ext}`);
writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
console.log(`OK  ${dest}  (${domain})`);
