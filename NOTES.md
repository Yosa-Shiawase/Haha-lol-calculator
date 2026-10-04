# NOTES

Working notes for Haha-lol-calculator. Everything here is a known, accepted
limitation — not a bug report queue. Anything that could show a wrong number, or
trap or cover the page, was fixed in the branch instead of being written down.

**Phone operation, defined in one line:** a phone is a touch device at 390px or
narrower, held portrait, operated by thumb — no hover, no pointer, no hardware
keyboard assumed.

**The rule that follows from it:** if it can produce a wrong number, or trap or
cover the page, it is fixed now, in the branch. Everything else is written down
here under "phase 5 — fix at ship" with reproduction steps.

---

## phase 5 — fix at ship

### 1. Web fonts are a network dependency — ACCEPTED

- **Ruling:** accepted. Google Fonts is the one CDN the constitution permits.
- **`font-display: swap` is confirmed set on all three pages.** Every Google
  Fonts URL ends in `&display=swap` (`index.html:23`, `calc.html:23`,
  `about.html:23`), so text is never invisibly waiting on the network — it
  renders immediately in the fallback stack and swaps when the face arrives.
  Verified in the browser: `document.fonts.check()` resolves true for Fraunces,
  Space Grotesk and JetBrains Mono once loaded.
- **Why it is a limitation and not a bug:** nothing is computed with a font and
  nothing is covered by one. Every dimension is in `rem` and tokens, so the
  layout is identical either way — only the display face is lost.

**Repro**
1. Load any page, then go offline (DevTools → Network → Offline) and reload.
2. Compare with the online render: the three families are replaced by the
   generic `serif` / `sans-serif` / `monospace` stack. Nothing shifts or
   overlaps; the hero simply reads plainer.
3. **Do not "fix" this by removing the swap.** Blocking on fonts is what would
   make the page invisible, and that would be a worse defect than a plainer
   headline.

### 2. The open steps sheet does not contain keyboard focus

- **Page:** `calc.html`, `max-width: 720px` only (the phone bottom sheet).
- **Against the rule:** cannot produce a wrong number and cannot trap the page,
  so it waits. The failure mode is the opposite of a trap — focus *escapes*.
  Under the phone definition above this needs a hardware keyboard on a
  390px-or-narrower viewport, which is not ordinary phone operation; above
  720px the drawer is an inline panel, not a modal, and is not affected at all.

With the sheet open the backdrop dims the page and swallows clicks, but Tab
still walks to controls behind it (`.key`, `.switch__btn`, the nav). Pressing
Enter on one of them still works, so no number is wrong — the sheet is simply
not `inert`.

**Repro**
1. Open `calc.html`, narrow the window to 390x844.
2. Type `2+3`, press Enter, then click the `∑ Steps` tab.
3. Press Tab a few times: the focus ring leaves the panel and walks the keypad
   and the nav while the sheet stays open.
4. When shipping: set `inert` on the siblings of `.drawer` while
   `data-open="true"` **and** the `max-width: 720px` branch is active. Do not
   apply it above 720px — there the drawer is not a modal.

### 3. The JavaScript budget — RULED: JS-ONLY, WHOLE SITE, 81,920 BYTES

- **Ruling (2026-10-04):** the budget is the JavaScript only, unminified, summed
  across every shipped file on the site, capped at 81,920 bytes. Per-page total
  weight (HTML+CSS+JS) is a performance statistic and nothing more — never trim
  product content against it. `test.html` stays, linked from nowhere.
  `window.HAHA.test()` stays available on the live site.
- **Measured 2026-10-04 after the exact-by-default change:**

| shipped file | bytes |
|---|---|
| `fox.js` | 9,934 |
| `voice.js` | 9,985 |
| `engine.js` | 27,543 |
| `calc.js` | 24,427 |
| `background.js` | 22,915 |
| `story.js` | 5,888 |
| **total** | **100,692 — 18,772 over the cap** |

`assets/js/selftest.js` (37,398 bytes) is QA-only: `calc.html` reaches it through
a `?selftest` query check, so a visitor never fetches it and it is not counted.

**Per-page total weight, for information only:**

| page | bytes | gzipped JS |
|---|---|---|
| `index.html` | 101,539 (99 KB) | 21,514 |
| `calc.html` | 153,823 (150 KB) | 30,341 |
| `about.html` | 85,247 (83 KB) | 10,568 |

The whole site's JavaScript is **32,468 bytes gzipped** — what a visitor actually
downloads, on any page, is at most 30 KB.

**What was already taken, without losing a feature:** `background.js`
`drawGrid` ran six near-identical stroke loops for one grid. It now builds
three segment lists per orientation and strokes each once: 440 bytes, and the
code no longer repeats itself. `.verify/paper.cjs` 51/51 and `.verify/paper-rm.cjs`
53/53 still pass, pixel comparisons included.

