"""Outline-based small-cap calibration; no browser rasterization or font fallback."""
from __future__ import annotations

import math
import string
from statistics import median

from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont


PHONETIC = dict(zip("ABDEGHIJKLMNOPRTUVWYZ", "ᴀʙᴅᴇɢʜɪᴊᴋʟᴍɴᴏᴘʀᴛᴜᴠᴡʏᴢ"))
FLAT = "BEFHKLMNPRTXYZ"
# I is deliberately omitted: an unbarred capital I and barred phonetic ɪ
# are different designs, and their width ratio is not a scaling reference.
COMPARABLE = "ABCDEFGHJKLMNOPQRSTUVWXYZ"


class FlattenPen(BasePen):
    """Flatten curves for approximate, unhinted scanline stroke diagnostics."""

    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.contours = []
        self.points = []

    def _moveTo(self, p):
        self.points = [p]

    def _lineTo(self, p):
        self.points.append(p)

    def _qCurveToOne(self, p1, p2):
        p0 = self._getCurrentPoint()
        for i in range(1, 25):
            t = i / 24
            self.points.append(tuple((1-t)**2*p0[k] + 2*(1-t)*t*p1[k] + t*t*p2[k] for k in (0, 1)))

    def _curveToOne(self, p1, p2, p3):
        p0 = self._getCurrentPoint()
        for i in range(1, 33):
            t = i / 32
            self.points.append(tuple((1-t)**3*p0[k] + 3*(1-t)**2*t*p1[k] + 3*(1-t)*t*t*p2[k] + t**3*p3[k] for k in (0, 1)))

    def _closePath(self):
        if self.points:
            self.contours.append(self.points + [self.points[0]])
        self.points = []

    def _endPath(self):
        self._closePath()


def runs(contours, position, vertical=False):
    """Nonzero-winding filled intervals, including overlapping contours."""
    axis = 0 if vertical else 1
    other = 1 - axis
    hits = []
    for contour in contours:
        for a, b in zip(contour, contour[1:]):
            if min(a[axis], b[axis]) <= position < max(a[axis], b[axis]):
                t = (position - a[axis]) / (b[axis] - a[axis])
                hits.append((a[other] + t*(b[other]-a[other]), 1 if b[axis] > a[axis] else -1))
    winding = 0
    start = None
    result = []
    for point, delta in sorted(hits):
        previous = winding
        winding += delta
        if previous == 0 and winding != 0:
            start = point
        elif previous != 0 and winding == 0 and point > start:
            result.append(point-start)
    return result


class Outlines:
    def __init__(self, font, location):
        self.gs = font.getGlyphSet(location=location)
        self.cache = {}

    def glyph(self, name):
        if name not in self.cache:
            g = self.gs[name]
            bounds = BoundsPen(self.gs)
            g.draw(bounds)
            if bounds.bounds is None:
                raise ValueError(f"Empty outline: {name}")
            pen = FlattenPen(self.gs)
            g.draw(pen)
            x0, y0, x1, y1 = bounds.bounds
            vertical = []
            horizontal = []
            for fraction in (.25, .32, .68, .75):
                widths = runs(pen.contours, y0 + (y1-y0)*fraction)
                if widths:
                    vertical.append(widths[0])
            for fraction in (.44, .5, .56):
                widths = runs(pen.contours, x0 + (x1-x0)*fraction, vertical=True)
                if widths:
                    horizontal.append(min(widths))
            self.cache[name] = dict(bounds=list(bounds.bounds), width=x1-x0, advance=g.width,
                                    vstem=median(vertical) if vertical else None,
                                    hstem=median(horizontal) if horizontal else None)
        return self.cache[name]

    def svg(self, name):
        pen = SVGPathPen(self.gs)
        self.gs[name].draw(pen)
        return pen.getCommands()


def substitutions(font, tag):
    """Default Latin/DFLT single substitutions, including extension lookups.

    Contextual and language-specific shaping is intentionally left to browsers.
    We only claim references for inspectable, direct substitutions.
    """
    if "GSUB" not in font:
        return {}
    table = font["GSUB"].table
    if not table.FeatureList or not table.LookupList or not table.ScriptList:
        return {}
    indices = set()
    for record in table.ScriptList.ScriptRecord:
        if record.ScriptTag in ("DFLT", "latn") and record.Script.DefaultLangSys:
            lang = record.Script.DefaultLangSys
            indices.update(lang.FeatureIndex)
            if lang.ReqFeatureIndex != 65535:
                indices.add(lang.ReqFeatureIndex)
    result = {}
    for index in sorted(indices):
        record = table.FeatureList.FeatureRecord[index]
        if record.FeatureTag != tag:
            continue
        for li in record.Feature.LookupListIndex:
            lookup = table.LookupList.Lookup[li]
            for sub in lookup.SubTable:
                if lookup.LookupType == 7:
                    sub = sub.ExtSubTable
                mapping = getattr(sub, "mapping", {})
                result = {k: mapping.get(v, v) for k, v in result.items()}
                result.update({k: v for k, v in mapping.items() if k not in result})
    return result


