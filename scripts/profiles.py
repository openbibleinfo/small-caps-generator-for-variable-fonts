"""Build portable measurements from full font files, and match safe subsets.

python3 scripts/profiles.py fonts/*.ttf fonts/*.woff2 --output research/profiles.json
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
from statistics import median
import string

from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from calibrate import analyze, metadata


def signature(font):
    """Conservative subset match; includes Latin outlines, advances, axis mapping.

    Names alone are never used to match a family. Test default plus each axis
    extreme independently. This detects common version/subset mismatches, not
    all possible differences in a multi-axis font's interpolation interior.
    """
    meta = metadata(font)
    cmap = font.getBestCmap() or {}
    letters = string.ascii_letters
    if any(ord(c) not in cmap for c in letters):
        return None
    defaults = {tag: a["default"] for tag, a in meta["axes"].items()}
    locations = [defaults]
    for tag, axis in meta["axes"].items():
        for bound in ("min", "max"):
            locations.append(dict(defaults, **{tag: axis[bound]}))
    data = dict(name=meta["name"], version=font["name"].getDebugName(5),
                upem=meta["unitsPerEm"], axes=meta["axes"],
                avar=font["avar"].segments if "avar" in font else {}, outlines=[])
    for location in locations:
        gs = font.getGlyphSet(location=location)
        for c in letters:
            glyph = gs[cmap[ord(c)]]
            pen = DecomposingRecordingPen(gs)
            glyph.draw(pen)
            data["outlines"].append([c, glyph.width, pen.value])
    return sha256(json.dumps(data, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def key(location, target):
    return json.dumps([location, target], sort_keys=True, separators=(",", ":"))


def build(paths, weights):
    catalog = {"schema": 1, "method": "outline-fit-v1", "fonts": []}
    prior_rows = []
    for path in paths:
        path = Path(path)
        with TTFont(path) as font:
            meta = metadata(font)
            entry = dict(path=str(path), sha256=sha256(path.read_bytes()).hexdigest(),
                         signature=signature(font), **meta, instances={})
            defaults = {k: v["default"] for k, v in meta["axes"].items()}
            locations = []
            optical = sorted(set([meta["axes"]["opsz"][k] for k in ("min", "default", "max")])) if "opsz" in meta["axes"] else [None]
            for weight in weights if "wght" in meta["axes"] else [meta["staticWeight"]]:
                for opsz in optical:
                    loc = dict(defaults)
                    if "wght" in loc:
                        a = meta["axes"]["wght"]
                        loc["wght"] = float(max(a["min"], min(a["max"], weight)))
                    if opsz is not None:
                        loc["opsz"] = opsz
                    if loc not in locations:
                        locations.append(loc)
            for loc in locations:
                r = analyze(font, {"axes": loc})
                entry["instances"][key(loc, r["target"])] = dict(axes=loc, target=r["target"], fit=r["fit"],
                    xHeightScale=r["xHeightScale"], referenceScale=r["referenceScale"],
                    xHeight=r["xHeight"], capHeight=r["capHeight"], referenceHeight=r["referenceHeight"],
                    strokeCompensation=r["strokeCompensation"])
                if r["referenceHeight"] and loc.get("wght", 500) == 500 and loc.get("opsz") == defaults.get("opsz"):
                    prior_rows.append(dict(name=meta["name"], x=r["xHeightScale"], reference=r["referenceScale"],
                        heightFraction=(r["referenceHeight"]-r["xHeight"])/(r["capHeight"]-r["xHeight"]), width=r["fit"]["width"]))
            catalog["fonts"].append(entry)
            print(f"{meta['name']}: {len(entry['instances'])} instances", flush=True)
    if prior_rows:
        catalog["prior"] = dict(heightFraction=median(r["heightFraction"] for r in prior_rows),
                                width=median(r["width"] for r in prior_rows), families=len(prior_rows))
        # Leave-one-family-out, geometry only: how well does the pilot prior
        # predict the known target proportions of a family it did not see?
        for row in prior_rows:
            others = [r for r in prior_rows if r is not row]
            if others:
                predicted = row["x"] + median(r["heightFraction"] for r in others)*(1-row["x"])
                row["heldOutHeightErrorPercent"] = 100*(predicted/row["reference"]-1)
                row["heldOutWidthErrorPercent"] = 100*(median(r["width"] for r in others)/row["width"]-1)
        catalog["priorValidation"] = prior_rows
    return catalog


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fonts", nargs="+")
    parser.add_argument("--weights", nargs="+", type=float, default=[400, 500, 700])
    parser.add_argument("--output", default="research/profiles.json")
    args = parser.parse_args()
    Path(args.output).write_text(json.dumps(build(args.fonts, args.weights), indent=2) + "\n")
