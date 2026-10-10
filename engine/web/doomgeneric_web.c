//
// doomgeneric WebAssembly platform layer.
//
// doomgeneric only needs a handful of platform hooks (DG_*). This file
// implements them for a browser:
//   * video  -> frame is converted to RGBA and exported to JavaScript
//   * time   -> performance.now() imported from JavaScript
//   * input  -> key and mouse events pushed in from JavaScript
//   * sleep  -> no-op (the browser's requestAnimationFrame paces the game)
//
// The module is built as a WASI *reactor* (no main()). JavaScript calls
// dg_init() once, then dg_tick() once per animation frame.
//

#include <stdint.h>
#include <string.h>

#include "doomgeneric.h"
#include "doomkeys.h"
#include "doomtype.h"
#include "d_event.h"

// ---------------------------------------------------------------------------
// Imports provided by the JavaScript host (see docs/app.js).
// ---------------------------------------------------------------------------
#define DG_IMPORT(name) __attribute__((import_module("env"), import_name(name)))
#define DG_EXPORT(name) __attribute__((export_name(name)))

DG_IMPORT("js_now_ms") extern double js_now_ms(void);

// ---------------------------------------------------------------------------
// Frame output: DG_ScreenBuffer is 0x00RRGGBB; JavaScript wants RGBA bytes.
// ---------------------------------------------------------------------------
#define FRAME_PIXELS (DOOMGENERIC_RESX * DOOMGENERIC_RESY)
static uint8_t rgba_frame[FRAME_PIXELS * 4];

// ---------------------------------------------------------------------------
// Keyboard queue. Entries are (pressed << 8) | doomKey.
// ---------------------------------------------------------------------------
#define KEYQ_SIZE 64
static uint16_t keyq[KEYQ_SIZE];
static unsigned int keyq_write = 0;
static unsigned int keyq_read = 0;

static void keyq_push(int pressed, unsigned char key)
{
    unsigned int next = (keyq_write + 1) % KEYQ_SIZE;
    if (next == keyq_read)
    {
        return; // queue full: drop the event rather than block
    }
    keyq[keyq_write] = (uint16_t)(((pressed ? 1 : 0) << 8) | key);
    keyq_write = next;
}

// ---------------------------------------------------------------------------
// doomgeneric platform hooks
// ---------------------------------------------------------------------------
void DG_Init(void)
{
}

void DG_DrawFrame(void)
{
    const pixel_t *src = DG_ScreenBuffer;
    uint8_t *dst = rgba_frame;
    for (int i = 0; i < FRAME_PIXELS; i++)
    {
        uint32_t p = src[i];
        dst[0] = (uint8_t)((p >> 16) & 0xff);
        dst[1] = (uint8_t)((p >> 8) & 0xff);
        dst[2] = (uint8_t)(p & 0xff);
        dst[3] = 0xff;
        dst += 4;
    }
}

void DG_SleepMs(uint32_t ms)
{
    (void)ms; // the browser paces frames; blocking here would freeze the tab
}

uint32_t DG_GetTicksMs(void)
{
    return (uint32_t)js_now_ms();
}

int DG_GetKey(int *pressed, unsigned char *doomKey)
{
    if (keyq_read == keyq_write)
    {
        return 0;
    }
    uint16_t v = keyq[keyq_read];
    keyq_read = (keyq_read + 1) % KEYQ_SIZE;
    *pressed = v >> 8;
    *doomKey = (unsigned char)(v & 0xff);
    return 1;
}

void DG_SetWindowTitle(const char *title)
{
    (void)title;
}

// The engine calls system() only to launch external helpers (e.g. a music
// command). A browser has no shell, so report failure.
int system(const char *command)
{
    (void)command;
    return -1;
}

// ---------------------------------------------------------------------------
// Exports called by JavaScript
// ---------------------------------------------------------------------------

// Start the engine. Uses the Freedoom Phase 1 IWAD that JavaScript places at
// "/freedoom1.wad" in the in-memory WASI filesystem before calling this.
DG_EXPORT("dg_init")
void dg_init(void)
{
    static char arg0[] = "doom";
    static char arg1[] = "-iwad";
    static char arg2[] = "/freedoom1.wad";
    static char *argv[] = { arg0, arg1, arg2, NULL };

    doomgeneric_Create(3, argv);
}

// Advance the game by one frame.
DG_EXPORT("dg_tick")
void dg_tick(void)
{
    doomgeneric_Tick();
}

// Pointer to the RGBA frame (DOOMGENERIC_RESX x DOOMGENERIC_RESY x 4 bytes).
DG_EXPORT("dg_frame_ptr")
uint8_t *dg_frame_ptr(void)
{
    return rgba_frame;
}

DG_EXPORT("dg_frame_width")
int dg_frame_width(void)
{
    return DOOMGENERIC_RESX;
}

DG_EXPORT("dg_frame_height")
int dg_frame_height(void)
{
    return DOOMGENERIC_RESY;
}

// Keyboard: doomKey is a Doom key code (see doomkeys.h); pressed is 0 or 1.
DG_EXPORT("dg_key")
void dg_key(int pressed, int doomKey)
{
    keyq_push(pressed, (unsigned char)doomKey);
}

// Mouse: buttons is a bitmask (bit0 left, bit1 right, bit2 middle), dx/dy are
// relative movement in pixels with y pointing up (Doom convention).
DG_EXPORT("dg_mouse")
void dg_mouse(int buttons, int dx, int dy)
{
    event_t ev;
    ev.type = ev_mouse;
    ev.data1 = buttons;
    ev.data2 = dx;
    ev.data3 = dy;
    D_PostEvent(&ev);
}