def references(font):
    cmap = font.getBestCmap() or {}
    mapping = substitutions(font, "smcp")
    pairs = {c: mapping[cmap[ord(c.lower())]] for c in string.ascii_uppercase
             if ord(c) in cmap and cmap.get(ord(c.lower())) in mapping}
    if pairs:
        return "smcp", pairs
    pairs = {c: cmap[ord(s)] for c, s in PHONETIC.items() if ord(c) in cmap and ord(s) in cmap}
    return ("phonetic" if pairs else "none"), pairs


def metadata(font):
    axes = {a.axisTag: dict(min=a.minValue, default=a.defaultValue, max=a.maxValue)
            for a in font["fvar"].axes} if "fvar" in font else {}
    kind, refs = references(font)
    return dict(name=font["name"].getDebugName(16) or font["name"].getDebugName(1) or "Uploaded font",
                axes=axes, referenceKind=kind, referenceLetters="".join(refs),
                unitsPerEm=font["head"].unitsPerEm,
                staticWeight=getattr(font.get("OS/2"), "usWeightClass", 400))


def analyze(font: TTFont, options=None):
    options = options or {}
    meta = metadata(font)
    cmap = font.getBestCmap() or {}
    if not all(ord(c) in cmap for c in "xH"):
        raise ValueError("This Latin calibrator needs real x and H glyphs in the font.")
    axes = meta["axes"]
    location = {}
    for tag, axis in axes.items():
        value = float(options.get("axes", {}).get(tag, axis["default"]))
        if not math.isfinite(value):
            raise ValueError("Axis values must be finite.")
        location[tag] = max(axis["min"], min(axis["max"], value))
    base = Outlines(font, location)
    cap_height = base.glyph(cmap[ord("H")])["bounds"][3]
    x_height = base.glyph(cmap[ord("x")])["bounds"][3]
    kind, refs = references(font)
    ref_metrics = {c: base.glyph(n) for c, n in refs.items()}
    flat_heights = [m["bounds"][3] for c, m in ref_metrics.items() if c in FLAT]
    reference_height = median(flat_heights) if flat_heights else None
    requested_target = options.get("target", "reference")
    use_refs = requested_target == "reference" and reference_height is not None
    estimated = not use_refs and requested_target != "xheight"
    # Pilot corpus prior, deliberately exposed as an estimate, not a font metric.
    prior = options.get("prior", {"heightFraction": .2, "width": 1.06})
    target_height = reference_height if use_refs else (
        x_height + prior["heightFraction"]*(cap_height-x_height) if estimated else x_height)
    targets = {c: m for c, m in ref_metrics.items() if c in COMPARABLE} if use_refs else {}
    fallback = not targets
    if fallback:
        targets = {c: base.glyph(cmap[ord(c)]) for c in "HEFLT" if ord(c) in cmap}
    weight_axis = axes.get("wght")
    base_weight = location.get("wght", meta["staticWeight"])
    warnings = []
    if kind == "phonetic":
        warnings.append("Phonetic small capitals are partial design evidence, not a complete typographic small-cap set. Their shapes and spacing may differ.")
    if estimated:
        warnings.append(f"Estimated proportions: x-height plus {prior['heightFraction']:.0%} of the gap to cap height, and {prior['width']:.1%} width. This is a small-corpus prior, not evidence of this font's intended small caps.")
    elif not use_refs:
        warnings.append("X-height is a chosen fallback, not a discovered small-cap height. Width has no reference and is left at 100%.")
    if not weight_axis:
        warnings.append("This is a static font: its stroke weight cannot be compensated with a wght axis.")
    if "GSUB" in font and getattr(font["GSUB"].table, "FeatureVariations", None):
        warnings.append("GSUB feature variations are not evaluated by the reference extractor; verify this instance visually.")

    def evaluate(weight, manual=None):
        loc = dict(location)
        if weight_axis:
            loc["wght"] = weight
        candidate = Outlines(font, loc)
        scale = target_height / candidate.glyph(cmap[ord("H")])["bounds"][3]
        if manual:
            scale = float(manual["scale"])
        metrics = {c: candidate.glyph(cmap[ord(c)]) for c in targets}
        width = median([targets[c]["width"] / (scale*m["width"]) for c, m in metrics.items()]) if not fallback else (prior["width"] if estimated else 1.0)
        if manual:
            width = float(manual["width"])
        errors = {"width": [], "vertical": [], "horizontal": []}
        for c, m in metrics.items():
            t = targets[c]
            if not fallback:
                errors["width"].append(math.log(scale*width*m["width"]/t["width"]))
            if c in "BDEFHLMNPRT" and m["vstem"] and t["vstem"]:
                errors["vertical"].append(math.log(scale*width*m["vstem"]/t["vstem"]))
            if c in "EFHLT" and m["hstem"] and t["hstem"]:
                errors["horizontal"].append(math.log(scale*m["hstem"]/t["hstem"]))
        score = sum(sum(e*e for e in values)/len(values) for values in errors.values() if values)
        return dict(weight=weight, scale=scale, width=width, score=score), candidate, metrics, errors

    manual = options.get("manual")
    if manual:
        weight = float(manual["weight"])
        if weight_axis:
            weight = max(weight_axis["min"], min(weight_axis["max"], weight))
        else:
            weight = base_weight
        if not all(math.isfinite(float(manual[k])) for k in ("scale", "width", "weight")):
            raise ValueError("Calibration values must be finite.")
        if not (.2 <= float(manual["scale"]) <= 1.5 and .4 <= float(manual["width"]) <= 2):
            raise ValueError("Scale or width outside supported limits.")
        fit, candidate, metrics, errors = evaluate(weight, manual)
    elif weight_axis:
        lo, hi = weight_axis["min"], weight_axis["max"]
        best = None
        # Grid search tolerates non-monotonic/avar-mapped axes; refine locally.
        for _ in range(3):
            step = (hi-lo)/12
            trials = [evaluate(lo+i*step) for i in range(13)]
            best = min(trials, key=lambda r: r[0]["score"])
            center = best[0]["weight"]
            lo, hi = max(weight_axis["min"], center-step), min(weight_axis["max"], center+step)
        fit, candidate, metrics, errors = best
        if min(abs(fit["weight"]-weight_axis[k]) for k in ("min", "max")) < .2:
            warnings.append("The fit reached a weight-axis limit; the font may not have enough range to match the target strokes.")
    else:
        fit, candidate, metrics, errors = evaluate(base_weight)
    fit["baseWeight"] = base_weight
    fit["errors"] = {key: 100*math.sqrt(sum(e*e for e in values)/len(values)) if values else None for key, values in errors.items()}
    fit["widthRange"] = [min(targets[c]["width"]/(fit["scale"]*m["width"]) for c, m in metrics.items()),
                         max(targets[c]["width"]/(fit["scale"]*m["width"]) for c, m in metrics.items())] if not fallback else None
    if any(value is not None and value > 10 for value in fit["errors"].values()):
        warnings.append("Some outline measurements differ by more than 10%. A single scale/width/weight cannot reproduce this design closely.")
    letters = list(refs) if refs else [c for c in "HEFLT" if ord(c) in cmap]
    glyphs = []
    for c in letters:
        upper = cmap[ord(c)]
        target = refs[c] if use_refs and c in refs else upper
        m = candidate.glyph(upper)
        t = base.glyph(target)
        glyphs.append(dict(letter=c, reference=PHONETIC.get(c, c) if kind == "phonetic" else c,
                           targetPath=base.svg(target), candidatePath=candidate.svg(upper),
                           target=t, candidate=m, used=c in targets,
                           widthError=100*(fit["scale"]*fit["width"]*m["width"]/t["width"]-1) if use_refs else None,
                           advanceError=100*(fit["scale"]*fit["width"]*m["advance"]/t["advance"]-1) if use_refs else None))
    stroke_ratios = [m["vstem"] / (base.glyph(cmap[ord(c)])["vstem"] * reference_height/cap_height)
                     for c, m in ref_metrics.items() if c in "BDEFHLMNPRT" and reference_height
                     and m["vstem"] and base.glyph(cmap[ord(c)])["vstem"]]
    return dict(**meta, axesLocation=location, fit=fit, glyphs=glyphs, warnings=warnings,
                strokeCompensation=median(stroke_ratios) if stroke_ratios else None,
                target="reference" if use_refs else "estimate" if estimated else "xheight", capHeight=cap_height, xHeight=x_height,
                referenceHeight=reference_height, targetHeight=target_height,
                xHeightScale=x_height/cap_height,
                referenceScale=reference_height/cap_height if reference_height else None,
                missingLetters="".join(c for c in string.ascii_uppercase if ord(c) not in cmap))
