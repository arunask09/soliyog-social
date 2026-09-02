# Soliyog daily-poster: hands-off pipeline

_2026-09-02_

## Goal

The Soliyog daily FB+IG job poster runs with **zero per-post manual work**. The
only human touch-point is an optional veto: the review issue stays, opt-out
(silence = publish). Everything else — commentary, promotion, triggering — is
automatic.

## Problems today

1. **Commentary is hand-written.** After `next-post.mjs` scaffolds a `draft`, a
   human must write `role_tests` + `soliyog_read` from the listing and flip
   `status: draft -> ready`. Nothing consumes the `needs-commentary` issue; the
   user commented "ready" on it three times to no effect. The Sep 3 post is
   currently stuck in `draft`.
2. **The scheduler barely fires.** `precision-trigger.yml` is `*/5` but GitHub
   ran it ~5x/day over the sample window (gaps of 2–4.5h). No run landed in the
   03:25–03:40 UTC daily-post window on its own. Every real post so far went out
   because the user manually dispatched `daily-post`.
3. **Double-scaffold.** `daily-post`'s "scaffold next draft" step runs on
   `if: success()`, not "did we post something". A late/duplicate no-op run still
   scrapes and scaffolds another draft + opens another `needs-commentary` issue —
   the cause of the premature Sep 4 / Sep 5 drafts and issues #4/#5.
