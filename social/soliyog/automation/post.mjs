#!/usr/bin/env node
/*
 * Publish one approved queue item to Facebook + Instagram via the Meta Graph API.
 *
 *   node post.mjs                 # next approved item with date <= today
 *   node post.mjs --slug <slug>   # a specific item
 *   node post.mjs --dry-run       # print payloads, post nothing
 *
 * Env (from automation/.env or real env): META_TOKEN, FB_PAGE_ID, IG_USER_ID, GH_REPO
 * (GH_REPO = "user/repo" of the PUBLIC repo this folder is pushed to — for the image URL).
 *
 * On success it commits the queue file (status: posted) and the rendered images back to
 * the repo and pushes — CI checks out fresh each run, so an uncommitted status would
 * re-post the same item on the next cron. FB gets the 2x PNG, IG gets the 1080x1350 JPEG.
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

const root = resolve(HERE, '../../..');
const mdRel = `social/soliyog/queue/${slug}.md`;
const pngRel = `social/soliyog/queue/assets/${front.date}-${slug}.png`;  // 2160x2700 -> Facebook
const jpgRel = `social/soliyog/queue/assets/${front.date}-${slug}.jpg`;  // 1080x1350 -> Instagram (JPEG only)

// 1. build both images
execFileSync('node', [resolve(HERE, 'build-image.mjs'), slug], { stdio: 'inherit' });

const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'inherit' });
const gitOut = (...a) => execFileSync('git', a, { cwd: root }).toString().trim();
const dirty = (...paths) => gitOut('status', '--porcelain', '--', ...paths) !== '';
const push = () => {
  try { git('push'); }
  catch { git('pull', '--rebase', '--autostash', 'origin', 'main'); git('push'); }
};

// poll each candidate URL until one returns 200 (jsDelivr can lag a fresh commit; raw is the fallback)
async function pickLiveUrl(urls) {
  for (let i = 0; i < 30; i++) {
    for (const u of urls) {
      try { if ((await fetch(u)).ok) return u; } catch { /* keep polling */ }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.warn('image URL never returned 200 — using', urls.at(-1));
  return urls.at(-1);
}

// 2. commit + push both images so jsDelivr / raw can serve them, pin the SHA
let fbUrl, igUrl;
if (dry) {
  const b = front.image_url;
  const cdnMain = (p) => `https://cdn.jsdelivr.net/gh/${GH_REPO || 'USER/REPO'}@main/${p}`;
  fbUrl = b || cdnMain(pngRel);
  igUrl = b || cdnMain(jpgRel);
} else {
  if (dirty(pngRel, jpgRel)) {
    git('add', pngRel, jpgRel);
    git('commit', '-m', `post: ${slug} image`, '--', pngRel, jpgRel);
    push();
  }
  const sha = gitOut('rev-parse', 'HEAD');
  const cdn = (p) => `https://cdn.jsdelivr.net/gh/${GH_REPO}@${sha}/${p}`;
  const raw = (p) => `https://raw.githubusercontent.com/${GH_REPO}/${sha}/${p}`;
  fbUrl = await pickLiveUrl([cdn(pngRel), raw(pngRel)]);
  igUrl = await pickLiveUrl([cdn(jpgRel), raw(jpgRel)]);
  setFront(slug, 'image_url', igUrl);
}

const capFB = front.caption_facebook || front.caption_instagram || '';
const capIG = front.caption_instagram || front.caption_facebook || '';
console.log(`FB image: ${fbUrl}\nIG image: ${igUrl}`);
if (dry) {
  console.log('\n--- FB /photos ---\n', { url: fbUrl, caption: capFB });
  console.log('\n--- IG /media ---\n', { image_url: igUrl, caption: capIG });
  process.exit(0);
}

// write queue-file status AND commit+push it — CI checks out fresh each run, so an
// uncommitted "status: posted" is lost and the item re-posts on the next cron.
const persist = (fields) => {
  for (const [k, v] of Object.entries(fields)) setFront(slug, k, v);
  if (dirty(mdRel)) {
    git('add', mdRel);
    git('commit', '-m', `post: ${slug} -> ${fields.status}`, '--', mdRel);
    push();
  }
};

// Publishing to a Page (and its linked IG account) needs the PAGE access token, not the
// system-user token — the latter gives "(#200) publish_actions ... deprecated" on /photos.
const pageTokenRes = await (await fetch(`${G}/${FB_PAGE_ID}?fields=access_token&access_token=${META_TOKEN}`)).json();
if (pageTokenRes.error || !pageTokenRes.access_token) {
  try { persist({ status: 'failed' }); } catch { /* ignore */ }
  console.error('FAILED: could not get Page access token:', pageTokenRes.error?.message || 'no access_token in response');
  process.exit(1);
}
const PAGE_TOKEN = pageTokenRes.access_token;

const api = async (path, body) => {
  const r = await fetch(`${G}/${path}`, { method: 'POST', body: new URLSearchParams({ ...body, access_token: PAGE_TOKEN }) });
  const j = await r.json();
  if (j.error) throw new Error(`${path}: ${j.error.message}`);
  return j;
};

try {
  const platforms = [].concat(front.platforms || ['instagram', 'facebook']);
  const post_ids = {};
  if (platforms.includes('facebook')) {
    const r = await api(`${FB_PAGE_ID}/photos`, { url: fbUrl, caption: capFB });
    post_ids.facebook = r.post_id || r.id;
    console.log('FB ok', post_ids.facebook);
  }
  if (platforms.includes('instagram')) {
    const c = await api(`${IG_USER_ID}/media`, { image_url: igUrl, caption: capIG });
    for (let i = 0; i < 20; i++) {
      const s = await (await fetch(`${G}/${c.id}?fields=status_code&access_token=${PAGE_TOKEN}`)).json();
      if (s.status_code === 'FINISHED') break;
      if (s.status_code === 'ERROR') throw new Error('IG container ERROR');
      await new Promise((r) => setTimeout(r, 3000));
    }
    post_ids.instagram = (await api(`${IG_USER_ID}/media_publish`, { creation_id: c.id })).id;
    console.log('IG ok', post_ids.instagram);
  }
  persist({ status: 'posted', posted_at: new Date().toISOString(), post_ids: JSON.stringify(post_ids) });
  console.log('done');
} catch (e) {
  // mark failed and commit it so CI doesn't retry the same broken item every cron run.
  // to retry a transient failure, set status back to "approved" by hand.
  try { persist({ status: 'failed' }); } catch (ce) { console.error('could not persist failed status:', ce.message); }
  console.error('FAILED:', e.message);
  process.exit(1);
}
