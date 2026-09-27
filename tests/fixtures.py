"""Generate local-only test fixtures from the bundled OFL Source Sans 3 font."""
from pathlib import Path
import tempfile
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = Path(__file__).resolve().parents[1]
temporary = Path(tempfile.gettempdir())
font = TTFont(root / "fonts/SourceSans3.ttf")
options = subset.Options()
options.layout_features = []
options.name_IDs = ["*"]
options.name_legacy = True
options.name_languages = ["*"]
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=range(32, 127))
subsetter.subset(font)
static = instantiateVariableFont(font, {"wght": 500})
static.save(temporary / "smallcaps-static.ttf")
font.flavor = "woff2"
font.save(temporary / "smallcaps-subset.woff2")
for record in font["name"].names:
    if record.nameID in (1, 16):
        record.string = "No Small Caps Test".encode(record.getEncoding())
font.save(temporary / "smallcaps-no-reference.woff2")
font = TTFont(root / "fonts/SourceSans3.ttf")
font.flavor = "woff"
font.save(temporary / "smallcaps-test.woff")
print(f"Generated static, stripped WOFF2, and full WOFF fixtures in {temporary}")

# A color-layer fixture reproduces Cairo Play's Fontkit recursion without a
# network dependency: COLR refers to the same glyph's underlying glyf outline.
from fontTools.colorLib.builder import buildCOLR, buildCPAL
font = TTFont(root / "fonts/SourceSans3.ttf")
font['COLR'] = buildCOLR({'H': [('H', 0)]}, version=0, glyphMap=font.getReverseGlyphMap())
font['CPAL'] = buildCPAL([[(0.2, 0.5, 0.3, 1.0)]])
font.save(temporary / 'smallcaps-color.ttf')

# Deterministic original outlines with real weight, width and optical variation.
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.designspaceLib import DesignSpaceDocument, AxisDescriptor, SourceDescriptor
from fontTools.varLib import build
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
with tempfile.TemporaryDirectory() as masters:
    ds = DesignSpaceDocument()
    for tag, name, lo, hi in [('wght', 'Weight', 400, 900), ('wdth', 'Width', 75, 125), ('opsz', 'Optical', 12, 72)]:
        axis = AxisDescriptor(); axis.tag = tag; axis.name = name
        axis.minimum = axis.default = lo; axis.maximum = hi; ds.addAxis(axis)
    chars = ''.join(chr(c) for c in range(32, 127))
    cmap = {ord(c): ('space' if c == ' ' else f'uni{ord(c):04X}') for c in chars}
    order = ['.notdef'] + list(cmap.values()) + [f'sc{c}' for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
    for index, (weight, width, optical) in enumerate([(400,75,12),(900,75,12),(400,125,12),(400,75,72)]):
        fb = FontBuilder(1000, isTTF=True); fb.setupGlyphOrder(order); fb.setupCharacterMap(cmap)
        glyphs, metrics = {}, {}
        for i, name in enumerate(order):
            pen = TTGlyphPen(None)
            w = (470 + i % 5 * 20) * width / 100
            h = 500 if name.startswith('sc') or name in [cmap[ord(c)] for c in 'abcdefghijklmnopqrstuvwxyz'] else 700
            if name.startswith('sc'): w *= .8
            stem = 45 + (weight-400)*.08 + (optical-12)*.1
            if name != 'space':
                pen.moveTo((40,0));pen.lineTo((40,h));pen.lineTo((w,h));pen.lineTo((w,0));pen.closePath()
                pen.moveTo((40+stem,stem));pen.lineTo((w-stem,stem));pen.lineTo((w-stem,h-stem));pen.lineTo((40+stem,h-stem));pen.closePath()
            glyphs[name]=pen.glyph();metrics[name]=(round(w+60),40)
        fb.setupGlyf(glyphs);fb.setupHorizontalMetrics(metrics)
        fb.setupHorizontalHeader(ascent=800,descent=-200)
        fb.setupNameTable({'familyName':'Control Matrix','styleName':'Regular','uniqueFontIdentifier':f'ControlMatrix{index}','fullName':'Control Matrix','psName':'ControlMatrix'})
        fb.setupOS2(sTypoAscender=800,sTypoDescender=-200,usWinAscent=800,usWinDescent=200)
        fb.setupPost();fb.setupMaxp()
        feature='feature smcp { '+ ' '.join(f'sub {cmap[ord(c.lower())]} by sc{c};' for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')+' } smcp;'
        addOpenTypeFeaturesFromString(fb.font, feature)
        filename=str(Path(masters)/f'{index}.ttf');fb.save(filename)
        source=SourceDescriptor();source.path=filename;source.name=f'master{index}'
        source.location={'Weight':weight,'Width':width,'Optical':optical}
        if index==0: source.copyInfo=source.copyLib=source.copyFeatures=True
        ds.addSource(source)
    variable, _, _ = build(ds)
    variable.save(temporary / 'smallcaps-control-matrix.ttf')
print('Generated color and three-axis control fixtures')
