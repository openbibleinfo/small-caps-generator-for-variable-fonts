"""Optional research-only downloader. The HTML never runs or needs this script."""
import argparse
import json
from pathlib import Path
from urllib.request import urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--refresh", action="store_true", help="Replace existing research fonts with current upstream versions")
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent / "fonts"
for source in json.loads((root / "sources.json").read_text()):
    for filename, url in ((source["file"], source["url"]), (source["license"], source["licenseUrl"])):
        destination = root / filename
        if destination.exists() and not args.refresh:
            continue
        with urlopen(url, timeout=60) as response:
            data = response.read()
        destination.write_bytes(data)
        print(f"Downloaded {filename}")
print("Done. After updating fonts, regenerate profiles and rebuild the HTML.")
