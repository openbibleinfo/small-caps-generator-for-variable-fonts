# Google Fonts top-50 small-cap audit

Retrieved 2026-09-19. Source: [Google public metadata](https://fonts.google.com/metadata/fonts), sorted by popularity ascending with an alphabetical tie-break. This is a popularity proxy, not raw usage counts. Full repository tree: `f2bd09badbc763d8757951d52deec29da27e85fb`.

## Results

- 13/50 families have verified Latin a–z smcp substitutions in the checked full font.
- 40/50 checked files have a wght axis.
- 12 verified smcp families have a wght axis.
- 3 verified smcp families have both wght and wdth.
- Barlow is the sole static smcp-positive file in this sample.

## Method and limits

Read current full binaries from google/fonts, choosing the upright face nearest regular weight from each family’s METADATA.pb. Check GSUB smcp mappings and then verify actual single-letter Latin shaping with Fontkit; all positives cover all 26 lowercase letters. The JSON records source URLs, SHA-256 hashes, axes and verified letters. No download failures occurred.

This measures readily available full files, not the CSS API’s delivered subsets. A negative does not prove no historical or upstream release has small caps. Separate SC families and historical partial Inter support are not counted. No quality or authorship judgment about the small-cap designs is implied, and availability alone is not calibration validation. Families are not independent designs: for example several Roboto variants occur here. The checked subset contains CJK-primary families; the test is for their Latin small caps, not a small-cap concept for uncased scripts.

## Full results

| Position | Family | Popularity field | wght axis | wdth range (default) | Verified Latin smcp |
|---|---|---:|---|---|---|
| 1 | [Roboto](https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf) | 2 | Yes | 75–100 (100) | 26/26 |
| 2 | [Open Sans](https://raw.githubusercontent.com/google/fonts/main/ofl/opensans/OpenSans%5Bwdth%2Cwght%5D.ttf) | 3 | Yes | 75–100 (100) | Not found |
| 3 | [Google Sans](https://raw.githubusercontent.com/google/fonts/main/ofl/googlesans/GoogleSans%5BGRAD%2Copsz%2Cwght%5D.ttf) | 4 | Yes | — | 26/26 |
| 4 | [Inter](https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf) | 5 | Yes | — | Not found |
| 5 | [Montserrat](https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf) | 6 | Yes | — | 26/26 |
| 6 | [Poppins](https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Regular.ttf) | 7 | No | — | Not found |
| 7 | [Lato](https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Regular.ttf) | 9 | No | — | Not found |
| 8 | [Arimo](https://raw.githubusercontent.com/google/fonts/main/ofl/arimo/Arimo%5Bwght%5D.ttf) | 10 | Yes | — | Not found |
| 9 | [Noto Sans JP](https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf) | 10 | Yes | — | Not found |
| 10 | [Roboto Condensed](https://raw.githubusercontent.com/google/fonts/main/ofl/robotocondensed/RobotoCondensed%5Bwght%5D.ttf) | 11 | Yes | — | 26/26 |
| 11 | [Roboto Mono](https://raw.githubusercontent.com/google/fonts/main/ofl/robotomono/RobotoMono%5Bwght%5D.ttf) | 14 | Yes | — | 26/26 |
| 12 | [Noto Sans](https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf) | 15 | Yes | 62.5–100 (100) | 26/26 |
| 13 | [DM Sans](https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/DMSans%5Bopsz%2Cwght%5D.ttf) | 16 | Yes | — | Not found |
| 14 | [Raleway](https://raw.githubusercontent.com/google/fonts/main/ofl/raleway/Raleway%5Bwght%5D.ttf) | 18 | Yes | — | 26/26 |
| 15 | [Nunito](https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/Nunito%5Bwght%5D.ttf) | 19 | Yes | — | Not found |
| 16 | [Oswald](https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/Oswald%5Bwght%5D.ttf) | 19 | Yes | — | Not found |
| 17 | [Roboto Slab](https://raw.githubusercontent.com/google/fonts/main/apache/robotoslab/RobotoSlab%5Bwght%5D.ttf) | 21 | Yes | — | 26/26 |
| 18 | [Rubik](https://raw.githubusercontent.com/google/fonts/main/ofl/rubik/Rubik%5Bwght%5D.ttf) | 22 | Yes | — | Not found |
| 19 | [Manrope](https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/Manrope%5Bwght%5D.ttf) | 24 | Yes | — | Not found |
| 20 | [Merriweather](https://raw.githubusercontent.com/google/fonts/main/ofl/merriweather/Merriweather%5Bopsz%2Cwdth%2Cwght%5D.ttf) | 25 | Yes | 87–112 (100) | 26/26 |
| 21 | [Playfair Display](https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf) | 25 | Yes | — | 26/26 |
| 22 | [Kanit](https://raw.githubusercontent.com/google/fonts/main/ofl/kanit/Kanit-Regular.ttf) | 26 | No | — | Not found |
| 23 | [Nunito Sans](https://raw.githubusercontent.com/google/fonts/main/ofl/nunitosans/NunitoSans%5BYTLC%2Copsz%2Cwdth%2Cwght%5D.ttf) | 26 | Yes | 75–125 (100) | Not found |
| 24 | [Work Sans](https://raw.githubusercontent.com/google/fonts/main/ofl/worksans/WorkSans%5Bwght%5D.ttf) | 27 | Yes | — | 26/26 |
| 25 | [Quicksand](https://raw.githubusercontent.com/google/fonts/main/ofl/quicksand/Quicksand%5Bwght%5D.ttf) | 28 | Yes | — | Not found |
| 26 | [Plus Jakarta Sans](https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/PlusJakartaSans%5Bwght%5D.ttf) | 29 | Yes | — | Not found |
| 27 | [PT Sans](https://raw.githubusercontent.com/google/fonts/main/ofl/ptsans/PT_Sans-Web-Regular.ttf) | 30 | No | — | Not found |
| 28 | [Noto Sans TC](https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf) | 31 | Yes | — | Not found |
| 29 | [Source Sans 3](https://raw.githubusercontent.com/google/fonts/main/ofl/sourcesans3/SourceSans3%5Bwght%5D.ttf) | 32 | Yes | — | 26/26 |
| 30 | [Ubuntu](https://raw.githubusercontent.com/google/fonts/main/ufl/ubuntu/Ubuntu-Regular.ttf) | 32 | No | — | Not found |
| 31 | [Mulish](https://raw.githubusercontent.com/google/fonts/main/ofl/mulish/Mulish%5Bwght%5D.ttf) | 33 | Yes | — | Not found |
| 32 | [Outfit](https://raw.githubusercontent.com/google/fonts/main/ofl/outfit/Outfit%5Bwght%5D.ttf) | 33 | Yes | — | Not found |
| 33 | [Archivo Black](https://raw.githubusercontent.com/google/fonts/main/ofl/archivoblack/ArchivoBlack-Regular.ttf) | 34 | No | — | Not found |
| 34 | [Barlow](https://raw.githubusercontent.com/google/fonts/main/ofl/barlow/Barlow-Regular.ttf) | 34 | No | — | 26/26 |
| 35 | [Archivo](https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf) | 35 | Yes | 62–125 (100) | Not found |
| 36 | [Bricolage Grotesque](https://raw.githubusercontent.com/google/fonts/main/ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf) | 36 | Yes | 75–100 (100) | Not found |
| 37 | [JetBrains Mono](https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf) | 37 | Yes | — | Not found |
| 38 | [Noto Sans KR](https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf) | 37 | Yes | — | Not found |
| 39 | [IBM Plex Sans](https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsans/IBMPlexSans%5Bwdth%2Cwght%5D.ttf) | 38 | Yes | 75–100 (100) | Not found |
| 40 | [Jost](https://raw.githubusercontent.com/google/fonts/main/ofl/jost/Jost%5Bwght%5D.ttf) | 39 | Yes | — | Not found |
| 41 | [Lora](https://raw.githubusercontent.com/google/fonts/main/ofl/lora/Lora%5Bwght%5D.ttf) | 39 | Yes | — | Not found |
| 42 | [Saira](https://raw.githubusercontent.com/google/fonts/main/ofl/saira/Saira%5Bwdth%2Cwght%5D.ttf) | 40 | Yes | 50–125 (100) | Not found |
| 43 | [Inconsolata](https://raw.githubusercontent.com/google/fonts/main/ofl/inconsolata/Inconsolata%5Bwdth%2Cwght%5D.ttf) | 41 | Yes | 50–200 (100) | Not found |
| 44 | [Bebas Neue](https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf) | 42 | No | — | Not found |
| 45 | [Black Ops One](https://raw.githubusercontent.com/google/fonts/main/ofl/blackopsone/BlackOpsOne-Regular.ttf) | 42 | No | — | Not found |
| 46 | [Figtree](https://raw.githubusercontent.com/google/fonts/main/ofl/figtree/Figtree%5Bwght%5D.ttf) | 43 | Yes | — | Not found |
| 47 | [Karla](https://raw.githubusercontent.com/google/fonts/main/ofl/karla/Karla%5Bwght%5D.ttf) | 43 | Yes | — | Not found |
| 48 | [Libre Baskerville](https://raw.githubusercontent.com/google/fonts/main/ofl/librebaskerville/LibreBaskerville%5Bwght%5D.ttf) | 45 | Yes | — | Not found |
| 49 | [Share Tech](https://raw.githubusercontent.com/google/fonts/main/ofl/sharetech/ShareTech-Regular.ttf) | 46 | No | — | Not found |
| 50 | [Space Grotesk](https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf) | 47 | Yes | — | Not found |

Roboto and Noto Sans have wdth axes ending at the default 100; Merriweather’s range extends past its default. A wdth axis is not a guarantee that the CSS-only solver can reach its target. Retain and report fit residuals and boundary hits.
