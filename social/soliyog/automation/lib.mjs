/* tiny frontmatter + queue helpers (no yaml dep) */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const QUEUE = resolve(HERE, '../queue');
export const qpath = (slug) => resolve(QUEUE, `${slug}.md`);

// parse the top --- ... --- block. Supports "k: v", "k: [a, b]", and "k: |" indented blocks.
export function parseFront(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const o = {};
  const lines = m[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const kv = ln.match(/^([A-Za-z0-9_]+):\s?(.*)$/);
    if (!kv) continue;
    const [, k, raw] = kv;
    if (raw === '|' || raw === '') {
      const buf = [];
      while (i + 1 < lines.length && /^(\s{2,}|\s*$)/.test(lines[i + 1]) && !/^[A-Za-z0-9_]+:/.test(lines[i + 1])) {
        buf.push(lines[++i].replace(/^ {2}/, ''));
      }
      if (buf.length) { o[k] = buf.join('\n').trim(); continue; }
      if (raw === '') { o[k] = ''; continue; }
    }
    let v = raw.trim();
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    o[k] = v;
  }
  return o;
}

export function readItem(slug) {
  const p = qpath(slug);
  if (!existsSync(p)) throw new Error(`no queue/${slug}.md`);
  const md = readFileSync(p, 'utf8');
  return { md, front: parseFront(md), path: p };
}

// set a single scalar front key in place (creates it if missing)
export function setFront(slug, key, val) {
  let { md } = readItem(slug);
  const line = `${key}: ${val}`;
  md = new RegExp(`^${key}:.*$`, 'm').test(md)
    ? md.replace(new RegExp(`^${key}:.*$`, 'm'), line)
    : md.replace(/^---\n/, `---\n${line}\n`);
  writeFileSync(qpath(slug), md);
}

// replace (or insert) a "key: |" indented block scalar in the front-matter.
// Same splice shape as build-caption.mjs: from ^key: up to the next ^word: or ^---.
export function setBlock(slug, key, text) {
  let { md } = readItem(slug);
  const indented = String(text).trim().split('\n').map((l) => '  ' + l).join('\n');
  const block = `${key}: |\n${indented}\n`;
  const re = new RegExp(`^${key}:.*?(?=^\\w+:|^---)`, 'ms');
  md = re.test(md) ? md.replace(re, block) : md.replace(/^(---\n)/, `$1${block}`);
  writeFileSync(qpath(slug), md);
}

export function listItems() {
  if (!existsSync(QUEUE)) return [];
  return readdirSync(QUEUE).filter((f) => f.endsWith('.md')).map((f) => {
    const slug = f.replace(/\.md$/, '');
    return { slug, ...parseFront(readFileSync(resolve(QUEUE, f), 'utf8')) };
  });
}
