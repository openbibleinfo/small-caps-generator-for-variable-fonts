# Regression tests

The complete check command is `npm run test:all`. This builds the standalone page, creates temporary fixtures, runs engine/corpus checks, and runs every offline browser suite. The browser runner reports all failing suites instead of stopping at the first failure.

Prerequisites: installed npm dependencies, Python with FontTools and Brotli, and Playwright Chromium. The tests do not install or download tools or fonts. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing browser, or `PLAYWRIGHT_BROWSERS_PATH` for an existing Playwright cache.

- `npm test`: engine, corpus, and share-state validation checks.
- `npm run test:browser`: generated fixtures, color-parser regression, and offline browser suites.
- `node tests/control-contract.cjs`: controls versus actual computed preview styles across six font fixtures.
- `node tests/typeset-exports.cjs`: selected recipes, settings, initial modes, escaping, actual downloaded bytes, clipboard handler, and format switching.

Individual browser commands require a built page and generated fixtures (`npm run build && npm run test:fixtures`).

- `node tests/share.cjs`: Share dialog, clipboard, Google/direct URL/file source round trips, preservation of automatic settings, Unicode text, and invalid links. Network font responses are mocked locally.

## UI and data checks

`node tests/ui-state.cjs` checks downloading and analysis indicators, overlapping font loads, error cleanup, reduced-motion preferences, sidebar status/details, the sample tooltip and accessible label, compact Show lines, Size/Overlay keyboard navigation, transformed widths after switching tabs, and Built-in availability across font changes. It also checks that visibility preferences survive unavailable fonts and phonetic references do not enable Built-in.

Size samples use `.ladder-calibrated`, `.ladder-native`, and `.ladder-transformed`. Tests distinguish fixed Size samples from the adjustable inspection size in Overlay. The overlay suite checks baseline alignment, default and explicit pairs, visibility, and mobile layout. Scroll tests preserve positions except for normal browser clamping when content becomes shorter than the previous scroll position.

Corpus validation compares the recorded SHA-256 with all of `src/engine.js`, including wording. Regenerate through `node scripts/calibrate-corpus.mjs [font-cache-directory]` after changing that file, then rebuild. Do not replace the provenance hash manually.

## Control contract

| Control | Font-axis fit | Horizontal scaling | Built-in | Ordinary text / Naive |
| --- | --- | --- | --- | --- |
| Automatic weight/height/tracking | Own fitted values | Own fitted values | Text weight, original height | Original rendering |
| Displayed weight/height/tracking | Shows this recipe when selected | Shows this recipe when selected | Fitted controls do not describe Built-in | — |
| Manual small-cap weight/height | Applies | Applies | No effect | No effect |
| Manual tracking | Applies | Applies | Applies | No effect |
| Small-cap width, with wdth | wdth | wdth | wdth | No effect |
| Small-cap width, without wdth | No effect | Horizontal scale | No effect | No effect |
| Text weight | Refit | Refit | Uses text weight | Uses text weight |
| Full-size initial | Keeps text size/weight | Keeps text size/weight | Keeps text size/weight | — |

Recipe switching preserves automatic values. A manual override applies to both fitted treatments. Editing a different control must preserve that override. Refitting restores automatic values. Displayed values, computed CSS and exports must agree within the control's precision.

## Fixtures and coverage

Bundled Source Sans 3 and Source Serif 4 cover native small-caps, independent fits, and optical sizing. Inter covers partial phonetic references. `fixtures.py` generates a font without references, a color-layer font reproducing the Cairo Play recursion, and an original three-axis variable font with actual weight/width/optical outline changes. No network is needed.

Existing suites additionally cover rendered HTML exports, local font discovery, mocked Google font delivery, font-file drops, visibility, overlay selection, optical-size linking, desktop/mobile layout, and scroll preservation.

`google-live.cjs` and `google-axes-live.cjs` are separate optional real-network checks. Typst and LuaLaTeX source assertions do **not** establish that documents compile or render correctly; compiler checks remain a separate requirement when those compilers are available.

## Accessibility checks

`node tests/accessibility.cjs` checks the empty state, Size and Overlay panels, expanded Font details, outlines, research, CSS/Typst exports, Share dialog, loading errors, mobile controls, 200% text, and forced colors. axe-core is a development-only dependency and is not embedded in the app. Keyboard assertions cover skip links, slider editing, focus after refitting/errors, tab-panel navigation, roving graph focus, table headers, copy announcements, and native modal behavior. The complete suite runs it automatically.

The scan saves unresolved manual-review items to `smallcaps-accessibility-review.json` in the OS temporary directory. A clean automated scan is not a conformance certification.

Still review with NVDA/Firefox and VoiceOver/Safari: meaningful reading order, loading and clipboard announcements, numeric control editing, graph descriptions/table navigation, dialog opening/closing, and font loading permission dialogs. Check real browser zoom at 200% and 400%, platform high-contrast themes, and pointer/touch use. The automated 320px viewport and text-resize checks exercise reflow but do not reproduce every assistive-technology/browser combination.

Reference guidance: [WAI tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), [complex images and data alternatives](https://www.w3.org/WAI/tutorials/images/complex/), and [reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow/).
