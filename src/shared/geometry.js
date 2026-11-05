// Pure screen-geometry helpers (no Electron). Used by the engine, the watchdog and the tests.
// A "display" is { bounds:{x,y,width,height}, workArea:{x,y,width,height} } in global DIP.
'use strict';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite = (n) => typeof n === 'number' && Number.isFinite(n);

function overlapArea(ax, ay, aw, ah, r) {
  const w = Math.min(ax + aw, r.x + r.width) - Math.max(ax, r.x);
  const h = Math.min(ay + ah, r.y + r.height) - Math.max(ay, r.y);
  return w > 0 && h > 0 ? w * h : 0;
}

// Fraction (0..1) of the size x size sprite whose top-left is `pos` that lies on any display.
function visibleFraction(pos, size, displays) {
  if (!pos || !finite(pos.x) || !finite(pos.y) || !(size > 0)) return 0;
  let a = 0;
  for (const d of displays || []) a += overlapArea(pos.x, pos.y, size, size, d.bounds);
  return Math.min(1, a / (size * size));
}

// The display whose bounds contain the point, or null.
function displayAt(displays, x, y) {
  for (const d of displays || []) {
    const b = d.bounds;
    if (x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height) return d;
  }
  return null;
}

function distToRect(x, y, r) {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.width)), dy = Math.max(r.y - y, 0, y - (r.y + r.height));
  return Math.hypot(dx, dy);
}

// The display the sprite is "on": most overlap, else nearest to its centre.
function displayForSprite(pos, size, displays) {
  let best = null, ba = 0;
  for (const d of displays || []) { const a = overlapArea(pos.x, pos.y, size, size, d.bounds); if (a > ba) { ba = a; best = d; } }
  if (best) return best;
  const cx = pos.x + size / 2, cy = pos.y + size / 2;
  let bd = Infinity;
  for (const d of displays || []) { const k = distToRect(cx, cy, d.bounds); if (k < bd) { bd = k; best = d; } }
  return best;
}

// Move the sprite fully inside the work area of the display it is on (or nearest to).
// Returns { x, y, moved }. With no usable displays the input is returned unchanged.
function clampSpriteToDisplays(pos, size, displays) {
  const px = finite(pos && pos.x) ? pos.x : NaN, py = finite(pos && pos.y) ? pos.y : NaN;
  const d = displayForSprite({ x: px, y: py }, size, displays) || (displays && displays[0]);
  if (!d) return { x: pos.x, y: pos.y, moved: false };
  const wa = d.workArea;
  const cx = finite(px) ? px : wa.x + (wa.width - size) / 2;
  const cy = finite(py) ? py : wa.y + wa.height - size;
  const x = clamp(cx, wa.x, Math.max(wa.x, wa.x + wa.width - size));
  const y = clamp(cy, wa.y, Math.max(wa.y, wa.y + wa.height - size));
  return { x, y, moved: x !== pos.x || y !== pos.y };
}

// Where to put a rescued sprite: bottom-centre of the work area of the display under `hint`
// (a point, e.g. the cursor), else the primary-ish first display.
function homePosition(size, displays, hint) {
  const d = (hint && displayAt(displays, hint.x, hint.y)) || (displays && displays[0]);
  if (!d) return { x: 300, y: 300 };
  const wa = d.workArea;
  return { x: wa.x + Math.round((wa.width - size) / 2), y: wa.y + wa.height - size };
}

// Smallest rect containing every display's bounds.
function worldBounds(displays) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of displays || []) { const b = d.bounds; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

module.exports = { clamp, finite, visibleFraction, displayAt, displayForSprite, clampSpriteToDisplays, homePosition, worldBounds, overlapArea };
