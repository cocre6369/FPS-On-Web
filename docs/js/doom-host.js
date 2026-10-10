// Host-side glue for the doomgeneric WebAssembly build.
//
// This module is environment-neutral: it runs in the browser (docs/js/app.js)
// and in Node (scripts/smoke_test.mjs). It knows nothing about the DOM.

import {
  WASI,
  File,
  OpenFile,
  PreopenDirectory,
  ConsoleStdout,
  WASIProcExit,
} from "../vendor/browser_wasi_shim/index.js";

export const SCREEN_WIDTH = 640;
export const SCREEN_HEIGHT = 400;

// Doom key codes (engine/doomgeneric/doomkeys.h). The engine passes these
// through unchanged (TranslateKey is the identity), so the same numbers are
// used in default.cfg for key bindings.
const DK = {
  RIGHTARROW: 0xae,
  LEFTARROW: 0xac,
  UPARROW: 0xad,
  DOWNARROW: 0xaf,
  STRAFE_L: 0xa0,
  STRAFE_R: 0xa1,
  USE: 0xa2,
  FIRE: 0xa3,
  ESCAPE: 27,
  ENTER: 13,
  TAB: 9,
  BACKSPACE: 0x7f,
  RSHIFT: 0x80 + 0x36,
  RALT: 0x80 + 0x38,
  RCTRL: 0x80 + 0x1d,
};

// Map a KeyboardEvent.code to a Doom key code. Returns null for keys the game
// does not use. Uses the physical key position (KeyboardEvent.code), so the
// layout is the same on every keyboard.
const CODE_TO_DOOM = {
  ArrowLeft: DK.LEFTARROW,
  ArrowRight: DK.RIGHTARROW,
  ArrowUp: DK.UPARROW,
  ArrowDown: DK.DOWNARROW,
  ControlLeft: DK.FIRE,
  ControlRight: DK.FIRE,
  Space: DK.USE,
  ShiftLeft: DK.RSHIFT,
  ShiftRight: DK.RSHIFT,
  AltLeft: DK.RALT,
  AltRight: DK.RALT,
  Enter: DK.ENTER,
  NumpadEnter: DK.ENTER,
  Escape: DK.ESCAPE,
  Tab: DK.TAB,
  Backspace: DK.BACKSPACE,
  Minus: 0x2d,
  Equal: 0x3d,
  Comma: 0x2c,
  Period: 0x2e,
  Slash: 0x2f,
  Semicolon: 0x3b,
  Quote: 0x27,
  BracketLeft: 0x5b,
  BracketRight: 0x5d,
  Backslash: 0x5c,
  Backquote: 0x60,
};

export function doomKeyFromCode(code) {
  if (Object.prototype.hasOwnProperty.call(CODE_TO_DOOM, code)) {
    return CODE_TO_DOOM[code];
  }
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1].toLowerCase().charCodeAt(0);
  m = /^Digit([0-9])$/.exec(code);
  if (m) return "0".charCodeAt(0) + Number(m[1]);
  m = /^F([0-9]{1,2})$/.exec(code);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 10) return 0x80 + 0x3b + (n - 1); // F1..F10
    if (n === 11) return 0x80 + 0x57;
    if (n === 12) return 0x80 + 0x58;
  }
  return null;
}

// Keys whose default browser action (scrolling, focus moves) should be
// suppressed while the game is running.
export function isGameKeyCode(code) {
  return doomKeyFromCode(code) !== null;
}

// Load the engine and its data. wasmBytes and wadBytes are raw (already
// decompressed) bytes. configBytes is an optional default.cfg.
export async function createDoom({
  wasmBytes,
  wadBytes,
  configBytes = null,
  onLog = (line) => console.log(line),
  onError = (line) => console.error(line),
}) {
  const files = new Map();
  files.set("freedoom1.wad", new File(wadBytes, { readonly: true }));
  if (configBytes) {
    files.set("default.cfg", new File(configBytes));
  }

  const fds = [
    new OpenFile(new File(new Uint8Array(0))), // stdin
    ConsoleStdout.lineBuffered(onLog), // stdout
    ConsoleStdout.lineBuffered(onError), // stderr
    new PreopenDirectory("/", files), // the game's "current directory"
  ];

  const wasi = new WASI(["doom"], [], fds);
  const { instance } = await WebAssembly.instantiate(wasmBytes, {
    wasi_snapshot_preview1: wasi.wasiImport,
    env: {
      js_now_ms: () => performance.now(),
    },
  });
  wasi.initialize(instance);

  const ex = instance.exports;
  let exitCode = null;

  // Run an engine call. Returns false if the engine asked to exit.
  function call(fn) {
    if (exitCode !== null) return false;
    try {
      fn();
      return true;
    } catch (err) {
      if (err instanceof WASIProcExit) {
        exitCode = err.code;
        return false;
      }
      throw err;
    }
  }

  return {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,

    get exited() {
      return exitCode !== null;
    },
    get exitCode() {
      return exitCode;
    },

    // Create the engine and run the first frame (title/demo loop).
    init() {
      return call(() => ex.dg_init());
    },

    // Advance one frame. Returns false once the game has exited.
    tick() {
      return call(() => ex.dg_tick());
    },

    // RGBA pixels of the last rendered frame. This is a view into wasm
    // memory: copy or consume it before the next tick.
    frameRGBA() {
      const ptr = ex.dg_frame_ptr();
      const len = SCREEN_WIDTH * SCREEN_HEIGHT * 4;
      return new Uint8ClampedArray(ex.memory.buffer, ptr, len);
    },

    key(pressed, doomKey) {
      ex.dg_key(pressed ? 1 : 0, doomKey);
    },

    mouse(buttons, dx, dy) {
      ex.dg_mouse(buttons | 0, Math.trunc(dx), Math.trunc(dy));
    },
  };
}
