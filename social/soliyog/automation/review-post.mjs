#!/usr/bin/env node
/*
 * Apply one comment command from a `pending-review` issue to its queue item.
 *
 *   node review-post.mjs --slug <slug> --command "<comment body>"
 *   node review-post.mjs --slug <slug> --command "..." --dry-run   # parse only
 *
 * Commands (first non-empty line decides, except `read:` which may be anywhere):
 *   skip | hold        -> status: held, commit, push   (workflow then closes the issue)
 *   read: <text>       -> rewrite soliyog_read, rebuild captions + poster, commit, push
 *   approve | ok | yes -> no-op (opt-out model: already queued)
 *   anything else      -> reply with the command legend
 *
 * Appends action / close / reply (multiline) to $GITHUB_OUTPUT and also writes the
 * reply to $REPLY_FILE (default ./_reply.md) for `gh issue comment --body-file`.
 */
import { writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { HERE, readItem, setFront, setBlock } from './lib.mjs';

const arg = (n) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : null; };
const slug = arg('slug');
const command = (arg('command') || '').trim();
const dry = process.argv.includes('--dry-run');
if (!slug) { console.error('need --slug'); process.exit(1); }

const root = resolve(HERE, '../../..');
const replyFile = process.env.REPLY_FILE || resolve(root, '_reply.md');
const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'inherit' });
const gitOut = (...a) => execFileSync('git', a, { cwd: root }).toString().trim();
const push = () => {
  try { git('push'); }
  catch { git('pull', '--rebase', '--autostash', 'origin', 'main'); git('push'); }
};

const LEGEND = [
  'Not sure what that means. Commands:',
  '- `skip` → hold this post',
  '- `read: <one or two sentences>` → rewrite the “Soliyog’s read” line and rebuild',
  '- do nothing → it posts at 09:00 IST',
].join('\n');

function emit(action, reply, close) {
  if (dry) { console.log(`[dry-run] action=${action} close=${close}\n${reply}`); process.exit(0); }
  writeFileSync(replyFile, reply);
  if (process.env.GITHUB_OUTPUT) {
    const d = 'EOF_' + Math.random().toString(36).slice(2);
    appendFileSync(process.env.GITHUB_OUTPUT,
      `action=${action}\nclose=${close}\nreply<<${d}\n${reply}\n${d}\n`);
  }
  console.log(`[${action}] close=${close}\n${reply}`);
  process.exit(0);
}

const { front } = readItem(slug);
const mdRel = `social/soliyog/queue/${slug}.md`;
const firstLine = command.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
const readMatch = command.match(/read:\s*([\s\S]+)/i);

if (/^(skip|hold)\b/i.test(firstLine)) {
  if (dry) emit('held', 'would set status: held and close the issue', true);
  setFront(slug, 'status', 'held');
  git('add', mdRel);
  git('commit', '-m', `review: ${slug} -> held`, '--', mdRel);
  push();
  emit('held', 'Held — this will not post. Fix it on a laptop and set `status: ready` again.', true);
}

if (readMatch) {
  const text = readMatch[1].trim().replace(/\s+/g, ' ');
  if (dry) emit('read-updated', `would set soliyog_read to: "${text}", rebuild, commit`, false);
  setBlock(slug, 'soliyog_read', text);
  execFileSync('node', [resolve(HERE, 'build-caption.mjs'), slug, '--write'], { stdio: 'inherit' });
  execFileSync('node', [resolve(HERE, 'build-image.mjs'), slug], { stdio: 'inherit' });
  const b = `${front.date}-${slug}`;
  const pngRel = `social/soliyog/queue/assets/${b}.png`;
  const jpgRel = `social/soliyog/queue/assets/${b}.jpg`;
  git('add', mdRel, pngRel, jpgRel);
  git('commit', '-m', `review: ${slug} read updated`, '--', mdRel, pngRel, jpgRel);
  push();
  const sha = gitOut('rev-parse', 'HEAD');
  const repo = process.env.GITHUB_REPOSITORY || process.env.GH_REPO || 'OWNER/REPO';
  emit('read-updated',
    `Updated. Rebuilt poster:\n\n![poster](https://raw.githubusercontent.com/${repo}/${sha}/${pngRel})\n\nStill posts at 09:00 IST unless you reply \`skip\`.`,
    false);
}

if (/^(approve|ok|yes|👍|:\+1:)\b/i.test(firstLine)) {
  emit('noop', 'Already queued — posts at 09:00 IST.', false);
}

emit('unknown', LEGEND, false);
