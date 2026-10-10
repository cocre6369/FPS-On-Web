#!/usr/bin/env python3
"""Build the doomgeneric WebAssembly engine and package it for the browser.

Steps:
  1. Compile engine/doomgeneric + engine/web with Zig's clang (WASI target).
  2. Link a WASI reactor module: build/doom.wasm.
  3. Gzip-compress it (lossless) to docs/assets/doom.wasm.gz, and verify the
     round trip.
  4. Write docs/assets/manifest.json with SHA-256 hashes of the uncompressed
     files, which the browser checks at load time.

Toolchain: Zig (pip install ziglang) or a `zig` executable on PATH.
Freedoom data: run scripts/fetch_freedoom.py first.

Usage:  python3 scripts/build.py
"""

import concurrent.futures
import gzip
import hashlib
import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE_DIR = os.path.join(ROOT, "engine", "doomgeneric")
WEB_DIR = os.path.join(ROOT, "engine", "web")
BUILD_DIR = os.path.join(ROOT, "build")
OBJ_DIR = os.path.join(BUILD_DIR, "obj")
ASSETS_DIR = os.path.join(ROOT, "docs", "assets")

FREEDOOM_SHA256 = "7323bcc168c5a45ff10749b339960e98314740a734c30d4b9f3337001f9e703d"

CFLAGS = [
    "-target", "wasm32-wasi",
    "-O2",
    "-w",  # the upstream C code is old; warnings are not actionable here
    "-DDG_WEB_INSTANT_WIPE",  # see engine/web/README.md
    "-DDOOMGENERIC_RESX=640",
    "-DDOOMGENERIC_RESY=400",
    "-I", ENGINE_DIR,
]

LDFLAGS = [
    "-target", "wasm32-wasi",
    "-mexec-model=reactor",
    "-Wl,--initial-memory=33554432",   # 32 MiB
    "-Wl,--max-memory=536870912",      # 512 MiB
    "-Wl,--strip-all",
]


def find_zig() -> list[str]:
    if shutil.which("zig"):
        return ["zig"]
    try:
        import ziglang  # noqa: F401
        return [sys.executable, "-m", "ziglang"]
    except ImportError:
        raise SystemExit(
            "Zig not found. Install it with:  pip install ziglang  "
            "(or put a `zig` binary on PATH)."
        )


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def gzip_file(src: str, dst: str) -> None:
    # mtime=0 and a fixed filename make the output reproducible.
    with open(src, "rb") as fin, open(dst, "wb") as raw_out:
        with gzip.GzipFile(fileobj=raw_out, mode="wb", compresslevel=9, mtime=0,
                           filename=os.path.basename(src)) as gz:
            shutil.copyfileobj(fin, gz)


def main() -> int:
    zig = find_zig()
    os.makedirs(OBJ_DIR, exist_ok=True)

    sources = sorted(
        [os.path.join(ENGINE_DIR, f) for f in os.listdir(ENGINE_DIR) if f.endswith(".c")]
        + [os.path.join(WEB_DIR, "doomgeneric_web.c")]
    )

    def compile_one(src: str) -> str:
        obj = os.path.join(OBJ_DIR, os.path.splitext(os.path.basename(src))[0] + ".o")
        subprocess.run(zig + ["cc", *CFLAGS, "-c", src, "-o", obj], check=True)
        return obj

    print(f"compiling {len(sources)} C files...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=os.cpu_count() or 2) as pool:
        objects = list(pool.map(compile_one, sources))

    wasm_path = os.path.join(BUILD_DIR, "doom.wasm")
    print("linking build/doom.wasm...")
    subprocess.run(zig + ["cc", *LDFLAGS, *sorted(objects), "-o", wasm_path, "-lm"],
                   check=True)

    # Compress (lossless) and verify the round trip.
    wasm_gz = os.path.join(ASSETS_DIR, "doom.wasm.gz")
    gzip_file(wasm_path, wasm_gz)
    with gzip.open(wasm_gz, "rb") as gz:
        restored = gz.read()
    with open(wasm_path, "rb") as f:
        original = f.read()
    if restored != original:
        print("doom.wasm.gz round-trip mismatch", file=sys.stderr)
        return 1

    wad_gz = os.path.join(ASSETS_DIR, "freedoom1.wad.gz")
    if not os.path.exists(wad_gz):
        print("missing docs/assets/freedoom1.wad.gz - run scripts/fetch_freedoom.py",
              file=sys.stderr)
        return 1
    with gzip.open(wad_gz, "rb") as gz:
        wad_digest = hashlib.sha256(gz.read()).hexdigest()
    if wad_digest != FREEDOOM_SHA256:
        print("freedoom1.wad.gz does not decompress to the expected WAD", file=sys.stderr)
        return 1

    manifest = {
        "engine": {
            "file": "doom.wasm.gz",
            "sha256": hashlib.sha256(original).hexdigest(),
            "bytes": len(original),
            "compressed_bytes": os.path.getsize(wasm_gz),
        },
        "iwad": {
            "file": "freedoom1.wad.gz",
            "sha256": FREEDOOM_SHA256,
            "bytes": 28795076,
            "compressed_bytes": os.path.getsize(wad_gz),
        },
    }
    with open(os.path.join(ASSETS_DIR, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    print(f"engine: {len(original)} bytes -> {manifest['engine']['compressed_bytes']} bytes (gzip -9)")
    print(f"iwad:   {manifest['iwad']['bytes']} bytes -> {manifest['iwad']['compressed_bytes']} bytes (gzip -9)")
    print("build complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
