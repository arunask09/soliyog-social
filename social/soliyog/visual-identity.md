# Soliyog — Visual Identity (Social) v2.0

_Last updated: 2026-08-30. Pairs with [brand-guidelines.md](brand-guidelines.md)._
Direction: **match soliyog.com** — dark `#151527` ground, indigo→teal gradient, amber accent,
the real chart-arrow logo. Primary format is the **hiring-drive poster** (dense, energetic);
the minimalist cards are secondary.

## Quick reference

- **Ground:** `#151527` (site value, confirmed from the OG image + rendered header).
  Note: `soliyog.com/icon.svg` (the favicon) is a **stale, older mark** — do not treat it
  as the logo source. The live site **header** logo is authoritative (see §3).
- **Gradient:** indigo `#6366F1` → teal `#2DD4BF`
- **Amber `#FBBF24`:** a **core brand colour** — it's in the logo. Used for the logo bracket,
  drive accents, CTAs, the hero highlight block. (Earlier "openings only" rule is retired.)
- **Poster headline:** Anton (condensed). **Structure/body:** Space Grotesk + Inter.
- Top edge always carries the 5px gradient hairline; soft indigo glow top-left.

---

## 1. Colour

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#151527` | Base ground, every graphic |
| `--ink-2` | `#1a1a36` | Glow-lit corner |
| `--panel` | `#1c1c33` | Dark cards ("why this drive", contact bar) |
| `--panel-line` | `#2c2c47` | Dark borders, dividers |
| `--card` | `#ffffff` | White info cards (DATE/TIME/VENUE panel, hero) — matches the reference |
| `--indigo` | `#6366F1` | Primary accent, badges, links |
| `--indigo-deep` | `#4F46E5` | Gradient start |
| `--teal` | `#2DD4BF` | Highlight, arrows, secondary badge |
| `--teal-deep` | `#0F766E` | Deep badge fill |
| `--amber` | `#FBBF24` | Logo bracket · hero highlight block · CTA arrow · contact-bar accent · "OPEN THIS WEEK" |
| `--text` | `#F8FAFC` | Headlines, body on dark |
| `--text-muted` | `#9CA3C4` | Site lavender-grey — sub-copy, captions |
| `--text-dim` | `#6B7192` | Least-important metadata |

**Signature gradient:** `linear-gradient(120deg, #4F46E5, #2DD4BF)` (fills), `90deg` variant
for the top hairline. In the logo, badges, chips, ribbons. Never a text fill.

**Contrast:** `#F8FAFC` on `#151527` ≈ 17:1. `#9CA3C4` on `#151527` ≈ 6.5:1. Amber on
`#151527` ≈ 12:1. Dark text `#151527` on white card ≈ 17:1. All clear AA/AAA.

---

## 2. Typography

| Role | Font | Weight | Size @1080px |
|---|---|---|---|
| Poster hero (role name) | **Anton** | 400 (only weight) | 100–130px, `line-height` ~0.9, uppercase |
| Section headline / card title | Space Grotesk | 700 | 29–68px, `-0.02em` |
| Info-chip value | Space Grotesk | 500 | 25–27px |
| Body / bullets | Inter | 400–500 | 22–32px |
| Label / chip / kicker | Inter | 700 | 17–22px, uppercase, `0.12–0.16em` |

- Anton is the free stand-in for the poster's chunky energy; the site's own display face is
  Nacelle (licensed). Swap `--font-poster` / `--font-display` in `_tokens.css` if Nacelle is
  licensed for marketing.
- Headlines left-aligned, `text-wrap: balance`. One accented phrase max (teal, or the amber
  highlight block on the poster).

---

## 3. Logo

**One authoritative mark: the live soliyog.com header logo** (SVG paths verified against the
rendered site on 2026-08-30). The figure (gradient head dot + rising zigzag body) + teal
arrowhead, seated on an **amber L-bracket** (the two chart axes). `soliyog.com/icon.svg` is an
older, simpler mark (no head, no bracket, flat baseline) that the site never updated — **ignore
it.**

