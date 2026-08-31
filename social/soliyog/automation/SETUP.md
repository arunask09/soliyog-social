# Soliyog daily FB + Instagram poster — setup

One-time steps you (the human) do. After this, the pipeline runs itself.

## 1. Meta accounts

1. **Facebook Page** — create one for Soliyog (category *Education Website*) inside your
   Business Portfolio `<YOUR_BUSINESS_PORTFOLIO_ID>` (business.facebook.com).
2. **Instagram** — create an account, Settings → *Account type* → **Professional → Business**.
3. **Link them** — Business Suite → Settings → *Linked accounts* → connect the IG account to
   the Page. Confirm both are owned by the Business Portfolio.

## 2. Developer app + token

4. developers.facebook.com → **Create app → Business** → attach the Business Portfolio.
   Add products **Instagram Graph API** + **Facebook Login for Business**. Leave it in
   **Development mode** (posting only to your own assets — no App Review needed).
5. Business settings → **System users → Add** (`soliyog-poster`, Admin). Assign the Page +
   IG account + app to it. **Generate token** → scopes:
   `pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic,
   instagram_content_publish, business_management`. This token does not expire.
6. Get the IDs:
   ```
   curl "https://graph.facebook.com/v21.0/me/accounts?access_token=<TOKEN>"                       # -> Page id
   curl "https://graph.facebook.com/v21.0/<PAGE_ID>?fields=instagram_business_account&access_token=<TOKEN>"   # -> IG id
   ```

## 3. Repo (Instagram needs a public image URL)

7. `git init` this project, push to a **public** GitHub repo, e.g. `soliyog-social`.
   jsDelivr serves the rendered PNGs from it; only GitHub **Secrets** hold credentials.

## 4. Credentials

`social/soliyog/automation/.env` (git-ignored — I can't create it):
```
META_TOKEN=<system-user token>
FB_PAGE_ID=<from step 6>
IG_USER_ID=<from step 6>
GH_REPO=<your-user>/soliyog-social
BRANDFETCH_CLIENT_ID=<YOUR_BRANDFETCH_CLIENT_ID>
CF_ACCOUNT_ID=<YOUR_CF_ACCOUNT_ID>
CF_API_TOKEN=<rotated Workers AI token>
```
And add `META_TOKEN`, `FB_PAGE_ID`, `IG_USER_ID`, `GH_REPO` as **GitHub Actions Secrets**.

## 5. GitHub Actions

`.github/workflows/daily-post.yml` (already in the repo) runs `post.mjs` on a cron
(09:00 IST) + manual dispatch. It only posts queue items with `status: approved`.

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

- Preview first: `node social/soliyog/automation/build-image.mjs <slug>` → `queue/assets/<slug>.png`
- Force one now: `node social/soliyog/automation/post.mjs --slug <slug>`
- Add an employer domain when a logo is missing: edit `automation/companies.json`, then
  `node automation/fetch-logo.mjs "<Company>"`
