# Third-party components

| Component | Where | License |
| --- | --- | --- |
| doomgeneric (engine, from `ozkl/doomgeneric`, commit `dcb7a8d`) | `engine/doomgeneric/` | GPL-2.0-or-later, see `engine/doomgeneric/LICENSE` |
| Freedoom Phase 1 game data (`freedoom1.wad`) | `docs/assets/freedoom1.wad.gz` | BSD-3-Clause, see `LICENSES/FREEDOOM-COPYING.txt` and `LICENSES/FREEDOOM-CREDITS.txt` |
| @bjorn3/browser_wasi_shim 0.4.2 (WASI in the browser) | `docs/vendor/browser_wasi_shim/` | MIT OR Apache-2.0, see `LICENSES/` |

No id Software data files (DOOM.WAD, DOOM2.WAD, etc.) are used. Freedoom is a
free replacement for them.

The Freedoom WAD is taken unmodified from the ViZDoom 1.3.1 wheel on PyPI,
which ships Freedoom. Its SHA-256 is checked by `scripts/fetch_freedoom.py`.
