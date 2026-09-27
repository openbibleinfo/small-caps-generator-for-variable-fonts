# Small-caps generator for variable fonts

[Try out this tool](https://openbibleinfo.github.io/small-caps-generator-for-variable-fonts/) or [read a blog post about it](https://www.openbible.info/blog/2026/09/so-you-want-smallcaps-but-your-font-doesnt-support-them/).

This README and all project code were written by AI. Third-party libraries and fonts retain their original authorship and licenses.

## License

We use the [MIT License](LICENSE.md) for this project's code and documentation, to the extent we hold any applicable copyright rights.

AI-generated code may not be copyrightable. Copyright protection depends on the applicable law and the nature of any human authorship; the [U.S. Copyright Office's guidance](https://www.copyright.gov/ai/) distinguishes human-authored contributions from purely AI-generated material. Using the MIT License does not establish that copyright exists in this project's AI-generated content.

Third-party libraries and fonts remain subject to their own licenses and notices.

## Overview

Open **[index.html](index.html)** directly in a modern browser. It is one HTML file including the font parser, WOFF2 decoder, and precomputed measurements. **No font files are embedded.** Startup without a shared font URL makes no network requests. No installation, server, uploads, analytics, or persistent storage. Selected fonts stay in browser memory.

On wide screens, the font and recipe sidebar scrolls independently from the comparison. Use **Preview**, **Outlines**, and **Font research** to switch views. The code export stays below the comparison, with **Font-axis**, **Scaling · CSS**, **Scaling · JavaScript**, **Naive**, and, when supported, **Built-in** export tabs directly above it. Usage notes and complete HTML are expandable. Narrow screens use normal page scrolling.

Loading progress appears below **Generate small-caps** in the left column, with spinners during downloading and analysis. Animation respects reduced-motion preferences. **Font details** is a collapsed section in that column containing native small-cap coverage and browser measurement limitations; the loaded family is identified in the status.

## Choose a font

Drop a TTF, OTF, WOFF, or WOFF2 file into the font input to load it locally. Drop one variable font at a time (16 MB maximum); the file picker is also available under Installed fonts & local files.

Enter an **installed font family name** in the same input used for Google fonts and press Enter. Quote a name to prefer its installed version. The same previews, controls and exports work without font-file access or permission prompts. Rendering checks detect small-caps and responses to `wght`, `wdth` and `opsz`, with synthesis disabled. Variable faces are bound through CSS `local()` so axis changes work consistently in measurement, preview and export. Detected weight axes get a finer search; detected width and optical-size axes enable their controls. Slider bounds are tested windows, not declared font ranges: wght 100–900, wdth 50–200, opsz 6–144. Other axes are not tested.

When no variable-axis response is detected, weight selects available static faces; fine stroke adjustment may be unavailable, and width adjustment uses horizontal scaling. No response does not prove the font is static. Browser measurements use pixels at 128px and individual-letter spacing, so they are less precise than outline and word-shaping measurements. Horizontal-stroke measurements remain unavailable. Linux regression: `node tests/features.cjs`.

Known Google families with native small-cap measurements load the full public font from the audit’s source URL, rather than the Google CSS subset. This enables the native comparison while using the stored recipe. Other Google families still use the CSS API. Display labels show the selected family and the actual loaded weight-axis range; internal file names remain in diagnostics. Fonts are downloaded on demand, never embedded in the HTML.

The **Size** and **Overlay** tabs share the sample input. Size is selected by default. Hover over the input for the hint: uppercase words become an initial plus small-caps; the hint is also available to screen readers. In Size, the compact **Show lines** controls select All caps, Naive browser, Font-axis fit, Horizontal scaling, and Built-in. Built-in is disabled and labelled “unavailable for this font” when native smcp references are unavailable. Visibility choices persist across font and recipe changes in the session and also determine which lines can be selected in Overlay.

**Overlay** places two selected lines on a shared baseline, using orange and green. It defaults to the bottom two visible, available lines; Compare and Against select a different pair. Inspection size controls the overlay size. The overlay is measured when its tab is shown.

Preview sizes run from 48 down to 12 px. Individually labeled rows show Naive browser (font-variant: small-caps), the font-axis fit, the horizontal-scaling fit, and native small-caps when available. All use the same base size and optical axes. Partial native coverage is labeled. Code export starts as a collapsed bar; click it to open the width-handling tabs and code. “Width method” defaults to Automatic: use a usable wdth axis when available, otherwise horizontal scaling. Explicit font-axes-only and horizontal-scaling overrides remain available. The export tabs offer Font-axis fit (reusable CSS without horizontal scaling), plus precomputed word-specific CSS (only for uppercase words in the current preview; no runtime JavaScript), runtime JavaScript correction, Naive browser small-caps, or Built-in small-caps when the loaded font supports all required letters. Naive Google previews load a separate face from the regular Google Fonts stylesheet with the same width, weight, and optical-size axes. Exports request the selected base-axis values from that stylesheet too; Built-in exports retain the source with verified smcp glyphs. “Initial letter” chooses a full-size initial (smcp style) or all small-caps (c2sc style).

For a Google family present in the comparison table, Automatic applies its stored size, weight, width-axis and tracking recipe instead of fitting again. `src/table-recipe.js` interpolates stored weight/optical-size samples and clamps outside their sampled range. Other base axes must remain at the audited defaults; unsupported settings fall back to live fitting. Manual adjustments and Match x-height override the stored recipe. The loaded file’s native-smcp status remains separate: Google’s subset may lack the feature despite the full font’s recorded measurements. `node tests/table-recipe.mjs` verifies every stored instance and interpolation.

Google font suggestions apply immediately when selected. You can also enter **one local font name**, optionally quoted, and press Enter. Quoting forces local lookup when the same name appears in the Google catalogue. Typed names use browser rendering without installed-font permission and support static fonts. Full face and PostScript names also get a CSS `local()` lookup. A font available only through an application, such as an Office cloud font, may not be available to the browser; install the desktop font through the operating system. Comma-separated font lists and generic-family resolution are not supported.

Interface text uses the browser’s default font size as its minimum, independent of the specimen sizes. The default specimen is “The LORD is my shepherd”; interface captions use sentence case.

Type a **variable Google Fonts family name**, paste a specimen/CSS link, or paste a Google CSS embed; click **Generate small-caps**. The embedded catalogue includes only upright Latin families with a usable `wght` axis and supplies weight, width and optical ranges. The browser fetches CSS and the upright Latin font directly from Google (no API key or proxy). Remote CSS is parsed, never injected. HTTPS font hosts are permitted by the network policy; opening a shared Google-font or HTTPS-font link starts its download automatically. The exported recipe includes the exact analyzed font URL. It covers Latin, not every Unicode subset. Other axes stay at Google's defaults. Names outside the catalogue are tried as installed families; static installed fonts are supported through browser measurements. Refresh with `node scripts/google-catalog.mjs` and rebuild to include newly available variable families.

You can also paste a **direct HTTPS WOFF, WOFF2, TTF or OTF URL** into the same field. The browser downloads and analyzes it directly, without a proxy, credentials or referrer. The host must allow CORS, including a local file’s origin (`Access-Control-Allow-Origin: *` works for these credential-free requests). Files are limited to 16 MB and must have a usable `wght` axis. Static files, malformed fonts and failed downloads leave the existing selection intact. The exact URL is retained in the generated CSS; ensure you have permission to use and host the font. Signed URLs will expire according to their host’s rules. Arbitrary remote CSS is not supported.

Under **Installed fonts & local files**, supporting browsers can enumerate and inspect installed faces locally after explicit permission. Only readable faces with a usable `wght` axis enter the dropdown; scanning a large library can take time. Availability depends on the browser, secure context and permission policy; unsupported/denied access has a variable-file-import fallback. The optional file-reading picker is separate from the permission-free browser measurement path for typed family names. Installed-font exports use `local()` and therefore require the same installed face on the reader's machine. See [Chrome's Local Font Access documentation](https://developer.chrome.com/docs/capabilities/web-apis/local-fonts).

**Native small-caps (smcp)** in Font details reports the feature tag in the actual loaded file, plus tested Latin a–z substitution coverage. It does not confuse phonetic glyphs or references recovered from a separate full font with native support in a Google subset. The distinction also appears in exported code and downloaded measurements. Absent native small-caps, the current 51-family corpus estimate and stroke fitter generate simulated small-caps. Local imports and the measurement chart work without a connection. Google Fonts and direct font URLs require a connection when imported; loaded fonts remain in memory for the session.

**Copy the chosen CSS** provides selectable, live-updating rules and a Copy CSS button. In unscaled mode with a full-size initial, use `<span class="smcp">Lord</span>`: one word per span, spaces outside. `::first-letter` restores the initial's full size, base weight and base axes; the remaining letters use the calibrated size, weight, width axis and tracking. This requires `inline-block`, but has no transforms, nested elements, width-measurement helper or runtime JavaScript. `.smcp-text` pins the surrounding reading size and base axes. Only the first letter is restored: internal capitals such as McDonald and multiple words in one span are not native-smcp equivalents. Clipboard failures select the CSS for manual copying.

The CSS includes `font-variant: small-caps` as a rich-text-paste hint, with `font-feature-settings: "smcp" 0` and `font-synthesis: none` to keep browser rendering under calibration control. Source text remains mixed case; clipboard serialization and destination formatting support vary, so this is not a guarantee about plain-text casing or Word's result. Word paste has not been verified here.

Editable application sources are in `src/`; `index.html` is the generated standalone app.

## Current corpus

The plot uses **51 calibrated variable families / 186 instances** from [research/corpus.json](research/corpus.json): 50 variable families with verified Latin smcp in the [top-500 audit](research/top500-smcp-audit.md), plus Inter’s eleven phonetic reference letters. Jura has four native reference letters. Coverage and provenance appear in the table and tooltips. References filters select All families or popularity cutoffs of 50/100/200/300/500, containing 13/17/30/38/51 plotted families respectively. Inter is included by popularity rank without claiming its research file has an smcp feature. Static fonts are excluded from this corpus.

The corpus fits use the same CSS-only solver as the app, at weights 400/500/700 and each available optical-size minimum/default/maximum (deduplicated). Base width and all other axes stay at defaults. The plot shows residual ink-width error, actual glyph-width change, weight-axis change, tracking or stem uplift; green squares identify serif and orange circles identify sans-serif, with Roboto Mono grouped by its sans-serif letterforms. The table includes boundary warnings and shaped-word spacing error. Related designs are not independent samples. The generator uses this corpus for its fallback: equal-family medians of measured native height and width targets and fitted tracking, interpolated by base weight over 400–700. Each family contributes once at its default optical design; outside that weight range the estimate clamps to the nearest endpoint. Partial reference families participate equally. The expanded dataset is still not a representative or independent sample of all fonts.

Reproduce with `node scripts/calibrate-corpus.mjs [font-cache-directory]`, then `npm run build`. The script uses bundled research fonts and SHA-256-verified public full files from the audit; missing audit files are downloaded to the cache, never from users. Font data are not added to the HTML: only compact measurements are embedded. Run `node tests/corpus.cjs` to check the dataset against the solver and axis ranges.

The top-500 audit uses the same popularity snapshot as the top-50 and top-100 audits. It found 76 families with verified Latin smcp substitutions (including partial coverage), of which 50 have variable weight; 200 of the 500 checked files have variable weight. Tags alone do not qualify: fonts such as Heebo that did not produce Latin smcp substitutions in our shaping check are not counted. Audit scripts are `scripts/audit-google-fonts.py` (accepts metadata/tree snapshot paths, limit and font cache) and `scripts/verify-google-audit.mjs` (checks shaping and writes JSON/Markdown). To reproduce from the existing cached snapshots: `python3 scripts/audit-google-fonts.py`, then `node scripts/verify-google-audit.mjs /tmp/smallcaps-top500-audit.json research/top500-smcp-audit`. Calibration reuses previous results only when source hashes, solver hash and sampled weights match. Classification lives in `research/font-categories.json`.

`src/corpus-prior.js` implements the current estimator. `node tests/prior.mjs` checks interpolation, endpoint clamping and equal-family treatment, and writes [leave-one-family-out diagnostics](research/prior-validation.json). At weight 500/default optical designs, median held-out proportional errors are 2.34% for height, 2.30% for width and 0.0221em for tracking. These measure target prediction—not rendered similarity—and related designs are not independent. Native width targets are stored separately from achieved fitted widths to avoid learning the solver’s limitations as design targets.

## Using the tool

Scaled exports use two spans: `<span class="smcp-transform" data-word="LORD">L<span class="smcp-rest">ord</span></span>`. The outer span keeps the word together at line breaks. A calculated right margin on the scaled letters corrects their layout width without a third wrapper. Precomputed margins use em units and are measured using the rounded export settings. Exported weights and axes have at most two decimal places; scale and spacing values have at most four, without trailing zeros. The solvers calculate at full precision; automatic height and weight values are rounded to the controls’ precision, and tracking is rounded and clamped to its control range before preview and export.

Each Size group lists All caps, Naive, Font-axis, Scaling, and Built-in when available, subject to Show lines. “Compare the outlines” follows the selected output method, including its candidate weight, wdth or scaleX, and tracking-adjusted error measurements. Available native smcp glyphs always supply the comparison reference, even when fitting to x-height or estimated proportions. Automatic width selection uses the axis fit when wdth is available and the independent scaling fit otherwise. Scaling exports use nested spans. By default, the generator measures each distinct uppercase word in the sample and exports word-specific widths in em units; the consuming page needs no JavaScript. Regenerate for new words or changed font settings. Font-size changes scale these widths with fixed optical axes. The optional JavaScript mode reserves transformed widths after fonts load, on window resize, and when ResizeObserver detects changed text dimensions. Naive previews and exports use font-variant: small-caps (all-small-caps in that mode), allowing browser synthesis when built-in glyphs are unavailable. Built-in exports use actual smcp glyphs. Neither requires JavaScript. Automatic height, weight, and tracking are fitted independently for the unscaled and scaleX recipes. Their controls show the selected fitted recipe’s values; changing Small-cap weight applies that manual weight to both fitted recipes. For tracking, manual changes from −0.12 to +0.12 em apply to fitted and built-in small-caps, only within small-caps words. Width adjusts wdth in both fitted treatments and built-in glyphs when available; without wdth it adjusts only the horizontal-scaling treatment. “x-height” beside Height scale applies the current x-height/cap-height ratio as a manual height setting. Manual height changes apply to the font-axis and horizontal-scaling small-caps in Size, Overlay, and exports; full-size initials and built-in glyph heights stay unchanged. Small-cap weight applies only to the fitted small-caps; Built-in always uses the text weight. Manual tracking applies to both fitted and built-in small-caps, preserving full-size initials. After initial adds the same full-size-em gap to the naive, font-axis, horizontal-scaling, and native word previews, and to exported recipes. It is disabled in all-small-caps mode; the original all-caps row stays unmodified. Partial-reference fonts compare matching glyphs in aligned cells.

Choose a Google family, direct font URL, installed font, or variable TTF, OTF, WOFF, or WOFF2 file. Uppercase Latin words in the sample become mixed-case source text with full-size initials followed by simulated small-caps. Change the surrounding weight and other axes, including optical size; the fit updates. Height, small-cap weight, tracking and initial gap can be adjusted manually. Small-cap Width adjusts the `wdth` axis when available; otherwise it adjusts scaleX, with 1 meaning unchanged width. Fit to font evidence restores the fitted width.

Size shows the entered sentence at each listed size. Native smcp rows with incomplete reference coverage are labelled “partial coverage.” Overlay uses aligned reference-letter cells for incomplete reference sets. Phonetic references can inform fitting and outline comparisons, but do not enable the Built-in checkbox. A matching already loaded full font can supply native references for a stripped subset.

Uncheck “Show point numbers” above the Font research graph to hide its point labels. Axis values, hover/focus details, and the numbered table remain available. The choice is retained while changing graph settings during the session.

The comparison plot switches between width, weight-axis change, tracking, and native stem compensation. Its weight selector uses precomputed 400/500/700 instances. Its optical-design selector compares each font’s default, minimum, or maximum `opsz`; these are not identical numeric sizes across families. The table retains the exact values when points are close together.

Export font size is separate from inspection size. A 48/36/32/28/24/20/18/16/14/12px ladder renders the same recipe with fixed axes to expose rasterization differences. “Follow export font size” explicitly sets `opsz` to the export font size in px, clamped to the font’s range, and refits the recipe. Both full-size and small-cap runs share this optical design. Enlarging the inspection preview does not change it. This is an explicit policy, not a claim to reproduce every browser’s automatic optical-size mapping; [CSS allows other rendering factors](https://www.w3.org/TR/css-fonts-4/#font-optical-sizing-def). The exported CSS pins the intended size and axes.

Export HTML/CSS, Typst, LuaLaTeX, or measurements JSON. Font-axis, precomputed Scaling · CSS, Naive, and Built-in web exports need no JavaScript; Scaling · JavaScript includes a runtime width-correction helper. Font axes affect real glyph advances, so surrounding text is laid out using the actual widths. No Unicode small-cap substitutions are inserted into production text.

If the font has complete real small-caps, use them in production rather than the simulation. In full-size-initial mode the native preview shapes mixed-case words such as `Lord` with `smcp`, preserving native kerning across the initial. In all-small-caps mode it uses uppercase input with `c2sc` when that feature is present, otherwise lowercase input with `smcp`. Research calibration and spacing measurements still use lowercase input with `smcp`; the initial selector changes presentation, not the fitted reference set. See [the OpenType feature specification](https://learn.microsoft.com/en-us/typography/opentype/spec/features_pt#tag-smcp).

## Method and limits

1. Find usable native `smcp` substitutions. Otherwise look for a conservative set of Unicode phonetic references. If an uploaded subset omits them, look for an already loaded full font with matching family/version, all basic Latin outlines and advances, axes, and axis extremes. Names alone never authorize a profile match.
2. Set the target height from the median top of available flat reference letters. Round overshoot is not used as the height rule. Recompute the scale at each candidate weight because cap height itself can vary.
3. The CSS-only solver searches weight and, if available, width jointly. Geometric width scaling is fixed at 1. Minimize equally weighted groups of squared logarithmic errors for ink width, vertical stems and horizontal strokes. With no native references, the width target comes from the current-corpus estimate relative to reduced base-weight capitals. Without a width axis, this solver reports the width discrepancy instead of stretching the output. Stroke estimates sample flattened unhinted contours with nonzero winding. Curve flattening and glyph selection are approximations, not optical truth. The independent transform solver fits weight and horizontal scaling while keeping wdth at its base value. Automatic exports use that fit for fonts without a usable wdth axis; the corpus table continues to report CSS-only fits.
4. Fit tracking from shaped native words when a real small-cap feature exists, otherwise from reference advances. `LORD`, `GOD`, `TYPE`, and other strings contribute. The metric is per small-cap em before horizontal scaling. The full-size-initial gap is left for manual tuning: mixed-size runs lose cross-boundary kerning and different pairs need different adjustments.
5. Automatic calibration uses font-specific references if available, otherwise the current corpus. The alternative, “Match x-height”, sets the height to lowercase x while still fitting weight and available width; tracking uses the current corpus fallback. At base weight 500 the corpus medians give height = x-height + 0.2547 × (cap-height − x-height), native width target = 1.0921 × uniform scaling, and starting tracking +0.0485em. The solver fits this font’s weight and available width axis to preserve approximate full-size capital stroke thickness. These remain provisional defaults, not the designer’s intended small-caps. Graph filters do not change this estimate.

The prior interpolates equal-family medians by text weight over 400–700. Leave-one-family-out height errors reach **7.2%** in this small corpus; do not interpret the average as a universal law. Native design differences are real. Width and height corrections are independent; letter-specific changes and kerning cannot be recreated perfectly by a global transform.

File and URL imports require a usable variable weight axis and basic Latin x/H. Installed family names can use static faces through browser measurement. Fonts without wdth use horizontal scaling for width adjustment. COLR color fonts with monochrome outlines are measured from those outlines while the browser retains the original color font for preview; color-layer appearance is not part of the fit. Non-Latin shaping, font collections, and full multilingual small-cap synthesis are outside the scope.

Outline measurements avoid Linux/Windows/macOS rasterization differences. They do not eliminate the need for optical review: hinting, antialiasing, device pixel ratio, browser shaping, and intended text size affect appearance. Optical-size axes are held explicitly, not left to the browser’s automatic size choice. Tune the live preview at reading size on the target platform. Browser regression tooling targets Linux Chromium. Current browser coverage has limitations described under Verification; Windows and macOS visual checks remain manual.

Fontkit rounds varied points to font units; independent FontTools research calculations retain fractions. The app uses compatible corpus recipes when available and otherwise fits live. The parser and outline fitter run in a worker. Installed-family measurements use browser rendering. WOFF/WOFF2 containers are decompressed locally into SFNT before variation processing. The WOFF2 wrapper exposes its embedded WASM without fetching it.

## Rebuilding and expanding the corpus

Only developers need Node/Python. The delivered HTML does not.

Repository layout:

```text
index.html          Standalone app to open or publish (generated)
README.md           Usage, method, and development instructions
src/                Editable app template, styles, and JavaScript
  data/             Google Fonts catalogue embedded during builds
scripts/            Build, font download, calibration, and audit tools
research/           Measurements, calibration profiles, and audit reports
tests/              Engine, data, and browser checks
fonts/              Research/test font fixtures and their licenses
licenses/           Additional library license notices for the build
archive/chatgpt/    Original prototype and notes
```

Run the following commands from the repository root. Node dependency manifests stay at the root; Python research dependencies are listed in `scripts/requirements.txt`.

```sh
npm ci
python3 -m pip install -r scripts/requirements.txt

# Optional: fetch the explicitly listed public research fonts and licenses.
# Existing files are preserved unless --refresh is supplied.
python3 scripts/fetch_fonts.py

# Measure the full fonts at 400/500/700 and optical-size endpoints/defaults.
python3 scripts/profiles.py fonts/InterVariable.woff2 fonts/SourceSerif4.ttf fonts/EBGaramond.ttf fonts/SourceSans3.ttf fonts/Alegreya.ttf --output research/profiles.json
node scripts/research-spacing.mjs
npm run build
```

Profiles store source SHA-256 hashes, axes, instance fits, errors, and corpus validation. To expand the plotted corpus, extend the audit and classification, then rerun calibration; only measurements are embedded. Bundled font files are offline research/test fixtures, not special UI choices. Arbitrary user fonts need no precomputation. The HTML contains no backend; Python is strictly an offline research tool working on intentionally selected font files.

`src/app.template.html`, `src/app.js`, `src/style.css`, `src/engine.js`, `src/decode.js`, and `src/worker.js` are editable sources. `npm run build` generates the standalone `index.html`; do not edit that generated file directly.

For GitHub Pages, publish the repository root containing the generated `index.html`. It also works under a project subdirectory: scripts, styles, and measurement data are embedded, with no site-root asset paths. Rebuild after source changes and include the updated `index.html` when publishing.

## Verification

Run the complete check before publishing. It verifies the corpus, builds the standalone page, and runs the offline browser suites. See [the regression test guide](tests/README.md) for coverage and prerequisites.

```sh
npm test                  # Engine, corpus hash/data, and share-state validation
npm run test:browser      # Build, fixtures, color parser, offline browser suites
npm run test:all          # Both groups
```

Install npm dependencies, Python with FontTools/Brotli, and Playwright Chromium first. Use `npx playwright install chromium` if a browser installation is needed. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects an existing Chromium binary; `PLAYWRIGHT_BROWSERS_PATH` selects a Playwright browser cache. The test commands do not download tools or fonts.

Corpus validation checks the recorded SHA-256 of `src/engine.js`, covering wording as well as solver logic. After changing that file, regenerate the corpus with `node scripts/calibrate-corpus.mjs [font-cache-directory]`, then rebuild; do not replace its provenance hash manually.

The [test guide](tests/README.md) describes coverage and manual checks. Offline browser suites use local fixtures and mocked font responses. `node tests/google-live.cjs` and `node tests/google-axes-live.cjs` are optional real-network checks. OS permission dialogs and platform rendering require manual review. Typst and LuaLaTeX checks inspect generated source and downloads; they do not compile documents.

Research fixture fonts retain their OFL notices. Library notices and WOFF2/Brotli licenses are embedded in the HTML. See `fonts/sources.json` for download locations.

## Typst and LaTeX exports

Open **Code export**, then choose **Typst** or **LaTeX (LuaLaTeX)** in the Format menu. Choose Font-axis, Scaling, or Built-in (when available), then copy or download the complete example. Exports carry the current axes, weight, height, tracking, initial gap, initial-letter mode, and export font size. Scaling reserves the adjusted word width. Browser-only Naive and JavaScript modes are unavailable for these formats.

Typst requires version 0.15 or newer for variable font axes. LaTeX requires LuaLaTeX with `fontspec` and `graphicx`. Install the same original TTF/OTF font; alternatively use Typst’s `--font-path` or replace `\SmallCapsFont` in the LaTeX file with its filename. Font files are not bundled. Text shaping and spacing can vary between engines.

## Sharing settings

Use **Share** in the header, then **Copy link**. Readable URL parameters such as `font`, `wght`, and `scale` restore the font source, text, axes, automatic/manual recipe state, comparison visibility, overlay choices, and export/research settings. Google families and HTTPS font URLs load automatically. Local and uploaded fonts are matched by name on a best-effort basis, through Google Fonts or the recipient’s installed fonts. Default settings are omitted; font bytes are never put into the link. The active Size/Overlay tab and Font details disclosure are not saved; shared links open the Size tab. Outlines is not restored as the active workspace view. Older JSON-based links still work. Share from a hosted copy of the app so recipients can open its URL.

## Accessibility

Skip links jump to font controls or comparisons. Sliders and their numeric fields have separate labels; numeric fields offer precise keyboard entry. Workspace, Size/Overlay, and export tabs support arrow keys, Home, and End. Scrollable samples, code, and research data can be reached with the keyboard.

Research points use orange circles and green squares, with text categories and a labelled measurements table. Tab enters the graph once; arrow keys move among points, and Home/End jump to its endpoints. Outline cards include numerical width differences and use dashed/solid edges as well as color. Loading, errors, and copy confirmations have screen-reader status messages. Share uses a native modal dialog with Escape dismissal and focus return.

`tests/accessibility.cjs` runs axe-core scans, keyboard/focus checks, 320px reflow, 200% text resizing, and forced-color checks. It is part of `npm run test:all`. These checks do not establish full WCAG conformance or replace testing with actual screen readers; visual judgment of letterforms remains part of the task. See [accessibility testing notes](tests/README.md#accessibility-checks).
