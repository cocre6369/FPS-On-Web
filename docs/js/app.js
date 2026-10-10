// Browser entry point: loads the engine and assets, wires up keyboard and
// mouse, and drives the animation-frame loop.

import {
  createDoom,
  doomKeyFromCode,
  isGameKeyCode,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
} from "./doom-host.js";

const $ = (id) => document.getElementById(id);
const canvas = $("screen");
const ctx = canvas.getContext("2d");
const statusEl = $("status");
const overlay = $("overlay");
const playBtn = $("play");
const fullscreenBtn = $("fullscreen");
const engineInfo = $("engine-info");

canvas.width = SCREEN_WIDTH;
canvas.height = SCREEN_HEIGHT;

let game = null;
let running = false;
let mouseButtons = 0;
let pendingDx = 0;
let pendingDy = 0;
const heldKeys = new Set(); // KeyboardEvent.code values currently pressed

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

async function fetchGunzipped(url) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "This browser cannot decompress gzip files (DecompressionStream is missing). " +
        "Please use a current Chrome, Edge, Firefox or Safari."
    );
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download ${url} (HTTP ${res.status})`);
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download ${url} (HTTP ${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

// Check the decompressed bytes against the SHA-256 recorded at build time.
// This proves the compressed files restore exactly the original data.
async function verifySha256(bytes, expected, label) {
  if (!crypto.subtle) {
    console.warn(`SHA-256 check skipped for ${label}: needs a secure context (https or localhost).`);
    return;
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== expected) {
    throw new Error(`${label} failed its integrity check (sha256 ${hex}).`);
  }
}

function sendMouseButtons() {
  if (game && running) game.mouse(mouseButtons, 0, 0);
}

function frame() {
  if (!running) return;

  if (pendingDx !== 0 || pendingDy !== 0) {
    game.mouse(mouseButtons, pendingDx, pendingDy);
    pendingDx = 0;
    pendingDy = 0;
  }

  let alive;
  try {
    alive = game.tick();
  } catch (err) {
    console.error(err);
    stop(`The engine crashed: ${err.message}`, true);
    return;
  }
  if (!alive) {
    stop(`The game exited (code ${game.exitCode}). Reload the page to play again.`, false);
    return;
  }

  const rgba = game.frameRGBA();
  ctx.putImageData(new ImageData(rgba, SCREEN_WIDTH, SCREEN_HEIGHT), 0, 0);
  requestAnimationFrame(frame);
}

function stop(message, isError) {
  running = false;
  heldKeys.clear();
  setStatus(message, isError);
  playBtn.hidden = true;
  overlay.classList.remove("hidden");
}

function captureMouse() {
  if (!running) return;
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock?.();
  }
}

function onPointerLockChange() {
  const locked = document.pointerLockElement === canvas;
  mouseButtons = 0;
  if (locked) {
    overlay.classList.add("hidden");
  } else if (running) {
    overlay.classList.remove("hidden");
    setStatus("Mouse released. Click to resume playing.");
    playBtn.textContent = "Click to resume";
    playBtn.hidden = false;
  }
}

function onKeyDown(e) {
  if (!running) return;
  const key = doomKeyFromCode(e.code);
  if (key === null) return;
  if (isGameKeyCode(e.code)) e.preventDefault(); // stop page scrolling etc.
  if (e.repeat || heldKeys.has(e.code)) return;
  heldKeys.add(e.code);
  game.key(1, key);
}

function onKeyUp(e) {
  if (!running) return;
  const key = doomKeyFromCode(e.code);
  if (key === null) return;
  if (isGameKeyCode(e.code)) e.preventDefault();
  heldKeys.delete(e.code);
  game.key(0, key);
}

// Don't leave keys "stuck" down when the window loses focus.
function releaseAllKeys() {
  if (!running) return;
  for (const code of heldKeys) {
    const key = doomKeyFromCode(code);
    if (key !== null) game.key(0, key);
  }
  heldKeys.clear();
  mouseButtons = 0;
  sendMouseButtons();
}

function onMouseMove(e) {
  if (!running || document.pointerLockElement !== canvas) return;
  // Doom's y axis points up, the browser's points down.
  pendingDx += e.movementX;
  pendingDy -= e.movementY;
}

function onMouseButton(e) {
  if (!running || document.pointerLockElement !== canvas) return;
  mouseButtons = e.buttons & 0x7;
  sendMouseButtons();
}

async function start() {
  playBtn.hidden = true;
  overlay.classList.remove("hidden");
  try {
    setStatus("Downloading the engine...");
    const manifest = await fetchBytes("assets/manifest.json").then((b) =>
      JSON.parse(new TextDecoder().decode(b))
    );

    const wasmBytes = await fetchGunzipped(`assets/${manifest.engine.file}`);
    await verifySha256(wasmBytes, manifest.engine.sha256, "engine");

    setStatus("Downloading game data (Freedoom, 28 MB)...");
    const wadBytes = await fetchGunzipped(`assets/${manifest.iwad.file}`);
    await verifySha256(wadBytes, manifest.iwad.sha256, "game data");

    const configBytes = await fetchBytes("assets/default.cfg");

    setStatus("Starting...");
    game = await createDoom({
      wasmBytes,
      wadBytes,
      configBytes,
      onLog: (line) => console.log(line),
      onError: (line) => console.error(line),
    });
    if (!game.init()) throw new Error("The engine exited during startup.");

    engineInfo.textContent =
      `engine ${(manifest.engine.bytes / 1024).toFixed(0)} KB ` +
      `(${(manifest.engine.compressed_bytes / 1024).toFixed(0)} KB download) · ` +
      `data ${(manifest.iwad.bytes / 1048576).toFixed(1)} MB ` +
      `(${(manifest.iwad.compressed_bytes / 1048576).toFixed(1)} MB download)`;

    running = true;
    fullscreenBtn.disabled = false;
    setStatus("Ready.");
    playBtn.textContent = "Click to play";
    playBtn.hidden = false;
    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err);
    setStatus(err.message || String(err), true);
  }
}

playBtn.addEventListener("click", () => {
  overlay.classList.add("hidden");
  playBtn.blur(); // keep Space from re-activating the button
  captureMouse();
});

canvas.addEventListener("click", captureMouse);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

fullscreenBtn.addEventListener("click", () => {
  const stage = $("stage");
  if (document.fullscreenElement) document.exitFullscreen();
  else stage.requestFullscreen?.();
});

document.addEventListener("pointerlockchange", onPointerLockChange);
document.addEventListener("mousemove", onMouseMove);
document.addEventListener("mousedown", onMouseButton);
document.addEventListener("mouseup", onMouseButton);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("blur", releaseAllKeys);

start();
