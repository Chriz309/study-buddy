/* Wardrobe: where each costume item sits on each buddy, pose by pose, and the overlay that draws them.
   Shared by the pet renderer (app.js), the Wardrobe preview (settings.js), scripts/wardrobe_check.js and the tests.

   An anchor is [x, y, s, r, sx] in FRAME pixels of that pose's sprite (pixel buddies: the 40/48px art frame; painted buddies:
   the PNG; blob/ghost: the body PNG, whose vector face lives in the same frame):
     x, y  the point the item attaches to: head = top of the skull (the hat's bottom centre), face = midpoint of the eyes,
           neck = the throat (where a tie or scarf hangs from)
     s     frame pixels per art pixel (items are drawn with nearest sampling, so on a 40px buddy s = 1 keeps the pixels crisp)
     r     rotation in degrees about the attach point (clockwise)
     sx    optional horizontal squash for side views (the lenses narrow, the second one wraps round the muzzle)
   A slot of null means "do not draw": back turned, curled up asleep, frog form, cropped by the taskbar.
   Mirroring is free: the overlay sits inside the same flip/rotate/scale transform as the sprite itself. */
(function (root) {
  'use strict';
  const SLOTS = ['head', 'face', 'neck'];
  const ORDER = ['neck', 'face', 'head'];   // draw order: hats on top

  const P = (head, face, neck) => ({ head, face, neck });

  // ---- Captain Cram: 40x40 frames, 1 art px = 1 frame px. my = first row of the mask. ----
  const heroFront = (my, neck = true) => P([20, my - 3, 1, 0], [20, my + 1, 1, 0], neck ? [20, my + 6, 1, 0] : null);
  const heroSide = (my, hx = 19, ex = 22, nx = 21) => P([hx, my - 3, 1, 0], [ex, my + 1, 1, 0, 0.6], [nx, my + 7, 1, 0]);
  const HERO = { w: 40, h: 40, poses: {
    idle: heroFront(12), idle2: heroFront(12), flex: heroFront(13), frazzled: heroFront(13), happy: heroFront(11),
    juggle: heroFront(14), shock: heroFront(12), peek: heroFront(29, false),
    walk1: heroSide(11), walk2: heroSide(12), walk3: heroSide(11), walk4: heroSide(12),
    land: heroSide(19, 28, 31.5, 30.5), fly: { ...heroSide(17, 29, 32.5), neck: null },   // flying: body is horizontal, a tie would dangle in mid air
     pull: heroSide(12, 18, 19.5, 19.5),
    sleep: P(null, [6.5, 33, 1, 0, 0.6], null),
  } };

  // ---- Merlo: 48x48. His pointed hat is the whole point of him, so he takes no head items; face + neck sit on the beard line. ----
  const wiz = (fx, fy, neck = true) => P(null, [fx, fy, 1, 0], neck ? [fx, fy + 5, 1, 0] : null);
  const WIZARD = { w: 48, h: 48, poses: {
    idle: wiz(23, 20), idle2: wiz(23, 21), walk1: wiz(24, 19), walk2: wiz(23, 20), fly: wiz(23, 17.5),
    cast: wiz(24, 20), cast2: wiz(23, 20), point: wiz(24, 20), stir: wiz(24.5, 21), drink: wiz(22.5, 20.5),
    read: wiz(23, 21, false), happy: wiz(23, 20), surprised: wiz(23, 20), pull: wiz(21, 21.5), hang: wiz(23, 20),
    sleep: P(null, null, null), frog: P(null, null, null),
  } };

  // ---- Blob + Ghost: the vector face lives in a 100x100 box mapped onto the body, eyes at 40% / 60% across, 45% down ----
  const BLOB = { w: 614, h: 440, poses: {
    front: P([307, 62, 20, 0], [307, 198, 20.5, 0], [307, 275, 11, 0]),
    back: P([307, 62, 20, 0], null, [307, 275, 11, 0]),   // climbing: back turned, no face
  } };
  const GHOST = { w: 423, h: 440, poses: {
    front: P([211, 78, 15, 0], [211, 198, 14, 0], [211, 285, 10, 0]),
    back: P([211, 78, 15, 0], null, [211, 285, 10, 0]),
  } };

  // ---- Pib: painted poses (frames 148 to 299 px; the art is smooth, so items are scaled to the head, not to the art grid).
  // Measured on the frames: front eyes sit at x = 75 and 131 (s = 10.2 puts the lenses on them), the skull top between the ears is
  // ~30% of the head width (hats s = 4.2 on the full-size poses, 2.6 on the smaller reaction poses). Side views: near eye on the
  // eye line, far lens (sx) wraps round the muzzle; lying asleep the eyes are shut and the head is turned, so no face items there. ----
  const SIDE = P([232, 42, 4.2, 6], [252, 99, 9, 0, 0.45], [222, 160, 5, 0]);
  const CAT = { w: 0, h: 0, poses: {   // w/h differ per pose, see CAT_FRAMES
    front: P([103, 56, 4.2, 0], [103, 94, 10.2, 0], [103, 148, 5, 0]),
    sit: P([108, 38, 4.2, 6], [139, 91, 9, 0, 0.45], [112, 160, 5, 0]),
    lay: P([190, 34, 4.2, 12], null, null),
    side: SIDE, side2: SIDE, side3: SIDE, side4: SIDE,
    shock: P([100, 44, 2.6, 0], [100, 89, 6.4, 0], [100, 138, 3.3, 0]),
    frazzled: P([96, 58, 2.6, 0], [95, 107, 6.7, 0], [96, 140, 3.3, 0]),
    pull: P([162, 50, 2.6, 6], [160, 90, 5.4, 0, 0.45], [150, 130, 3, 0]),
    juggle: P([102, 62, 2.6, 0], [102, 105, 6.8, 0], [102, 142, 3.3, 0]),
    peek: P([86, 26, 2.6, 0], [86, 65, 6.4, 0], null),
  } };
  // frame size of each painted cat pose (the art contract: test/cosmetics.test.js checks these against art-cat*.js)
  const CAT_FRAMES = { side: [299, 252], side2: [299, 252], side3: [299, 252], side4: [299, 252], front: [193, 265], sit: [181, 269], lay: [253, 181],
                       shock: [180, 194], frazzled: [168, 212], pull: [208, 162], juggle: [184, 212], peek: [148, 128] };

  const ANCHORS = { blob: BLOB, ghost: GHOST, cat: CAT, hero: HERO, wizard: WIZARD };

  // the art switches to *_blink frames (and Merlo to 'blink') for a moment: same head, same anchors
  function poseKey(char, pose) {
    const a = ANCHORS[char]; if (!a) return null;
    if (char === 'wizard' && pose === 'blink') return 'idle';
    const k = String(pose || '').replace(/_blink$/, '');
    return a.poses[k] ? k : null;
  }
  function frameSize(char, key) { const a = ANCHORS[char]; return char === 'cat' ? (CAT_FRAMES[key] || [0, 0]) : [a.w, a.h]; }
  // -> { head, face, neck, key, fw, fh } or null when the buddy/pose is unknown
  function anchorsFor(char, pose) {
    const key = poseKey(char, pose); if (!key) return null;
    const row = ANCHORS[char].poses[key], f = frameSize(char, key);
    return { head: row.head, face: row.face, neck: row.neck, key, fw: f[0], fh: f[1] };
  }

  // placements in FRAME pixels: { id, slot, x, y, w, h, ox, oy, rot } (x,y = top-left of the unrotated box, ox,oy = rotation origin inside it)
  function place(char, pose, equipped, art) {
    const A = anchorsFor(char, pose), out = [];
    if (!A || !equipped || !art) return out;
    for (const slot of ORDER) {
      const id = equipped[slot], it = id && art[id], an = A[slot];
      if (!it || !an || it.slot !== slot) continue;
      const s = an[2], sx = an[4] == null ? 1 : an[4];
      const ox = it.ax * s * sx, oy = it.ay * s;
      out.push({ id, slot, x: an[0] - ox, y: an[1] - oy, w: it.w * s * sx, h: it.h * s, ox, oy, rot: an[3] || 0 });
    }
    return out;
  }

  // Build the <img>s for placements inside `layer`; k = css px per frame px.
  function paint(layer, list, art, k) {
    layer.textContent = '';
    for (const p of list) {
      const im = document.createElement('img'); im.src = art[p.id].src; im.alt = ''; im.draggable = false;
      im.style.cssText = 'position:absolute;pointer-events:none;image-rendering:pixelated;image-rendering:crisp-edges;image-rendering:pixelated;' +
        'left:' + (p.x * k) + 'px;top:' + (p.y * k) + 'px;width:' + (p.w * k) + 'px;height:' + (p.h * k) + 'px;' +
        'transform-origin:' + (p.ox * k) + 'px ' + (p.oy * k) + 'px;transform:rotate(' + p.rot + 'deg)';
      layer.appendChild(im);
    }
  }

  // The pet renderer's overlay. `host` is a fixed full-window div that mirrors the sprite canvas' flip/rotate/scale/opacity;
  // inside it a layer is pinned to the jelly's current (squashing) bounds exactly like face.js does for the vector face,
  // so items squash and stretch with the body. Items are rebuilt only when buddy, pose, size or equipment changes.
  function createOverlay(host, art) {
    const layer = document.createElement('div');
    layer.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none';
    host.appendChild(layer);
    let equipped = {}, key = '', shown = true, tf = '', tfo = '', op = '', tr = '';
    const mirror = (src) => {   // copy the sprite canvas' transform so items flip, rotate, shrink and fade with it
      if (src.transform !== tf) host.style.transform = tf = src.transform;
      if (src.transformOrigin !== tfo) host.style.transformOrigin = tfo = src.transformOrigin;
      if (src.opacity !== op) host.style.opacity = op = src.opacity;
      if (src.transition !== tr) host.style.transition = tr = src.transition;
    };
    function hide() { if (shown) { host.style.display = 'none'; shown = false; } }
    return {
      setEquipped(map) { equipped = map || {}; key = ''; },
      hide,
      // b = jelly.getBounds() (device px), rest = the unsquashed device size, dpr = device pixel ratio
      frame(char, pose, b, restW, restH, dpr, srcStyle) {
        const row = equipped[char], A = anchorsFor(char, pose);
        if (!row || !A || !(row.head || row.face || row.neck) || !(restW > 0) || !(restH > 0) || !b) { hide(); return; }
        const k2 = [char, A.key, Math.round(restH), row.head, row.face, row.neck].join('|');
        if (k2 !== key) {
          key = k2; const list = place(char, pose, row, art);
          layer.style.width = (restW / dpr) + 'px'; layer.style.height = (restH / dpr) + 'px';
          paint(layer, list, art, (restH / dpr) / A.fh);
          if (!list.length) { hide(); return; }
        }
        if (!shown) { host.style.display = ''; shown = true; }
        if (srcStyle) mirror(srcStyle);
        layer.style.transform = 'translate(' + (b.minx / dpr) + 'px,' + (b.miny / dpr) + 'px) scale(' + ((b.maxx - b.minx) / restW) + ',' + ((b.maxy - b.miny) / restH) + ')';
      },
    };
  }

  const api = { SLOTS, ORDER, ANCHORS, CAT_FRAMES, poseKey, anchorsFor, place, paint, createOverlay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Cosmetics = api;
})(typeof window !== 'undefined' ? window : globalThis);
