# NOTES

Working notes for Haha-lol-calculator. Everything here is a known, accepted
limitation — not a bug report queue. Anything that could show a wrong number, or
trap or cover the page, was fixed in the branch instead of being written down.

---

## phase 5 — fix at ship

Triaged against the rule: **fix now** if a normal user reaches it inside 30
seconds of ordinary use, **or** if it can ever produce a wrong number, a NaN, or
trap/cover the page. Each item below is **NO to both**, so it waits. Both
answers are recorded per row so the call can be re-checked later.

### 1. The open steps sheet does not contain keyboard focus

- **Page:** `calc.html`, `max-width: 720px` only (the phone bottom sheet).
- **(a) Hit within 30s of ordinary use? NO.** It needs a hardware keyboard on a
  phone-sized viewport. The ordinary path on a phone is touch, and on a desktop
  wider than 720px the drawer is an inline panel, not a modal.
- **(b) Wrong number / NaN / trap or cover? NO.** Nothing is trapped — the
  failure mode is the opposite one, focus *escapes*. Every documented exit works
  (tab, backdrop, Escape) and nothing computes while the panel is open.

With the sheet open the backdrop dims the page and swallows clicks, but Tab still
walks to controls behind it (`.key`, `.switch__btn`, the nav). Pressing Enter on
one of them still works, so no number is wrong — the sheet is simply not `inert`.

**Repro**
1. Open `calc.html`, narrow the window to 390x844.
2. Type `2+3`, press Enter, then click the `∑ Steps` tab.
3. Press Tab a few times: the focus ring leaves the panel and walks the keypad
   and the nav while the sheet stays open.
4. When shipping: set `inert` on the siblings of `.drawer` while
   `data-open="true"` **and** the `max-width: 720px` branch is active. Do not
   apply it above 720px — there the drawer is not a modal.

### 2. Web fonts are a network dependency

- **Page:** all three.
- **(a) Hit within 30s of ordinary use? NO.** Only when offline, which is not
  ordinary use. Google Fonts is the one CDN the brief permits.
- **(b) Wrong number / NaN / trap or cover? NO.** No computation is involved and
  nothing is covered.

With no network the three families fail to load and the site falls back to
generic `serif` / `sans-serif` / `monospace`. Every dimension is in `rem` and
tokens, so nothing overlaps, but the display face is lost and the hero reads
plainer.

**Repro**
1. Load any page, then go offline (DevTools → Network → Offline) and reload.
2. Compare with the online render: `Fraunces`, `Space Grotesk` and
   `JetBrains Mono` are replaced by the generic stack.
3. If a self-hosted subset is ever wanted, drop `woff2` files in
   `assets/fonts/` and add `@font-face` rules ahead of the Google Fonts `<link>`.

### 3. The Render deploy has never been exercised

- **Page:** the whole site. This is a verification gap, not shipped behaviour.
- **(a) Hit within 30s of ordinary use? NO.** No user can reach it — it is a
  missing check on this build host, not something the site does.
- **(b) Wrong number / NaN / trap or cover? NO.**

There are no Render credentials on the build host, so nothing was verified
against the live deploy, only against the same files over `file://`.
`render.yaml` publishes the repository root as static output, `autoDeploy: true`.

**Repro**
1. Push to the branch Render watches and read the deploy log.
2. Confirm the three HTML files serve and `assets/` resolves. All paths are
   relative, so `file://` and a static host behave the same.
3. `render.yaml` is the only config present — start there before touching pages.

---

## Architecture residue

One responsive block is still in `tokens.css` after the `max-width: 860px`
relocation, and it is the same class of leak the relocation set out to remove:

- **`@media (max-width: 520px)` — `tokens.css` line 1119.** It styles
  `.sheet__row`, `.sheet__fox`, `.ladder` and `.keys`, which exist only in
  `about.html`. It was left alone because the relocation was scoped to the
  860px block, and moving it changes no computed value today.

**Repro:** open `calc.html` at 500px wide and query
`getComputedStyle(document.documentElement)` for these rules — they parse, they
simply match nothing.

**When shipping:** move the block into `about.html`'s own `<style>`, exactly as
the landing rules moved into `index.html`'s. Note that `.gallery`'s 420px step
had to move with its 860px sibling rather than stay behind — at 390px both
matched and the later one won, which would have left the gallery two-up.

---

## Not limitations, on purpose

- **`calc.html` does not scroll at 1000px and wider.** The page is 844px tall in
  an 844px viewport. Deliberate, and documented at `assets/css/calc.css`
  (*the calculator carries more keys than the reading pages, so it gets a
  tighter footer and stays inside a laptop viewport*).
- **The steps panel is capped at `max-height: 52vh`.** Measured at 360, 390,
  667, 713 and 844px wide, the open sheet covers 14%–46% of the viewport, so it
  has never needed to scroll internally. If a much longer calculation does
  overflow, the panel already carries `overflow-y: auto`.