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

### 3. The Render deploy — DEFERRED BY DESIGN

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

- **`calc.html` does not scroll at 1000px and wider.** The page is 844px tall in
  an 844px viewport. Deliberate, and documented at `assets/css/calc.css`
  (*the calculator carries more keys than the reading pages, so it gets a
  tighter footer and stays inside a laptop viewport*).
- **The steps panel is capped at `max-height: 52vh`.** Measured at 360, 390,
  667, 713 and 844px wide, the open sheet covers 14%–46% of the viewport, so it
  has never needed to scroll internally. If a much longer calculation does
  overflow, the panel already carries `overflow-y: auto`.
