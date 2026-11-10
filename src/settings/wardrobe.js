/* Customise section: ONE place to rename, recolour and dress a buddy. Pick an owned buddy, see it live (colour and
   costume included), edit its name, pick a colour, then buy / equip / remove outfit items per slot.
   State comes from main (same stream as settings.js); mutations go over the preload bridge (rename / setColor /
   buyCosmetic / equipCosmetic). Anchors + placement come from the shared renderer/cosmetics.js, the same code the
   desktop pet uses. Art loading, sprites and tints come from window.SB (settings.js); all styling lives in settings.css. */
(function () {
  const root = document.getElementById('wardrobeRoot');
  if (!root || !window.Cosmetics || !window.COSMETIC_ART || !window.SB) return;
  const SB = window.SB, ART = window.COSMETIC_ART, esc = SB.esc, fmt = SB.fmt;
  const SLOT_LABEL = { head: 'Hats', face: 'Faces', neck: 'Neck' };
  let state = null, sel = null;

  const affordable = (p) => !!state && (state.infiniteSparks === true || state.sparks >= p);
  const nameOf = (c) => (state.names && state.names[c.id]) || c.name;
  const cos = () => state.cosmetics || { owned: [], equipped: {} };

  // ---- paint deferral: never rebuild under the user's hands ----
  // A state push (for example the rename echoing back) must not wipe the name field while it is being typed in, and must
  // not swap a button out between mouse down and mouse up. Both cases wait, then repaint once.
  let pending = false, pressing = false;
  const typing = () => { const a = document.activeElement; return !!a && a.id === 'czName' && root.contains(a); };
  function schedule() {
    if (!state) return;
    if (typing() || pressing) { pending = true; return; }
    pending = false; paint();
  }
  const flushSoon = () => { if (pending) setTimeout(schedule, 0); };
  root.addEventListener('pointerdown', () => { pressing = true; }, true);
  window.addEventListener('pointerup', () => { pressing = false; flushSoon(); }, true);
  window.addEventListener('pointercancel', () => { pressing = false; flushSoon(); }, true);
  root.addEventListener('focusout', flushSoon);

  function paintPreview(host, char) {
    const a = SB.ART[char], pose = a && a.pose, src = SB.artSrc(char), A = a && window.Cosmetics.anchorsFor(char, pose);
    if (!a || !src || !A) { host.innerHTML = '<div class="wr-empty">Loading</div>'; return; }
    const H = char === 'blob' ? 120 : 150, k = H / A.fh, W = Math.round(A.fw * k);
    host.innerHTML = '';
    const view = document.createElement('div'); view.className = 'wr-view'; view.style.width = W + 'px'; view.style.height = H + 'px';
    view.style.imageRendering = a.px ? 'pixelated' : 'auto';
    const base = document.createElement('img'); base.className = 'base'; base.src = src; base.alt = ''; view.appendChild(base);
    if (a.face) view.insertAdjacentHTML('beforeend', SB.FACE_SVG);
    // the chosen colour tints the body and the face, never the outfit on top
    const tint = SB.tintFor(char, state.colors);
    if (tint) { base.style.filter = tint; const f = view.querySelector('svg'); if (f) f.style.filter = tint; }
    SB.recoloredSrc(char, state.colors, (u) => { if (u && base.src !== u) base.src = u; });   // pixel buddies: the clothes in the picked colour, as on the desktop
    const layer = document.createElement('div'); layer.className = 'items'; view.appendChild(layer);
    host.appendChild(view);
    const list = window.Cosmetics.place(char, pose, cos().equipped[char] || {}, ART);
    window.Cosmetics.paint(layer, list, ART, k);
  }

  function itemCard(it, c, worn, owned, ok) {
    let btn;
    if (!ok) btn = `<button class="btn sm" disabled>Not for ${esc(nameOf(c))}</button>`;
    else if (worn) btn = `<button class="btn sm" data-remove="${it.slot}">Remove</button>`;
    else if (owned) btn = `<button class="btn sm" data-equip="${it.id}" data-slot="${it.slot}">Equip</button>`;
    else btn = `<button class="btn sm" data-buy="${it.id}" data-price="${it.price}" ${affordable(it.price) ? '' : 'disabled'}>Buy · <span class="cost">${fmt(it.price)}⚡</span></button>`;
    return `<div class="wr-item${worn ? ' worn' : ''}"><div class="pic"><img src="${ART[it.id] ? ART[it.id].src : ''}" alt=""></div><b>${esc(it.name)}</b>` +
      `<span class="price${owned ? ' have' : ''}">${owned ? (worn ? 'Wearing' : 'Owned') : fmt(it.price) + ' Sparks'}</span>${btn}</div>`;
  }

  function swatches(c) {
    if (c.id === 'cat') {
      const cur = (state.colors && state.colors.cat) || 'ginger';
      return SB.CAT_SWATCHES.map(s => `<button class="sw${s.key === cur ? ' on' : ''}" style="background:${s.dot}" title="${s.label}" aria-label="${s.label}" data-catcol="${s.key}"></button>`).join('');
    }
    const cur = (state.colors && state.colors[c.id]) || 0;
    const RC = window.Recolor, pal = RC ? RC.paletteFor(c.id) : SB.PALETTE, sty = (h) => (RC ? RC.swatchStyle(c.id, h) : `background:${SB.SWBASE};filter:hue-rotate(${h}deg)`);
    return pal.map(h => `<button class="sw${h === cur ? ' on' : ''}" style="${sty(h)}" title="${h === 0 ? 'Original' : 'Tint'}" aria-label="${h === 0 ? 'Original colour' : 'Tint ' + h}" data-hue="${h}"></button>`).join('');
  }

  function paint() {
    if (!state) return;
    const owned = (state.catalog || []).filter(c => state.owned.includes(c.id));
    if (!owned.length) { root.innerHTML = '<div class="wr-empty">Adopt a buddy first.</div>'; return; }
    if (!sel || !owned.some(c => c.id === sel)) sel = owned.some(c => c.id === state.active) ? state.active : owned[0].id;
    const c = owned.find(x => x.id === sel), worn = cos().equipped[sel] || {}, mine = cos().owned;
    const items = state.cosmeticCatalog || [];
    const slots = ['head', 'face', 'neck'].map(slot => {
      const list = items.filter(i => i.slot === slot);
      const ok = (i) => !(i.not && i.not.includes(sel));
      const body = list.every(i => !ok(i)) ? `<div class="wr-sub">${esc(nameOf(c))} already has the perfect hat.</div>` :
        `<div class="wr-grid">${list.map(i => itemCard(i, c, worn[slot] === i.id, mine.includes(i.id), ok(i))).join('')}</div>`;
      return `<div class="wr-slot"><h4>${SLOT_LABEL[slot]}</h4>${body}</div>`;
    }).join('');
    const wearing = ['head', 'face', 'neck'].map(s => worn[s] ? esc((items.find(i => i.id === worn[s]) || {}).name || worn[s]) : '').filter(Boolean).join(', ');
    root.innerHTML = `
      <div class="cz-pick" role="tablist" aria-label="Choose a buddy">${owned.map(x => `<button class="cz-chip${x.id === sel ? ' on' : ''}" data-pick="${x.id}" role="tab" aria-selected="${x.id === sel}"><span class="thumb"><span data-sprite="${x.id}"></span></span><span class="nm">${esc(nameOf(x))}</span></button>`).join('')}</div>
      <div class="cz-layout">
        <div class="cz-stage card">
          <div class="cz-view" id="wrPreview"></div>
          <label class="cz-label" for="czName">Name</label>
          <input class="field" id="czName" maxlength="18" spellcheck="false" autocomplete="off" value="${esc(nameOf(c))}" />
          <div class="cz-label">Colour</div>
          <div class="swatches">${swatches(c)}</div>
          <div class="cz-worn">${wearing ? 'Wearing: ' + wearing : 'Nothing on yet'}</div>
        </div>
        <div>${slots}</div>
      </div>`;
    root.querySelectorAll('.cz-chip [data-sprite]').forEach(h => SB.spriteInto(h, h.dataset.sprite, state.colors));
    SB.ensureArt(sel, () => { const h = root.querySelector('#wrPreview'); if (h && sel === c.id) paintPreview(h, sel); });

    root.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => { sel = b.dataset.pick; paint(); }));
    const name = root.querySelector('#czName'), id = c.id;
    name.addEventListener('change', () => window.buddy.rename(id, name.value));
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
    root.querySelectorAll('.sw').forEach(b => b.addEventListener('click', () =>
      window.buddy.setColor(id, b.dataset.catcol !== undefined ? b.dataset.catcol : +b.dataset.hue)));
    root.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', async () => {
      const iid = b.dataset.buy, r = await window.buddy.buyCosmetic(iid);
      if (r && r.ok) { const it = items.find(i => i.id === iid); if (it && !(it.not && it.not.includes(sel))) await window.buddy.equipCosmetic(sel, it.slot, iid); }
      else { const old = b.innerHTML; b.textContent = r && r.reason === 'poor' ? 'Not enough ⚡' : 'Try again'; setTimeout(() => { if (b.isConnected) b.innerHTML = old; }, 1100); }
    }));
    root.querySelectorAll('[data-equip]').forEach(b => b.addEventListener('click', () => window.buddy.equipCosmetic(sel, b.dataset.slot, b.dataset.equip)));
    root.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => window.buddy.equipCosmetic(sel, b.dataset.remove, null)));
  }

  window.buddy.onState((s) => { state = s; schedule(); });
  window.buddy.getState().then((s) => { state = s; schedule(); });
  // Sparks tick every second without a state push: keep the Buy buttons honest in place (no rebuild)
  window.buddy.onSparks((n) => {
    if (!state) return; state.sparks = n;
    root.querySelectorAll('[data-buy]').forEach(b => { if (/^Buy/.test(b.textContent)) b.disabled = !affordable(+b.dataset.price); });
  });
})();
