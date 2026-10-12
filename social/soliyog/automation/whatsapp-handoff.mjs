#!/usr/bin/env node
/*
 * WhatsApp Channel handoff — semi-manual, by design. WhatsApp exposes no official API
 * for posting to Channels (Meta's Cloud API doesn't cover them), and the unofficial
 * WhatsApp-Web automations risk a ban on the number that owns the channel. So instead
 * of posting, the bot DMs the admin on Telegram: the poster image, then the caption
 * reformatted for WhatsApp inside a code block (tap to copy on mobile). The admin
 * saves the image and pastes both into the WhatsApp Channel by hand.
 *
 * post.mjs calls sendHandoff() after a successful post; this CLI resends one by hand:
 *
 *   node whatsapp-handoff.mjs --slug <slug>            # DM the handoff for a posted item
 *   node whatsapp-handoff.mjs --slug <slug> --dry-run  # print the WhatsApp caption only
 *
 * Env: TELEGRAM_BOT_TOKEN (same bot as the channel), TELEGRAM_ADMIN_CHAT_ID — the
 * admin's own chat id with that bot (message the bot once, then read it from
 * getUpdates). Soft-optional: without TELEGRAM_ADMIN_CHAT_ID the handoff is skipped.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERE, readItem } from './lib.mjs';

// Telegram caption -> WhatsApp: bold the title line (WhatsApp uses *bold*), and drop
// trailing hashtag-only lines — hashtags aren't clickable or searchable on WhatsApp.
export function whatsappCaption(cap) {
  const lines = String(cap || '').replace(/\r\n/g, '\n').split('\n');
  const isTagLine = (l) => /^\s*(#[\p{L}\p{N}_]+\s*)+$/u.test(l);
  while (lines.length && (!lines.at(-1).trim() || isTagLine(lines.at(-1)))) lines.pop();
  const i = lines.findIndex((l) => l.trim());
  if (i >= 0 && !lines[i].includes('*')) lines[i] = `*${lines[i].trim()}*`;
  return lines.join('\n');
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function sendHandoff({ token, chatId, imageUrl, caption, slug }) {
  const tg = async (method, body) => {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, ...body }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(`whatsapp handoff ${method}: ${j.description || 'failed'}`);
    return j.result;
  };
  await tg('sendPhoto', {
    photo: imageUrl,
    caption: `📲 For the WhatsApp Channel — ${slug}\nSave this image, then tap the caption below to copy it.`,
  });
  await tg('sendMessage', {
    text: `<pre>${esc(whatsappCaption(caption))}</pre>`,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const envp = resolve(HERE, '.env');
  if (existsSync(envp)) for (const l of readFileSync(envp, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const args = process.argv.slice(2);
  const slug = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : undefined;
  if (!slug) { console.error('usage: node whatsapp-handoff.mjs --slug <slug> [--dry-run]'); process.exit(1); }
  const { front } = readItem(slug);
  const caption = front.caption_telegram || front.caption_linkedin || '';
  if (args.includes('--dry-run')) { console.log(whatsappCaption(caption)); process.exit(0); }
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) { console.error('missing TELEGRAM_BOT_TOKEN / TELEGRAM_ADMIN_CHAT_ID'); process.exit(1); }
  if (!front.image_url) { console.error(`queue/${slug}.md has no image_url — has it been posted?`); process.exit(1); }
  await sendHandoff({ token: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_ADMIN_CHAT_ID, imageUrl: front.image_url, caption, slug });
  console.log('WhatsApp handoff sent');
}