### Header mark — `assets/mark-header.svg`
The mark, no container. Use **on dark canvases** — every post footer, the poster header, the
profile avatar. `assets/logo-lockup.svg` adds the "Soliyog" wordmark (Space Grotesk Medium,
`-0.03em`, `#F8FAFC`).

### Filled tile — `assets/mark-tile.svg` (was `mark.svg`)
The same mark inset on a `#151527` rounded square (`rx 7`). Use only where a self-contained
icon tile is needed against a non-brand background (e.g. an app-store listing, a light page).
On a `#151527` canvas it is visually identical to the bare header mark — prefer the header mark.

### Avatars / profile pictures
Instagram / Facebook / LinkedIn / X all circle-crop. Use the **bare header mark, centred on
`#151527`**, ~⅔ of the frame — `templates/profile-avatar-1080x1080.html` (→
`assets/profile/ig-profile-picture.{png,jpg}`). Do **not** use a square tile; the platforms add
their own circle.

### Facebook cover — `templates/fb-cover-1640x624.html`
Centred lockup + rule + one-line positioning + `soliyog.com`, all inside the ~1120px zone that
survives both the mobile and desktop crops. → `assets/profile/fb-cover.{png,jpg}`.

**Meaning:** a fresher on an upward trajectory — the body *is* the growth line.

**Rules:** never recolour the gradient · never rotate · clear space = height of the arrowhead ·
minimum 24px · don't box the mark in a square except via `mark-tile.svg` as above.

---

## 4. Layout system

Every graphic: `--ink` ground, `.topbar` (5px gradient hairline, full-bleed top),
`.glow` (indigo radial, top-left). Shared components in `templates/_tokens.css`:

| Class | What |
|---|---|
| `.sticker` | White rounded card, hard offset shadow (`--card-shadow`) — the reference's panel look. `--dark` and `--accent` (amber border) variants. |
| `.kicker-badge` | Amber-outline pill — "HIRING DRIVE", "WALK-IN" |
| `.ribbon` | Angled gradient banner strip |
| `.stars` | `★ … ★` section divider |
| `.badge` | Circular icon chip (indigo / teal / amber), line-icon inside |
| `.infochip` | Amber uppercase label over a value |
| `.bullets` | Gradient-square bullet list |
| `.contactbar` | Dark bar, amber left accent — closes every poster |
| `.chip`, `.headline`, `.body`, `.footer`, `.topleft` | Minimalist-card parts |

---

## 5. Hiring-drive poster (primary format)

`templates/drive-poster-1080x1350.html` (+ `-1080x1080` crop). Zones, top → bottom:

0. **Skyline** — `assets/skyline-cf.jpg`, a dark office-tower image in the top-right corner
   behind the header (the reference posters' "company building"). **Generated** with
   Cloudflare Workers AI FLUX.2 (`automation/gen-image.mjs`) — fully owned, no stock licence,
   free on the Workers Free plan. Tinted in CSS (`grayscale .15 / brightness .7`, `opacity
   .78`, light-theme `.poster.light` variant brightens + fades to `#f4f5fb`), plus a
   `::after` veil fading it to the ground on the left and bottom with an indigo→teal wash.
   The white/navy cards overlap its lower-left. Fallbacks: `assets/skyline-photo.jpg`
   (Unsplash `G5VXBoEB1AY`), `assets/skyline.svg` (geometric).
1. **Header** — `logo-lockup` left · `.kicker-badge` "HIRING DRIVE" right (solid dark fill)
2. **Hero** (no card) — flex row: role name in Anton on the bare ground (white on dark /
   ink on light), stacked, second word in the amber highlight block · **on the right**, a
   132px white **logo tile** + company name (Space Grotesk) + `<City> · Hiring now`.
   The employer's **own logo, unmodified**, identifies who's hiring — like any job board.
   Fetched via `automation/fetch-logo.mjs` (Brandfetch + browser headers, domain from
   `companies.json`); missing logo → the block degrades to text. Never resize past tile
   scale, recolour, or place on merch. The poster centres its content block
   (`justify-content: center`).
3. **`.ribbon`** — eligibility in one honest line ("Final-year & 0–2 yrs · IT and finance")
4. **`.stars` "What this role tests"** + `.bullets` — 3–4 concrete items
5. **`.sticker` (white) job-facts panel** — five `.jobrow`s, `[badge] LABEL   value`:
   Work mode / Location / Job ID / Eligible / Apply by (scannable, like a job-board card)
6. **`.sticker--dark` "Why this one's worth the application"** — 2×2 `.badge` + label grid
7. **`.contactbar`** — specific listing URL + `@soliyog`
8. **`.disclaimer` (last, hairline top)** — "Sourced from a public job posting. Soliyog is
   not affiliated with, or endorsed by, the hiring company; the logo is its owner's property.
   Verify the role on the company's own careers page before applying."

**Energy yes, hype no.** The layout is loud (stickers, badges, stars, amber block) — the
*words* stay honest: the headline is the role, not "BUILD YOUR FUTURE"; no exclamation
stacks; no salary or outcome claims. That restraint is the difference from the reference
posters the audience already sees.

Feeder pillars: 4 (live openings) and 1 (role decoded) from `brand-guidelines.md`.

---

### Themes — dark + light

Every graphic runs in both. Add `light` to the `.canvas`/`.card-canvas` class list and the
`_tokens.css` `.light` block remaps the token roles: ground → `#f4f5fb`, the "card" surface →
navy `#171730` (so hero + DATE/VENUE panel pop), the "panel" surface → white, body text → dark.
Brand accents (indigo/teal/amber), the top hairline, and the glow are consistent across both.
The drive poster ships `drive-poster-1080x1350.html` (dark) and `-light` (generated by `sed`
from the dark one until the automation's theme field replaces it). **Cadence: alternate by
day — dark one day, light the next.**

## 6. Secondary / minimalist cards

`insight-card-*`, `carousel-cover/point/cta`, `openings-card`, `role-decoded` — retuned to the
`#151527` palette with the top hairline, glow, and footer mark. Same use as before:
single insights, teardown carousels, weekly openings round-up. Layout unchanged.

> **Known drift:** these 9 templates (+ both `drive-poster` files) still carry the *earlier
> reconstructed* footer mark geometry (`M5 28 H24 V12` bracket, flat-indigo head). The
> verified live mark now lives in `assets/mark-header.svg` / `logo-lockup.svg` / the profile
> templates. Sync the inline footer `<svg>` in all 11 to the verified paths on the next pass.

---

## 7. Production

```bash
cd social/soliyog/templates
./render.sh                              # all → exports/*.png @2x
./render.sh drive-poster-1080x1350.html  # one
```

`render.sh` reads the pixel size from the filename and screenshots via headless Chrome at 2×.
Edit the `<!-- EDIT -->` / `data-slot` spots, re-render.

**Profile assets** (one-off, not in the daily pipeline):
```bash
./render.sh profile-avatar-1080x1080.html fb-cover-1640x624.html
# Meta rejects SVG; upload JPG. Flatten each PNG → JPG and copy to assets/profile/:
sips -s format jpeg -s formatOptions 92 exports/profile-avatar-1080x1080.png \
     --out ../assets/profile/ig-profile-picture.jpg
sips -s format jpeg -s formatOptions 92 exports/fb-cover-1640x624.png \
     --out ../assets/profile/fb-cover.jpg
```
`assets/profile/` holds the upload-ready files (`ig-profile-picture`, `fb-cover`), PNG + JPG.

---

## 8. Open items

- **Sync the footer mark** in the 9 secondary cards + 2 drive posters to the verified live
  paths (see §6 "Known drift").
- App-icon mark on a light background (white knockout) — when a light context appears
- Real handle names once accounts are secured (templates say `@soliyog`)
- Confirm real guide + listing URL patterns for CTAs
- `drive-poster-1080x1080.html` crop
- Optional: license Nacelle for exact headline match
