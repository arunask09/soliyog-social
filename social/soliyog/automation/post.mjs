#!/usr/bin/env node
/*
 * Publish one approved queue item to Facebook + Instagram via the Meta Graph API.
 *
 *   node post.mjs                 # next approved item with date <= today
 *   node post.mjs --slug <slug>   # a specific item
 *   node post.mjs --dry-run       # print payloads, post nothing
 *
 * Env (from automation/.env or real env): META_TOKEN, FB_PAGE_ID, IG_USER_ID, GH_REPO
 * (GH_REPO = "user/repo" of the PUBLIC repo this folder is pushed to — for the jsDelivr URL).
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { HERE, listItems, readItem, setFront } from './lib.mjs';

const envp = resolve(HERE, '.env');
if (existsSync(envp)) for (const l of readFileSync(envp, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { META_TOKEN, FB_PAGE_ID, IG_USER_ID, GH_REPO } = process.env;
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const slugArg = args[args.indexOf('--slug') + 1];
const G = 'https://graph.facebook.com/v21.0';

if (!dry && (!META_TOKEN || !FB_PAGE_ID || !IG_USER_ID)) { console.error('missing META_TOKEN / FB_PAGE_ID / IG_USER_ID'); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);
const item = slugArg
  ? { slug: slugArg }
  : listItems().filter((x) => x.status === 'approved' && (x.date || '9999') <= today).sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
if (!item) { console.log('nothing approved and due — no post today'); process.exit(0); }
const slug = item.slug;
const { front } = readItem(slug);
console.log(`posting: ${slug}`);

// 1. build the image
execFileSync('node', [resolve(HERE, 'build-image.mjs'), slug], { stdio: 'inherit' });
const png = `social/soliyog/queue/assets/${front.date}-${slug}.png`;

// 2. commit + push so jsDelivr can serve it, pin the commit SHA
let imageUrl = front.image_url;
if (!dry && !imageUrl) {
  const root = resolve(HERE, '../../..');
  execFileSync('git', ['add', png], { cwd: root, stdio: 'inherit' });
  execFileSync('git', ['commit', '-m', `post: ${slug} image`, '--', png], { cwd: root, stdio: 'inherit' });
  execFileSync('git', ['push'], { cwd: root, stdio: 'inherit' });
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
  imageUrl = `https://cdn.jsdelivr.net/gh/${GH_REPO}@${sha}/${png}`;
  setFront(slug, 'image_url', imageUrl);
}
imageUrl = imageUrl || `https://cdn.jsdelivr.net/gh/${GH_REPO || 'USER/REPO'}@main/${png}`;

const capFB = front.caption_facebook || front.caption_instagram || '';
const capIG = front.caption_instagram || front.caption_facebook || '';
console.log(`image: ${imageUrl}`);
if (dry) {
  console.log('\n--- FB /photos ---\n', { url: imageUrl, caption: capFB });
  console.log('\n--- IG /media ---\n', { image_url: imageUrl, caption: capIG });
  process.exit(0);
}

const api = async (path, body) => {
  const r = await fetch(`${G}/${path}`, { method: 'POST', body: new URLSearchParams({ ...body, access_token: META_TOKEN }) });
  const j = await r.json();
  if (j.error) throw new Error(`${path}: ${j.error.message}`);
  return j;
};

try {
  const platforms = [].concat(front.platforms || ['instagram', 'facebook']);
  const post_ids = {};
  if (platforms.includes('facebook')) {
    post_ids.facebook = (await api(`${FB_PAGE_ID}/photos`, { url: imageUrl, caption: capFB })).post_id || (await Promise.resolve()).id;
    console.log('FB ok', post_ids.facebook);
  }
  if (platforms.includes('instagram')) {
    const c = await api(`${IG_USER_ID}/media`, { image_url: imageUrl, caption: capIG });
    for (let i = 0; i < 20; i++) {
      const s = await (await fetch(`${G}/${c.id}?fields=status_code&access_token=${META_TOKEN}`)).json();
      if (s.status_code === 'FINISHED') break;
      if (s.status_code === 'ERROR') throw new Error('IG container ERROR');
      await new Promise((r) => setTimeout(r, 3000));
    }
    post_ids.instagram = (await api(`${IG_USER_ID}/media_publish`, { creation_id: c.id })).id;
    console.log('IG ok', post_ids.instagram);
  }
  setFront(slug, 'status', 'posted');
  setFront(slug, 'posted_at', new Date().toISOString());
  setFront(slug, 'post_ids', JSON.stringify(post_ids));
  console.log('done');
} catch (e) {
  setFront(slug, 'status', 'failed');
  console.error('FAILED:', e.message);
  process.exit(1);
}
