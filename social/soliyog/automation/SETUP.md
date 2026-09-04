# Soliyog daily FB + Instagram (+ LinkedIn) poster — setup

One-time steps you (the human) do. After this, the pipeline runs itself.

Business Portfolio: **Soliyog** `1087217197161361` · Facebook Page: **Soliyog** `1289252704274108`
· Instagram `soliyog` (already connected to the Page) · Ad account `5141323442652641`.

## 1. Instagram → Business, linked to the Page  ✅ done

The `soliyog` IG account is already connected to the Soliyog Page (Settings → Accounts →
Pages → Soliyog → Connected assets). Just confirm it's a **Business** account (IG app →
Settings → For professionals → Account type and tools — it should offer "Switch to Creator").
Creator accounts can't use `instagram_content_publish`.

## 2. Developer app + token

4. developers.facebook.com → **Create App → Business** → attach Portfolio **Soliyog**
   (`1087217197161361`). Keep it **In development** (posting to your own assets needs no App
   Review). Add products **Instagram** — pick the *"Instagram API with Facebook Login"* path,
   **not** *"Instagram API with Instagram Login"* — and **Facebook Login for Business**.
5. Business settings → **Users → System users → Add** (`soliyog-poster`, Admin). Select it →
   **Assign assets** → add the Soliyog Page, the `soliyog` Instagram account, and the app
   (Full control / Manage). **Generate token** → expiration **Never** → scopes:
   `pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_engagement,
   instagram_basic, instagram_content_publish, business_management`.
   (`pages_manage_engagement` lets post.mjs add the job link as the first comment on FB
   posts — without it the post still publishes, the comment is just skipped.)
   The system user needs an **app role** (Add assets → Apps → Soliyog-poster → Full control)
   or the token wizard shows "No permissions available". The IG scopes only appear once the
   app has the "Instagram API with Facebook Login" product and the IG account is assigned.
6. `IG_USER_ID` is **`17841433325332630`** (`@soliyog`), resolved via:
   ```
   curl "https://graph.facebook.com/v21.0/1289252704274108?fields=instagram_business_account&access_token=<TOKEN>"
   ```

> Meta may require **Business Verification** of the Portfolio (Security Center → Start
> verification) before issuing the token or allowing `instagram_content_publish`.

## 3. Public repo (Instagram needs a public image URL)

7. Create a **public** GitHub repo, e.g. `soliyog-social`. From the repo root:
   `git remote add origin <url>` then `git push -u origin main` (the `-u` matters — `post.mjs`
   runs bare `git push`). jsDelivr / raw.githubusercontent.com serve the rendered images;
   only GitHub **Secrets** hold credentials. The root `.gitignore` keeps the repo scoped to
   `social/soliyog/**` + `.github/`.
8. Repo → Settings → Actions → General → Workflow permissions → **Read and write**.

## 2b. LinkedIn — via Buffer, not LinkedIn's own API

LinkedIn's Community Management API (needed to post to a Company Page) requires the
posting account to be a **legally registered entity** (LLC, private limited company,
etc.) and a **1-4 week app review** — Soliyog isn't registered, so that path is closed.
Buffer already holds its own approved LinkedIn connection; we ride on that instead.

1. Connect the Soliyog LinkedIn Company Page to Buffer (already done) — its channel ID
   is visible in the Buffer URL when you open that channel's schedule, e.g.
   `publish.buffer.com/channels/<CHANNEL_ID>/schedule`.
2. `publish.buffer.com/settings/api` → **Personal Access** tab → **+ New Key** → all
   permissions → expiration **1 year** (the longest offered — unlike `META_TOKEN` this
   one *does* expire, so put a reminder ~11 months out to regenerate it) → Generate →
   copy as `BUFFER_TOKEN`.

## 4. Credentials

