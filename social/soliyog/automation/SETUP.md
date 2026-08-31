# Soliyog daily FB + Instagram poster — setup

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
   `pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic,
   instagram_content_publish, business_management`.
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

## 4. Credentials

`social/soliyog/automation/.env` (git-ignored — the assistant can't create it):
```
META_TOKEN=<never-expiring system-user token — regenerate, don't reuse a pasted one>
FB_PAGE_ID=1289252704274108
IG_USER_ID=17841433325332630
GH_REPO=<your-user>/soliyog-social
BRANDFETCH_CLIENT_ID=       # optional, for employer logos
CF_ACCOUNT_ID=             # optional, unused AI-image scripts
CF_API_TOKEN=
```
Add `META_TOKEN`, `FB_PAGE_ID`, `IG_USER_ID`, `GH_REPO` as **GitHub Actions Secrets**.

Then run `npm ci` in `automation/` (installs `sharp`, used to make the IG JPEG) and
`node automation/verify-setup.mjs` to check the token, scopes, Page, IG link, and repo.

## 5. GitHub Actions

`.github/workflows/daily-post.yml` (already in the repo) runs `npm ci` + `post.mjs` on a
cron (09:00 IST) + manual dispatch. It only posts queue items with `status: approved` and
`date <= today`, then commits `status: posted` back.

---

## Daily use

```
node social/soliyog/automation/new-post.mjs <soliyog.com/jobs/URL-or-id>
```
→ creates `queue/<date>-<slug>.md` (theme alternates dark/light by date) with portal facts.
Then, from the actual listing, fill two front-matter blocks:

- `role_tests:` — 3-4 bullets for "What this role tests" (interview mode, stated
  requirements, what the work is). Read from *this* listing, not a generic role stereotype.
- `soliyog_read:` — 1-2 calm sentences for "Why this one's worth a look".

Leave either blank to omit it from the poster/captions (never invent one). Then
`node build-caption.mjs <slug> --write` to fold `soliyog_read` into the captions, set
`status: approved`. The cron posts the next approved item each day.

- Preview first: `node automation/build-image.mjs <slug>` → `queue/assets/<date>-<slug>.png`
  (Facebook) + `.jpg` (1080×1350, Instagram)
- Dry-run the publish: `node automation/post.mjs --slug <slug> --dry-run`
- Force one now: `node automation/post.mjs --slug <slug>`
- Add an employer domain when a logo is missing: edit `automation/companies.json`, then
  `node automation/fetch-logo.mjs "<Company>"`
