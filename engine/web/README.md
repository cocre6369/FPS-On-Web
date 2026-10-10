# Web platform layer for doomgeneric

`doomgeneric_web.c` is the only file that is specific to the browser. It
implements the platform hooks that doomgeneric expects (`DG_Init`,
`DG_DrawFrame`, `DG_GetKey`, `DG_GetTicksMs`, `DG_SleepMs`,
`DG_SetWindowTitle`) and exports a small C API to JavaScript:

| export | purpose |
| --- | --- |
| `dg_init()` | start the engine with `-iwad /freedoom1.wad` |
| `dg_tick()` | run one frame (call from `requestAnimationFrame`) |
| `dg_frame_ptr()` / `dg_frame_width()` / `dg_frame_height()` | RGBA frame buffer |
| `dg_key(pressed, doomKey)` | keyboard input (Doom key codes) |
| `dg_mouse(buttons, dx, dy)` | mouse input |

It imports `js_now_ms()` (performance.now) from JavaScript.

## Local change to the engine

`engine/doomgeneric/d_main.c` has one guarded change, `DG_WEB_INSTANT_WIPE`.
The original screen-melt transition is a blocking loop that would freeze the
browser tab for about a second per level change. The build defines this flag,
so transitions switch instantly. Remove the flag to get the original melt
effect (it will block the page while it plays).

Everything else in `engine/doomgeneric/` is the upstream source, unmodified,
from `ozkl/doomgeneric` at commit `dcb7a8dbc7a16ce3dda29382ac9aae9d77d21284`
(GPL-2.0, see `engine/doomgeneric/LICENSE`). Only the portable core is
vendored: the other platform ports (SDL, Xlib, Allegro, Win32, ...) and their
project files are left out.

## Build

```sh
pip install ziglang          # the WebAssembly toolchain (clang + wasi-libc)
python3 scripts/fetch_freedoom.py   # once: writes docs/assets/freedoom1.wad.gz
python3 scripts/build.py     # writes build/doom.wasm and docs/assets/doom.wasm.gz
```
