// Headless smoke test: runs the real WebAssembly engine under Node, feeds it
// key presses, and writes PNG screenshots of the rendered frames.
//
//   node scripts/smoke_test.mjs [seconds] [outDir]
//
// Requires build/doom.wasm (run `python3 scripts/build.py` first).

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { createDoom, doomKeyFromCode, SCREEN_WIDTH, SCREEN_HEIGHT } from "../docs/js/doom-host.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seconds = Number(process.argv[2] ?? 12);
const outDir = path.resolve(process.argv[3] ?? path.join(ROOT, "build", "smoke"));
fs.mkdirSync(outDir, { recursive: true });

// Minimal RGBA -> PNG encoder (no dependencies).
function encodePNG(rgba, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4)
      .copy(raw, y * (width * 4 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const gunzip = (p) => zlib.gunzipSync(fs.readFileSync(p));
const wasmBytes = fs.readFileSync(path.join(ROOT, "build", "doom.wasm"));
const wadBytes = gunzip(path.join(ROOT, "docs", "assets", "freedoom1.wad.gz"));
const configBytes = fs.readFileSync(path.join(ROOT, "docs", "assets", "default.cfg"));

const game = await createDoom({
  wasmBytes,
  wadBytes,
  configBytes,
  onLog: (l) => console.log("[doom]", l),
  onError: (l) => console.error("[doom:err]", l),
});

const t0 = performance.now();
if (!game.init()) throw new Error("engine exited during init");

// Key script: [time in seconds, key code, pressed?]. Enter walks the menus.
const script = JSON.parse(process.env.KEYS ?? "[]");
const pressKey = (code) => {
  const k = doomKeyFromCode(code);
  game.key(1, k);
  game.key(0, k);
};
for (const [t, code] of script) setTimeout(() => pressKey(code), t * 1000);

let shot = 0;
let nextShot = 0.5;
while ((performance.now() - t0) / 1000 < seconds) {
  if (!game.tick()) break;
  const now = (performance.now() - t0) / 1000;
  if (now >= nextShot) {
    const frame = game.frameRGBA();
    fs.writeFileSync(path.join(outDir, `frame_${String(shot).padStart(2, "0")}.png`),
      encodePNG(frame, SCREEN_WIDTH, SCREEN_HEIGHT));
    shot++;
    nextShot += Math.max(0.5, seconds / 8);
  }
  // Give timers (the scripted key presses) a chance to run, like rAF would.
  await new Promise((r) => setTimeout(r, 16));
}
console.log(`done: ${shot} screenshots in ${outDir}, exited=${game.exited}`);
