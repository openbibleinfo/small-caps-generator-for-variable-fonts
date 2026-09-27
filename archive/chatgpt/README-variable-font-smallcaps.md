# Variable-Font Simulated Small Caps Calibrator

Archived prototype specification. For the current application and usage, see the [project README](../../README.md).

## Goal

Build a small browser-based tool for creating **simulated small caps from any variable font** when the font does not provide usable true small-cap glyphs.

The tool should help determine, for a chosen variable font:

1. the correct **small-cap scale** so reduced capitals match the font’s x-height;
2. the correct **small-cap weight** so reduced capitals optically match the stroke weight of the surrounding text;
3. any needed **spacing adjustment after the full-size initial**;
4. the CSS needed to reproduce the result in production.

The current test font is Inter Variable, but the project should be designed so the font can be swapped without rewriting the calibration logic.

---

## Desired effect

Given normal uppercase source text:

```html
<span class="smallcaps">LORD</span>
```

render it visually as:

- `L` at normal cap height and normal text weight;
- `ORD` reduced to approximately the font’s x-height;
- `ORD` made heavier on the variable font’s `wght` axis so its strokes visually match the normal text;
- optional slight negative spacing after the initial.

Likewise:

```text
My LORD GOD is
```

should visually behave as:

```text
My Lᴏʀᴅ Gᴏᴅ is
```

with the reduced capitals matching the surrounding lowercase text in apparent height and stroke darkness.

---

## General CSS model

The preferred production markup is the simple form:

```html
My <span class="smallcaps">LORD</span> <span class="smallcaps">GOD</span> is
```

when `::first-letter` behaves reliably for the target environment.

Conceptually:

```css
.smallcaps {
  display: inline-block;

  /* calibrated for the chosen font */
  font-size: var(--smallcap-scale);
  font-variation-settings:
    "wght" var(--smallcap-weight);
}

.smallcaps::first-letter {
  /* undo the scale so the initial remains full-size */
  font-size: calc(1em / var(--smallcap-scale));

  /* restore normal surrounding-text weight */
  font-variation-settings:
    "wght" var(--text-weight);

  /* optional optical spacing correction */
  margin-right: var(--initial-right-margin);
}
```

An explicit-markup fallback may also be supported:

```html
<span class="smallcaps-explicit">
  <span class="initial">L</span><span class="rest">ORD</span>
</span>
```

This is useful if `::first-letter` creates cross-browser problems.

---

## Important implementation requirement: load the real variable font

Do not assume that a font-family name means the browser is actually using the desired variable face.

A previous failure mode in this project was that the test UI silently inherited the host application's system font stack:

```text
-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, ...
```

That made weight tuning meaningless.

For each font being tested, define or load a real variable `@font-face` and make sure the face advertises the full weight range.

Example pattern:

```css
@font-face {
  font-family: "CalibrationFont";
  src: url("path/to/font-variable.woff2") format("woff2");
  font-style: normal;
  font-weight: 100 900;
  font-display: block;
}
```

Then apply that family explicitly to every test glyph.

The UI should expose a simple diagnostic showing:

```text
font loaded: true
computed font-family: CalibrationFont
computed font-variation-settings: ...
```

If the expected font is not loaded, calibration results are invalid.

---

## Weight-axis handling

Use the actual variable-font axis:

```css
font-variation-settings: "wght" 620;
```

Do not rely solely on named/static weight instances.

The calibration UI should use a continuous slider, for example:

```text
500 ───────────────────────────── 800
```

with a visible numeric readout.

Recommended granularity:

```text
step="0.1"
```

The tool should make it visually obvious that values between standard hundreds are being honored.

Do not accidentally introduce `font-weight` declarations that cause the browser to choose static or quantized instances instead of the continuous variation axis.

---

## Height calibration

The reduced capitals should approximately match the font’s lowercase x-height.

The general target is:

```text
small-cap scale = x-height / cap-height
```

If the font exposes reliable metrics, use those.

Otherwise, determine it by rendering:

```text
x   X
```

where:

- `x` is normal-size lowercase at the surrounding text weight;
- `X` is a reduced capital using the candidate scale.

The UI should display these side by side.

A scale slider should remain available even if an automatic metric-derived value is calculated.

Example range:

```text
0.70–0.85
```

with a fine step such as:

```text
0.0005
```

Do not hard-code Inter’s value as a general rule.

---

## Weight calibration

Once height is fixed, adjust the reduced-capital `wght` axis so its strokes look as dark/thick as the surrounding text.

A useful diagnostic is:

```text
full-size L at normal weight
reduced L at candidate small-cap weight
```

The most useful visual comparison is an overlay where:

- both glyphs use the same font;
- the reduced glyph is scaled to the calibrated small-cap height;
- the **actual visible lower-left ink corners** are aligned;
- the normal glyph is gray;
- the reduced glyph is black.

Do not align only CSS boxes, baselines, or text origins and assume the glyph ink is aligned.

The project may optionally compute stroke measurements programmatically, but automated measurements should be treated as diagnostics rather than unquestionable truth. Optical matching is ultimately the goal.

Different fonts will require different `wght` compensation.

---

## Spacing calibration

Shrinking the letters after the initial changes the perceived spacing between the full-size initial and the reduced remainder.

