#!/usr/bin/env python3
"""Fetch Freedoom Phase 1 (freedoom1.wad) and store it losslessly compressed.

Freedoom is a free, open-source replacement for id Software's commercial
DOOM data files. This script does NOT use any id Software data.

The WAD is taken from the ViZDoom 1.3.1 PyPI wheel, which ships Freedoom
unmodified. The result is checked against a known SHA-256 before anything is
written, then gzip-compressed (lossless) into docs/assets/freedoom1.wad.gz.

Usage:  python3 scripts/fetch_freedoom.py
"""

import gzip
import hashlib
import io
import json
import os
import sys
import urllib.request
import zipfile

VIZDOOM_VERSION = "1.3.1"
WHEEL_NAME = "vizdoom-1.3.1-cp311-cp311-win_amd64.whl"
WAD_IN_WHEEL = "vizdoom/freedoom1.wad"
EXPECTED_SHA256 = "7323bcc168c5a45ff10749b339960e98314740a734c30d4b9f3337001f9e703d"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "docs", "assets")
OUT_FILE = os.path.join(OUT_DIR, "freedoom1.wad.gz")


def find_wheel_url() -> str:
    with urllib.request.urlopen(
        f"https://pypi.org/pypi/vizdoom/{VIZDOOM_VERSION}/json", timeout=60
    ) as resp:
        meta = json.load(resp)
    for file_info in meta["urls"]:
        if file_info["filename"] == WHEEL_NAME:
            return file_info["url"]
    raise SystemExit(f"wheel {WHEEL_NAME} not found on PyPI")


def main() -> int:
    url = find_wheel_url()
    print(f"downloading {url}")
    with urllib.request.urlopen(url, timeout=600) as resp:
        wheel_bytes = resp.read()

    with zipfile.ZipFile(io.BytesIO(wheel_bytes)) as zf:
        wad = zf.read(WAD_IN_WHEEL)

    digest = hashlib.sha256(wad).hexdigest()
    if digest != EXPECTED_SHA256:
        print(f"SHA-256 mismatch for {WAD_IN_WHEEL}: {digest}", file=sys.stderr)
        return 1
    print(f"verified freedoom1.wad: {len(wad)} bytes, sha256 {digest}")

    os.makedirs(OUT_DIR, exist_ok=True)
    # mtime=0 keeps the output byte-for-byte reproducible.
    with open(OUT_FILE, "wb") as raw_out:
        with gzip.GzipFile(fileobj=raw_out, mode="wb", compresslevel=9, mtime=0,
                           filename="freedoom1.wad") as gz:
            gz.write(wad)

    # Round-trip check: decompressing must give back the exact same bytes.
    with gzip.open(OUT_FILE, "rb") as gz:
        restored = gz.read()
    if hashlib.sha256(restored).hexdigest() != EXPECTED_SHA256:
        print("round-trip check failed", file=sys.stderr)
        return 1

    print(f"wrote {os.path.relpath(OUT_FILE, ROOT)}: "
          f"{os.path.getsize(OUT_FILE)} bytes (from {len(wad)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
