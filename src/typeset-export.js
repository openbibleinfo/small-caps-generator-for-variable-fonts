// Portable recipe exports. Typography is explicit; no font files are embedded.
const num=(value,digits=4)=>String(Number(Number(value).toFixed(digits)));
const typString=value=>JSON.stringify(String(value)).replace(/\\u([0-9a-f]{4})/gi,'\\u{$1}');
const texText=value=>String(value).replace(/[\\{}%$&#_^~]/g,c=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','%':'\\%','$':'\\$','&':'\\&','#':'\\#','_':'\\_','^':'\\textasciicircum{}','~':'\\textasciitilde{}'}[c]));
const axesEntries=axes=>Object.entries(axes).filter(([tag,value])=>/^[A-Za-z0-9]{4}$/.test(tag)&&Number.isFinite(value));
const typAxes=axes=>{const values=axesEntries(axes).map(([tag,value])=>`${typString(tag)}: ${num(value,2)}`);return values.length?`(${values.join(', ')},)`:'(:)';};
const texAxes=axes=>axesEntries(axes).map(([tag,value])=>`${tag}=${num(value,2)}`).join(',');
const tokens=text=>text.split(/([A-Z]{2,})/g).filter(Boolean);
export function exportTypst(recipe) {
  const r=recipe,base=r.sizePx*.75,small=base*r.scale;
  const features=r.builtin?(r.allSmall&&r.nativeC2sc?'(smcp: 0, c2sc: 1)':'(smcp: 1, c2sc: 0)'):'(smcp: 0, c2sc: 0)';
  const casing=r.builtin&&!(r.allSmall&&r.nativeC2sc)?'lower':'upper';
  return `// Typst 0.15 or newer. Install the same font, or use typst compile --font-path ./fonts.
// Font: ${r.font.replace(/[\r\n]/g,' ')}. Use its original TTF/OTF file, not a Google CSS URL.
// ${r.builtin?'Built-in small-caps':r.width!==1?'Horizontal-scaling recipe':'Font-axis recipe'}; one word per smallcap-word call. Spaces stay outside.
// CSS px -> Typst pt: multiply by 0.75. Axis coordinates, including opsz, stay unchanged.
#let sc-font = ${typString(r.font)}
#let sc-size = ${num(base)}pt
#set text(font: sc-font, size: sc-size, weight: ${Math.round(r.baseWeight)}, variations: ${typAxes(r.baseAxes)}, features: (smcp: 0, c2sc: 0), tracking: 0pt)

#let smallcap-word(word) = {
  if word.len() == 0 { return [] }
  let caps = ${r.allSmall?'word':'word.slice(1)'}
  let letters = text(font: sc-font, size: ${num(small)}pt, weight: ${Math.round(r.weight)}, variations: ${typAxes(r.capAxes)}, features: ${features}, tracking: ${num(r.tracking*small)}pt, ${casing}(caps))
  box(${r.allSmall?'':`text(font: sc-font, size: sc-size, weight: ${Math.round(r.baseWeight)}, variations: ${typAxes(r.baseAxes)}, features: (smcp: 0, c2sc: 0), tracking: 0pt, upper(word.slice(0, 1))) + h(${num(r.gap*base)}pt) + `}${r.width===1?'letters':`scale(x: ${num(r.width*100)}%, y: 100%, origin: left + bottom, reflow: true, letters)`})
}

// Example. Use #smallcap-word("Lord") for another word.
${tokens(r.sample).map(token=>/^[A-Z]{2,}$/.test(token)?`#smallcap-word(${typString(token)})`:`#text(${typString(token)})`).join('')}
`;
}
export function exportLatex(recipe) {
  const r=recipe,base=r.sizePx*.75;
  const features=r.builtin?(r.allSmall&&r.nativeC2sc?'-smcp,+c2sc':'+smcp,-c2sc'):'-smcp,-c2sc';
  const casing=r.builtin&&!(r.allSmall&&r.nativeC2sc)?'lowercase':'uppercase';
  const fontOptions=(axes,extra)=>['Renderer=HarfBuzz',...(axesEntries(axes).length?[`RawFeature={axis={${texAxes(axes)}}}`]:[]),...extra].join(',\n  ');
  return String.raw`% Compile with LuaLaTeX (not pdfLaTeX or XeLaTeX), with fontspec and graphicx.
% Install the same font, or replace \SmallCapsFont with a local TTF/OTF filename.
% ${r.builtin?'Built-in small-caps':r.width!==1?'Horizontal-scaling recipe':'Font-axis recipe'}; one Latin word per \smallcapword call. Spaces stay outside.
% CSS px -> bp: multiply by 0.75. Axis coordinates, including opsz, stay unchanged.
\documentclass{article}
\usepackage{fontspec}
\usepackage{graphicx}
\newcommand{\SmallCapsFont}{${texText(r.font)}}
\newfontfamily\SCBase{\SmallCapsFont}[
  ${fontOptions(r.baseAxes,['RawFeature={-smcp,-c2sc}'])}
]
\newfontfamily\SCCaps{\SmallCapsFont}[
  ${fontOptions(r.capAxes,[`Scale=${num(r.scale)}`,`LetterSpace=${num(r.tracking*100)}`,`RawFeature={${features}}`])}
]
\newcommand{\SCSize}{\fontsize{${num(base)}bp}{${num(base*1.2)}bp}\selectfont}

\ExplSyntaxOn
\NewDocumentCommand{\smallcapword}{m}{
  \group_begin:
  \str_set:Nn \l_tmpa_str {#1}
  \SCBase\SCSize
  \mbox{${r.allSmall?'':String.raw`
    {\SCBase\str_uppercase:f {\str_head:N \l_tmpa_str}}
    \kern ${num(r.gap*base)}bp
    `}${r.width===1?'':String.raw`\scalebox{${num(r.width)}}[1]{`}{\SCCaps\str_${casing}:f {${r.allSmall?'\\l_tmpa_str':'\\str_tail:N \\l_tmpa_str'}}}${r.width===1?'':'}'}
  }
  \group_end:
}
\ExplSyntaxOff

\begin{document}
\SCBase\SCSize
${tokens(r.sample).map(token=>/^[A-Z]{2,}$/.test(token)?`\\smallcapword{${token}}`:texText(token)).join('')}
\end{document}
`;
}