`social/soliyog/automation/.env` (git-ignored — the assistant can't create it):
```
META_TOKEN=<never-expiring system-user token — regenerate, don't reuse a pasted one>
FB_PAGE_ID=1289252704274108
IG_USER_ID=17841433325332630
GH_REPO=<your-user>/soliyog-social
BUFFER_TOKEN=<Buffer Personal Access Key — expires in <=1yr, regenerate before then>
BUFFER_LINKEDIN_CHANNEL_ID=<Soliyog LinkedIn channel id from the Buffer schedule URL>
BRANDFETCH_CLIENT_ID=       # optional, for employer logos
CF_ACCOUNT_ID=             # optional, unused AI-image scripts
CF_API_TOKEN=
```
Add all six (`META_TOKEN`, `FB_PAGE_ID`, `IG_USER_ID`, `GH_REPO`, `BUFFER_TOKEN`,
`BUFFER_LINKEDIN_CHANNEL_ID`) as **GitHub Actions Secrets** — LinkedIn posts by default,
so a missing Buffer secret fails the whole run unless the item opts out (see §5 daily use).

Then run `npm ci` in `automation/` (installs `sharp`, used to make the IG JPEG) and
`node automation/verify-setup.mjs` to check the token, scopes, Page, IG link, repo, and
(if `BUFFER_TOKEN` is set) the Buffer LinkedIn channel.

## 5. GitHub Actions

Four workflows (all in `.github/workflows/`, cron times in UTC = IST − 5:30):

- **`prep-post.yml`** — `30 7 * * *` (13:00 IST) + manual dispatch. Takes the next
  `ready`-or-`draft` item (date ≤ tomorrow). If it's still `draft`, runs
  `write-commentary.mjs` once to fill it (safety net). Then promotes it to `approved`,
  renders the poster + captions, commits, and opens a `pending-review` GitHub Issue for a
  phone review — skipping that if one is already open for the slug.
- **`review-post.yml`** — `issue_comment`. On a `pending-review` issue, **only** a comment
  from the repo owner: `skip` → `status: held` + close; `read: <text>` → rewrite the
  "Soliyog's read" line, rebuild, re-post the poster; else a hint.
- **`daily-post.yml`** — `30 3 * * *` (09:00 IST) + manual dispatch. Posts the oldest
  `status: approved` item with `date <= today`, commits `status: posted`, and closes the
  matching review issue with "Posted ✅". Only if something actually posted this run: runs
  **`next-post.mjs`** (scrapes soliyog.com, scaffolds the next `draft` unless the queue
  already holds 3 un-posted items), then **`write-commentary.mjs`** to fill `role_tests` +
  `soliyog_read` from the listing via Gemini and flip it to `ready`. A `needs-commentary`
  issue is opened **only if** that generation failed.
- **`precision-trigger.yml`** — `*/5` watchdog that dispatches the two above inside their
  windows. GitHub's scheduler is unreliable, so the real trigger is an external cron
  (cron-job.org) hitting the `workflow_dispatch` API at `30 3` and `30 7` UTC; this stays
  as a best-effort backup. Both targets are status-gated, so a double trigger is a no-op.

**Opt-out model:** once `prep-post` promotes an item it *will* post at 09:00 IST unless you
`skip` it. Commentary is auto-written, but you still see the finished poster in the review
issue before it goes.

### Secrets

`META_TOKEN`, `FB_PAGE_ID`, `IG_USER_ID`, `GH_REPO`, `DISPATCH_PAT` (precision-trigger),
**`GEMINI_API_KEY`** (auto-commentary), and `BUFFER_TOKEN` + `BUFFER_LINKEDIN_CHANNEL_ID`
(LinkedIn posts by default — without these, posting fails unless an item opts out):

```
gh secret set GEMINI_API_KEY -R arunask09/soliyog-social   # paste the key from ~/.claude/settings.json
```

### External trigger (cron-job.org, one-time)

Two jobs, both `POST` with headers `Authorization: Bearer <PAT>`,
`Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, body `{"ref":"main"}`:

| Schedule (UTC) | URL |
|---|---|
| `30 3 * * *` | `https://api.github.com/repos/arunask09/soliyog-social/actions/workflows/daily-post.yml/dispatches` |
| `30 7 * * *` | `https://api.github.com/repos/arunask09/soliyog-social/actions/workflows/prep-post.yml/dispatches` |

PAT: fine-grained, this repo only, **Actions: Read and write** (the `DISPATCH_PAT` value works).

---

## Daily use

```
node social/soliyog/automation/new-post.mjs <soliyog.com/jobs/URL-or-id>
```
→ creates `queue/<date>-<slug>.md` (theme alternates dark/light by date) with portal facts.
You don't run this by hand any more — `daily-post` auto-scaffolds the next draft after each
publish, then `write-commentary.mjs` fills its two front-matter blocks from the listing and
flips it to `ready`. Run `new-post.mjs` manually only to jump the queue or feature a
specific listing (then `node write-commentary.mjs --slug <slug>` to fill it, or hand-write):

- `role_tests:` — 3-4 bullets for "What this role tests" (interview mode, stated
  requirements, what the work is). Read from *this* listing, not a generic role stereotype.
- `soliyog_read:` — 1-2 calm sentences for "Why this one's worth a look".

Leave either blank to omit it from the poster/captions (never invent one). `prep-post` then
builds the poster, flips it to `approved`, and opens a review issue — approve/skip/edit from
the GitHub mobile app; do nothing and it posts at 09:00 IST. (Set `status: approved` by hand
only to bypass the review loop.)

- Auto-write commentary for a draft: `node automation/write-commentary.mjs --slug <slug>`
  (`--dry-run` to preview). Needs `GEMINI_API_KEY`.

- Preview first: `node automation/build-image.mjs <slug>` → `queue/assets/<date>-<slug>.png`
  (Facebook) + `.jpg` (1080×1350, Instagram)
- Dry-run the publish: `node automation/post.mjs --slug <slug> --dry-run`
- Force one now: `node automation/post.mjs --slug <slug>`
- Add an employer domain when a logo is missing: edit `automation/companies.json`, then
  `node automation/fetch-logo.mjs "<Company>"`
- LinkedIn posts by default alongside FB/IG (`platforms: [instagram, facebook, linkedin]`
  in every new queue item, via `new-post.mjs`). `caption_linkedin` is already generated
  by `build-caption.mjs` alongside the other two. Needs `BUFFER_TOKEN` +
  `BUFFER_LINKEDIN_CHANNEL_ID` set (see §2b) — opt a specific item out with
  `platforms: [instagram, facebook]`.
