# FPS-On-Web

A classic first-person shooter (Doom-style, **Freedoom Phase 1**) that runs in
a web browser. The engine is the open-source
[doomgeneric](https://github.com/ozkl/doomgeneric) port, compiled to
WebAssembly. Nothing is streamed from a server: the game runs locally in your
browser.

## Play it

**GitHub Pages:** https://cocre6369.github.io/FPS-On-Web/ (once Pages is enabled,
see below). Click **Fullscreen** under the game screen, then **Click to play**.

To enable it: repository **Settings → Pages**, *Deploy from a branch*, branch
`arena/53682d05-fps-on-web` (or `main` after merging), folder `/docs`.

Or run it locally: `cd docs && python3 -m http.server 8000`, then open
http://localhost:8000.

```sh
cd docs && python3 -m http.server 8000   # then open http://localhost:8000
```

## What's in the repo

| Path | Contents |
| --- | --- |
| `docs/` | The static website. `index.html`, `js/app.js` (UI), `js/doom-host.js` (engine host). |
| `docs/assets/` | `doom.wasm.gz` (engine), `freedoom1.wad.gz` (game data), `default.cfg` (WASD controls), `manifest.json` (SHA-256 of the uncompressed files). |
| `engine/doomgeneric/` | Upstream doomgeneric C source (GPL-2.0), with one guarded change for instant level transitions. |
| `engine/web/` | Browser platform layer (`doomgeneric_web.c`) and notes. |
| `scripts/fetch_freedoom.py` | Downloads Freedoom and stores it compressed. |
| `scripts/build.py` | Compiles the engine to WebAssembly and compresses it. |
| `scripts/smoke_test.mjs` | Headless test: runs the engine under Node and writes PNG screenshots. |
| `LICENSES/`, `THIRD_PARTY_NOTICES.md` | Licenses for all bundled components. |

## About "decompiling" and the data files

The original Doom, Quake and Wolfenstein games are not open source, and their
data files (`DOOM.WAD`, `pak0.pak`, ...) are commercial. This project avoids
both problems:

- **No decompilation was needed.** The engine is open-source C, so the game
  is built from source instead of being reverse-engineered from a binary.
- **Freedoom replaces the commercial data.** Freedoom is a free, open-source
  set of levels, sprites, sounds and music, made to be compatible with the
  Doom engine. Its license is BSD-3-Clause.

## Compression and quality

Compression is lossless, and every file is checked on load:

| File | Original | Shipped (gzip -9) |
| --- | --- | --- |
| `freedoom1.wad` (game data) | 28,795,076 bytes | 10,225,706 bytes |
| Engine (`doom.wasm`) | 440,491 bytes | 165,865 bytes |

The browser decompresses each file with the built-in `DecompressionStream`,
then checks its SHA-256 against `docs/assets/manifest.json`. If the data
doesn't match, the game refuses to start. This makes "without losing quality"
checkable: the game data is byte-identical to the original.

## Building from source

```sh
pip install ziglang                   # WebAssembly toolchain (clang + wasi-libc)
python3 scripts/fetch_freedoom.py     # only needed once; the .gz is already in the repo
python3 scripts/build.py              # rebuilds build/doom.wasm and docs/assets/doom.wasm.gz
node scripts/smoke_test.mjs 10        # optional: headless run, writes build/smoke/*.png
```

See `engine/web/README.md` for how the platform layer and the engine patch fit together.

## Controls

- **W A S D** move, **← →** turn. These come from `docs/assets/default.cfg`.
- **Mouse**: look around. Click the game to capture the mouse.
- **Left click** or **Ctrl** fire. **Space** or **E** use / open doors.
- **Shift** run, **Alt** strafe, **1–7** weapons.
- **Esc**: menu. Browsers release the mouse on the first Esc, so press Esc
  again to open the menu. **Tab**: automap.

## Known limitations

- **No sound or music yet.** The engine's audio module is not connected to
  Web Audio. Sound effects are the obvious next step.
- **Saves are in memory only.** Save games live in the browser's memory and
  are lost on reload.
- The screen-melt wipe between levels is skipped (see `engine/web/README.md`).
- Freedoom Phase 1 only. Freedoom Phase 2 (`freedoom2.wad`, the Doom II
  replacement) ships in the same ViZDoom wheel that `fetch_freedoom.py` uses,
  so it could be added the same way.

## Credits and licenses

- Engine: [doomgeneric](https://github.com/ozkl/doomgeneric) by ozkl, built on
  id Software's DOOM source (GPL-2.0).
- Game data: [Freedoom](https://freedoom.github.io/) (BSD-3-Clause).
- WASI shim: [browser_wasi_shim](https://github.com/bjorn3/browser_wasi_shim)
  (MIT OR Apache-2.0).

See `THIRD_PARTY_NOTICES.md` for details.
