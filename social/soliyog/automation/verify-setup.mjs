#!/usr/bin/env node
/*
 * Read-only credential pre-flight for the poster pipeline. Posts nothing.
 *
 *   node verify-setup.mjs
 *
 * Reads automation/.env (META_TOKEN, FB_PAGE_ID, IG_USER_ID, GH_REPO) and checks:
 * token type / expiry / scopes, the Page resolves, an IG account is linked to the Page,
 * IG_USER_ID matches it, the 24h IG publish quota, and GH_REPO is set + public.
 * Also checks BUFFER_TOKEN / BUFFER_LINKEDIN_CHANNEL_ID if set (LinkedIn posts via Buffer).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const envp = resolve(HERE, '.env');
if (existsSync(envp)) for (const l of readFileSync(envp, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { META_TOKEN, FB_PAGE_ID, IG_USER_ID, GH_REPO } = process.env;
if (!META_TOKEN) { console.error('no META_TOKEN in env or automation/.env'); process.exit(1); }

const G = 'https://graph.facebook.com/v21.0';
const get = async (p) =>
  (await fetch(`${G}/${p}${p.includes('?') ? '&' : '?'}access_token=${META_TOKEN}`)).json();

let ok = true;
const bad = (m) => { ok = false; console.log('  ✗', m); };

const dbg = (await get(`debug_token?input_token=${META_TOKEN}`)).data || {};
console.log('token type    :', dbg.type || '(unknown)');
console.log('token expires :', dbg.expires_at ? new Date(dbg.expires_at * 1e3).toISOString() : 'never');
console.log('token scopes  :', (dbg.scopes || []).join(', ') || '(none)');
const need = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts',
  'instagram_basic', 'instagram_content_publish', 'business_management'];
const missing = need.filter((s) => !(dbg.scopes || []).includes(s));
if (missing.length) bad(`missing scopes: ${missing.join(', ')}`);
if (!(dbg.scopes || []).includes('pages_manage_engagement'))
  console.log('  !', 'no pages_manage_engagement — FB posts publish fine, first-comment job link is skipped');

if (!FB_PAGE_ID) bad('FB_PAGE_ID not set');
else {
  const page = await get(`${FB_PAGE_ID}?fields=name,username,instagram_business_account{username,id}`);
  if (page.error) bad(`FB_PAGE_ID: ${page.error.message}`);
  else {
    console.log('\nFB page       :', page.name, `(@${page.username || '—'}, ${FB_PAGE_ID})`);
    const ig = page.instagram_business_account;
    if (!ig) bad('no Instagram account linked to the Page — publishing will fail (redo the IG link)');
    else {
      console.log('linked IG     :', `@${ig.username} (${ig.id})`);
      if (IG_USER_ID && IG_USER_ID !== ig.id) bad(`IG_USER_ID (${IG_USER_ID}) != Page-linked IG id (${ig.id})`);
      const lim = (await get(`${ig.id}/content_publishing_limit?fields=quota_usage,config`)).data?.[0];
      if (lim) console.log('IG 24h usage  :', lim.quota_usage, '/', lim.config?.quota_total ?? 25);
    }
  }
}

console.log('\nGH_REPO       :', GH_REPO || '(unset — image URLs will be broken)');
if (!GH_REPO) bad('GH_REPO not set');
else {
  const r = await fetch(`https://api.github.com/repos/${GH_REPO}`);
  if (!r.ok) bad(`GH_REPO ${GH_REPO}: GitHub says ${r.status}`);
  else if ((await r.json()).private) bad(`${GH_REPO} is private — jsDelivr/raw can't serve it, IG posts will fail`);
}

const { BUFFER_TOKEN, BUFFER_LINKEDIN_CHANNEL_ID } = process.env;
console.log('\nBUFFER_TOKEN  :', BUFFER_TOKEN ? '(set)' : '(unset — LinkedIn posts will fail if opted in)');
if (BUFFER_TOKEN) {
  const bufq = async (query, variables) => {
    const r = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${BUFFER_TOKEN}` },
      body: JSON.stringify({ query, variables }),
    });
    return r.json();
  };
  const orgRes = await bufq('query { account { organizations { id name } } }');
  if (orgRes.errors?.length) bad(`BUFFER_TOKEN: ${orgRes.errors[0].message}`);
  else if (!BUFFER_LINKEDIN_CHANNEL_ID) bad('BUFFER_LINKEDIN_CHANNEL_ID not set');
  else {
    const orgs = orgRes.data?.account?.organizations || [];
    const channels = [];
    for (const o of orgs) {
      const cr = await bufq(
        'query($input: ChannelsInput!) { channels(input: $input) { id service name displayName } }',
        { input: { organizationId: o.id } },
      );
      channels.push(...(cr.data?.channels || []));
    }
    const ch = channels.find((c) => c.id === BUFFER_LINKEDIN_CHANNEL_ID);
    if (!ch) bad(`BUFFER_LINKEDIN_CHANNEL_ID (${BUFFER_LINKEDIN_CHANNEL_ID}) not found among this token's channels`);
    else if (ch.service !== 'linkedin') bad(`BUFFER_LINKEDIN_CHANNEL_ID (${BUFFER_LINKEDIN_CHANNEL_ID}) is a ${ch.service} channel, not linkedin`);
    else console.log('linkedin channel:', ch.displayName || ch.name, `(${BUFFER_LINKEDIN_CHANNEL_ID})`, '✓');
  }
}

console.log(ok ? '\n✓ ready to post' : '\n✗ fix the above before posting');
process.exit(ok ? 0 : 1);