**The trim proposal (verbosity only — no line, step, error message or feature is
proposed for removal).** Sized, not guessed. `background.js` breaks down as
setup 4,097 · helpers 3,300 · grid 2,156 · curve 1,044 · plot 1,122 · nib 1,007 ·
droplets 2,131 · stamps 988 · glyphs 1,379 · folded corner 931 · frame loop
4,761.

1. **Keep the cap and drop the paper.** Stop loading `background.js` on all
   three pages: **-22,915**, site total **77,777**, 4,143 under the cap. Costs
   the graph paper, ink curve, nib, droplets, margin stamps and folded corner —
   the site's visual identity, not any feature. This is the only single change
   that clears the cap.
2. **Keep the paper but make it static graph paper only** — grid and plot, no
   ink curve, nib, droplets, stamps, glyphs or fold, painted once instead of per
   frame: about **-13,500**, site total **≈87,200**, still ≈5,300 **over**. Not
   sufficient on its own; add option 3 and it is still ≈3,500 over.
3. **Fold the two AST walks in `engine.js` into one** returning `{v, x}`:
   **≈-1,800**, and it removes duplicated structure rather than content. The
   price is touching every step site, which is where the narration lives, so it
   needs the full gate re-run.

Even taking 1+2+3 in full only reaches the cap by removing the paper; there is
no honest trim left inside the 2d feature set. So the choice is between the cap
and the canvas, and it is a design ruling, not an engineering one. **No trim has
been applied.** Option 4 — raise the cap to 105 KB and keep the site as shipped
— is recorded in NOTES only because 100,692 unminified is 32,468 over the wire,
and the constitution forbids the bundler that would make the source number small
without the feature going away.

### 4. The Render deploy — DEFERRED BY DESIGN

- **Ruling:** deferred. The ship pass owns the live URL, the OG tags and the
  final sweep. This is not a defect to be chased before merging.

There are no Render credentials on the build host, so nothing was verified
against a live deploy — only against the same files over `file://` in headless
Chrome. `render.yaml` publishes the repository root as static output with
`autoDeploy: true`, and every path in the site is relative, so `file://` and a
static host resolve identically.

**Ship pass**
1. Push the branch Render watches and read the deploy log.
2. Confirm the three HTML files serve and `assets/` resolves.
3. Confirm the OG tags against the live URL — they currently point at
   `https://haha-lol-calculator.onrender.com/assets/img/og-kitsu.png`.
4. `render.yaml` is the only config present; start there before touching pages.

---

## Architecture residue — CLOSED

**Closed.** The `@media (max-width: 520px)` block that styled
`.sheet__row`, `.sheet__fox`, `.ladder` and `.keys` from a stylesheet every page
links no longer exists in any shared file.

The tokens/base split put that block where it belonged — in `about.html`'s own
`<style>` — because `base.css` is loaded by all three pages too, so filing it
there would have left the leak in place. No shared stylesheet now contains a
media query for a component that exists on only one page:

| file | media queries | scope |
|---|---|---|
| `tokens.css` | none | custom properties only, frozen |
| `base.css` | `prefers-reduced-motion: reduce` | global by definition |
| `calc.css` | 5 | calculator only, loaded only by `calc.html` |
| `index.html` `<style>` | `max-width: 860px`, `max-width: 420px` | landing only |
| `about.html` `<style>` | `max-width: 520px` | about only |

The layer split itself, for the record: `tokens.css` is 44 lines and holds only
`:root`. `base.css` is the shared furniture. The two together reconstruct the
old `tokens.css` byte for byte, minus the 520px block that moved to
`about.html`, and that was verified by rendering every page at five widths in
both the pre-split and post-split trees and comparing the raw pixel buffers.

---

## Not limitations, on purpose

- **`calc.html` scrolls at every width again.** Through phase 2c it fitted an
  844px viewport exactly. The 2d keypad — the `2nd` key, quick operations and
  four memory keys — added three rows, and the pad is now 849px of the 868px
  core at a 1280x900 window. The page scrolls, which is what every other page on
  the site does and what a 40-key pad has to do. No layout overflows: measured
  at 1280x900, 1024x900, 768x1000 and 390x780, all 40 keys are at least 34px
  tall, none overlap, the pad stays inside `.core`, and the display settings
  panel stays inside the 250px dock.
- **The steps panel is capped at `max-height: 52vh`.** Measured at 360, 390,
  667, 713 and 844px wide, the open sheet covers 14%–46% of the viewport, so it
  has never needed to scroll internally. If a much longer calculation does
  overflow, the panel already carries `overflow-y: auto`.