For some fonts, a small negative margin after the initial improves the result.

Expose a slider such as:

```text
Initial right margin
-0.10em ───────────────────── 0.02em
```

with a visible numeric readout.

The current Inter experiment suggests approximately:

```css
margin-right: -0.05em;
```

but this is only an example and should **not** become a global default for every font.

Test more than one word so spacing is not tuned specifically to a single glyph pair.

The current useful sample is:

```text
My LORD GOD is
```

because it provides both:

```text
L + ORD
G + OD
```

for comparison.

---

## Calibration UI

The main preview should show:

```text
My LORD GOD is
```

with both words using the exact same simulated-small-caps treatment.

Controls should include:

### Small-cap scale

Visible value, for example:

```text
0.7503
```

### Font weight

Visible value, for example:

```text
620.0
```

Use the label:

```text
Font weight
```

rather than "Manual comparison."

### Initial right margin

Visible value, for example:

```text
-0.0500em
```

Every slider must visibly show its current value while it is being dragged.

---

## Diagnostic area

Include:

### Height comparison

```text
x   X
```

Normal lowercase `x` versus reduced-capital `X`.

### Stroke comparison

```text
L   L
```

Normal full-size `L` versus reduced `L`.

### Optional overlay

Gray full-size `L` beneath black reduced `L`, aligned by actual glyph ink.

### Font verification

Show:

```text
requested family
computed family
font loaded?
current variation settings
```

This is important because silent fallback fonts make the tool useless.

---

## Output

The tool should generate a concise CSS result that can be copied into production.

Example:

```css
:root {
  --smallcap-scale: 0.7503;
  --smallcap-weight: 620;
  --smallcap-initial-margin: -0.05em;
}

.smallcaps {
  display: inline-block;
  font-size: calc(1em * var(--smallcap-scale));
  font-variation-settings:
    "wght" var(--smallcap-weight);
}

.smallcaps::first-letter {
  font-size: calc(1em / var(--smallcap-scale));
  font-variation-settings:
    "wght" var(--text-weight);
  margin-right: var(--smallcap-initial-margin);
}
```

The generated CSS should use the calibrated values for the currently selected font.

---

## Inter as the current test case

Inter Variable is useful for developing the tool because it has a continuous weight axis and is easy to inspect.

Current visual experiments suggest roughly:

```text
small-cap scale: ~0.75–0.76
small-cap weight: ~620 when surrounding text is 500
initial right margin: ~-0.05em
```

These values are **examples only**.

Do not make the application architecture assume:

- Inter;
- a 500 base weight;
- a 620 small-cap weight;
- a 0.75 scale;
- `-0.05em` spacing.

Those should all be parameters.

---

## What went wrong in earlier prototypes

Avoid repeating these mistakes.

### 1. Silent fallback to the host UI font

The test appeared to use Inter but inspection showed:

```text
-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, ...
```

Always verify the actual loaded font.

### 2. Treating ordinary static weights as a variable axis

A weight slider that visibly jumps only at:

```text
500
600
700
800
```

is not functioning as intended.

The tool should exercise the actual continuous variable axis.

### 3. Mixing rendering paths

Earlier experiments compared:

- DOM CSS rendering;
- Canvas `ctx.font`;
- SVG text.

They did not always resolve the variable font identically.

For the primary interactive preview, use one rendering path consistently: ordinary DOM text with the explicitly loaded variable font.

Canvas or SVG may be used for diagnostics only after verifying they resolve the same font and axes.

### 4. Aligning glyph boxes instead of glyph ink

Matching:

```css
left: 0;
bottom: 0;
```

does not necessarily align visible glyph corners.

If making an overlay, align actual rendered ink bounds.

### 5. Assuming geometric equality equals optical equality

Equal mathematical stem width may not produce the best-looking result.

The tool should help the user combine:

- metric-derived starting values;
- visual diagnostics;
- fine manual adjustment.

---

## Architecture recommendation

Treat calibration as a small data model:

```js
{
  fontFamily: "Inter Variable",
  fontSource: "...",
  axes: {
    wght: {
      base: 500,
      smallCaps: 620
    }
  },
  smallCaps: {
    scale: 0.7503,
    initialRightMargin: -0.05
  }
}
```

Later this can support:

- multiple fonts;
- presets;
- different base text weights;
- other variable axes such as `opsz`;
- saved calibration profiles;
- comparison of true small caps versus simulated small caps;
- automatic metric extraction when font metadata is available.

---

## Acceptance criteria

A calibration is successful when:

1. the intended variable font is demonstrably loaded;
2. weight changes between standard hundreds are visibly/technically continuous;
3. reduced capitals visually match lowercase x-height;
4. reduced capitals have comparable apparent stroke weight to surrounding text;
5. initial-to-small-cap spacing looks natural across multiple words;
6. `My LORD GOD is` updates live as every control moves;
7. every control shows its current numeric value;
8. the tool emits reusable CSS;
9. swapping in another variable font does not require changing the core calibration logic.

---

## Immediate next step

Use the current Inter test only to stabilize the tool architecture and interaction.

Once that works reliably, test at least several structurally different variable sans and serif fonts to make sure the calibration system is genuinely font-independent rather than accidentally tuned to Inter.