4. Minor: `actions/setup-node` pinned to Node 20 (runners default to 24 now,
   deprecation warnings); prep-post can open a duplicate `pending-review` issue
   for the same slug (issues #1/#2).

## Design

### A. Auto-commentary — `automation/write-commentary.mjs` (new)

```
node write-commentary.mjs --slug <slug>       # generate, write blocks, flip to ready
node write-commentary.mjs --slug <slug> --dry-run
```

- Acts only when `status === 'draft'` **and** both `role_tests` and
  `soliyog_read` are unfilled. "Unfilled" = every non-blank line starts with `#`
  (same convention `build-image.mjs` / `build-caption.mjs` already use).
  Idempotent and safe to re-run.
- Fetches the listing via `fetchJob(front.source_url)` (existing `lib-job.mjs`) —
  gives title, company, location, employmentType, experience, industry, salary,
  education, `descriptionText` (≤1400 chars).
- Calls **Gemini 2.5 Flash** (`generativelanguage.googleapis.com/v1beta/models/
  gemini-2.5-flash:generateContent`, `x-goog-api-key: $GEMINI_API_KEY`). Prompt =
  the listing facts + a trimmed statement of Soliyog voice rules (realism not
  hype; `role_tests` = 3–4 bullets on interview mode + stated requirements + the
  actual work, from THIS listing only, no role-family stereotypes; `soliyog_read`
  = 1–2 calm sentences, name the hard parts, flag it plainly when the role is not
  actually a fresher role). Ask for strict JSON: `{ "role_tests": [".."],
  "soliyog_read": ".." }`.
- Validation before writing: JSON parses; 2–5 bullets, each ≤ ~120 chars;
  `soliyog_read` 1–3 sentences, ≤ ~320 chars; no banned tokens (em-dash as tic,
  "dream job", rocket emoji, "₹__ LPA guaranteed", "secret", "unlock"). On any
  failure → **log, touch nothing, exit 0.**
- On success: `setBlock(slug, 'role_tests', ...)`, `setBlock(slug,
  'soliyog_read', ...)`, `setFront(slug, 'status', 'ready')`, commit
  `prep: <slug> -> ready (auto-commentary)`, push (pull --rebase --autostash on
  reject, like the sibling scripts).
- Pure helpers exported and unit-tested: `isUnfilled(block)`,
  `buildPrompt(job)`, `parseAndValidate(text)` (the last one covers the JSON
  extraction + all the guards). No network in tests.

### B. Wiring

**`daily-post.yml`** — after the existing "scaffold the next draft" step, when
`steps.next.outputs.created == '1'`:

```yaml
- name: write commentary for the new draft
  id: commentary
  if: steps.next.outputs.created == '1'
  working-directory: social/soliyog/automation
  env:
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
  run: node write-commentary.mjs --slug "${{ steps.next.outputs.slug }}"
```

The "open a needs-commentary issue" step then runs only when the draft is still
`draft` after that (commentary failed) — re-read status in a tiny guard, or gate
on a `still_draft=1` output from `write-commentary.mjs`.

**`prep-post.mjs`** — selection widens to "oldest item with `date <= tomorrow`
whose status is `ready` **or** `draft`". If the pick is `draft`, run
`write-commentary.mjs --slug <pick>` inline, re-read; if now `ready` proceed as
normal, else log "still draft, needs a human" and exit 0 (prep opens nothing).
This is the safety net for a draft whose daily-post commentary attempt failed.

**Scaffold guard (fix #3)** — the "scaffold the next draft" step gets the same
`posted=...; [ -n "$posted" ] || exit 0` guard the "close the review issue" step
already has, so no-op runs don't scaffold.

**Dup-issue guard (fix #4)** — `prep-post.yml`'s "open review issue" step first
checks `gh issue list --label pending-review --search "<slug>" --state open` and
skips creation if one exists.

**Node bump (fix #4)** — `actions/setup-node` `node-version: 22` in all four
workflows.

### C. Trigger — cron-job.org (replaces reliance on GitHub cron)

Two cron-job.org jobs (UTC):

| When (UTC) | Method | URL | Body |
|---|---|---|---|
| `30 3 * * *` | POST | `https://api.github.com/repos/arunask09/soliyog-social/actions/workflows/daily-post.yml/dispatches` | `{"ref":"main"}` |
| `30 7 * * *` | POST | `.../workflows/prep-post.yml/dispatches` | `{"ref":"main"}` |

Headers: `Authorization: Bearer <PAT>`, `Accept: application/vnd.github+json`,
`X-GitHub-Api-Version: 2022-11-28`. PAT = fine-grained, this repo only, **Actions:
Read and write** (the existing `DISPATCH_PAT` value works if still on hand).

`precision-trigger.yml` stays as a best-effort backup; both targets are
status-gated no-ops when nothing is due, so a double trigger is harmless.

Publish time unchanged: 09:00 IST / 03:30 UTC / 04:30 BST. Review issue opens
~13:00 IST / 08:30 BST the day before — a ~20h veto window.

### D. One-time manual setup (user)

1. `gh secret set GEMINI_API_KEY -R arunask09/soliyog-social` (value from
   `~/.claude/settings.json`).
2. Create the two cron-job.org jobs above with the PAT.

Everything else is automatic from then on.

### E. Backlog cleanup (this session, once the script exists)

- `write-commentary.mjs` on `2026-09-03-article-trainee`, then the Sep 4 and
  Sep 5 drafts → they go `ready`.
- Close issues #3, #4, #5 with a note.
- Dispatch `prep-post` (`--slug 2026-09-03-article-trainee`) → `approved` +
  review issue. Sep 3 post rescued.

## Out of scope

- Changing the poster / caption rendering.
- Changing approval semantics (still opt-out via GitHub issue).
- LinkedIn / X automation (this is the FB+IG pipeline only).

## Testing

- `node --test` in `automation/` — new `write-commentary.test.mjs` covers
  `isUnfilled`, `buildPrompt` (contains the listing facts, contains the voice
  rules), `parseAndValidate` (happy path, fenced-JSON path, too-many-bullets,
  overlong sentence, banned token, non-JSON → all reject cleanly).
- Manual: `write-commentary.mjs --slug <real> --dry-run` against a live listing,
  eyeball the output against the Sep 1 / Sep 2 examples.
- The rescued Sep 3 review issue is the end-to-end check.
