/* Wardrobe tab: pick an owned buddy, see it wearing its costume, buy / equip / remove items per slot.
   State comes from main (same stream as settings.js); mutations go over the preload bridge (buyCosmetic / equipCosmetic).
   Anchors + placement come from the shared renderer/cosmetics.js, the same code the desktop pet uses. */
(function () {
  const root = document.getElementById('wardrobeRoot');
  if (!root || !window.Cosmetics || !window.COSMETIC_ART) return;
  const ART = window.COSMETIC_ART, SLOT_LABEL = { head: 'Hats', face: 'Faces', neck: 'Neck' };
  const EMOJI = { blob: '🫧', ghost: '👻', cat: '🐱', hero: '🦸', wizard: '🧙' };
  // buddy art is big (the painted cat alone is ~1 MB): load it only when that buddy is previewed
  const ART_FILE = { blob: 'art.js', ghost: 'art-ghost.js', cat: 'art-cat.js', hero: 'art-hero.js', wizard: 'art-wizard.js' };
  const PREVIEW = { blob: ['front', () => window.BLOB_ART], ghost: ['front', () => window.GHOST_ART], cat: ['front', () => (window.CAT_ART || {}).front],
                    hero: ['idle', () => (window.HERO_ART || {}).idle], wizard: ['idle', () => (window.WIZARD_ART || {}).idle] };
  const loaded = {};
  let state = null, sel = null;

  const css = document.createElement('style');
  css.textContent = `
  #wardrobeRoot .wr-pick{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
  #wardrobeRoot .wr-chip{all:unset;cursor:pointer;padding:7px 13px;border-radius:20px;font-size:12.5px;font-weight:800;background:var(--panel);border:1px solid var(--line);color:var(--text)}
  #wardrobeRoot .wr-chip:hover{border-color:var(--accent2)}
  #wardrobeRoot .wr-chip.on{background:var(--accent);color:#1a1405;border-color:var(--accent)}
  #wardrobeRoot .wr-layout{display:grid;grid-template-columns:230px 1fr;gap:16px;align-items:start}
  #wardrobeRoot .wr-stage{background:linear-gradient(160deg,#23232f,#191922);border:1px solid var(--line);border-radius:18px;padding:14px;text-align:center;position:sticky;top:0}
  #wardrobeRoot .wr-view{position:relative;margin:56px auto 8px;display:block;image-rendering:pixelated}
  #wardrobeRoot .wr-view>img.base{display:block;width:100%;height:100%}
  #wardrobeRoot .wr-view>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  #wardrobeRoot .wr-view .items{position:absolute;inset:0}
  #wardrobeRoot .wr-name{font-size:15px;font-weight:800}
  #wardrobeRoot .wr-sub{font-size:11.5px;color:var(--dim);margin-top:2px;line-height:1.4}
  #wardrobeRoot .wr-slot{margin-bottom:18px}
  #wardrobeRoot .wr-slot h4{font-size:11px;font-weight:800;color:var(--dim);letter-spacing:.6px;text-transform:uppercase;margin-bottom:8px}
  #wardrobeRoot .wr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
  #wardrobeRoot .wr-item{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:7px;align-items:center;text-align:center}
  #wardrobeRoot .wr-item.worn{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
  #wardrobeRoot .wr-item .pic{height:58px;width:100%;display:flex;align-items:center;justify-content:center;background:var(--panel2);border-radius:10px}
  #wardrobeRoot .wr-item .pic img{image-rendering:pixelated;max-width:90%;max-height:48px}
  #wardrobeRoot .wr-item b{font-size:12.5px}
  #wardrobeRoot .wr-item .price{font-size:11px;color:var(--accent);font-weight:800}
  #wardrobeRoot .wr-item button.act{width:100%;flex:none}
  #wardrobeRoot .wr-empty{color:var(--dim);font-size:13px;padding:20px 0}
  @media (max-width:640px){#wardrobeRoot .wr-layout{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmt = (n) => Math.floor(n).toLocaleString();
  const affordable = (p) => !!state && (state.infiniteSparks === true || state.sparks >= p);
  const nameOf = (c) => (state.names && state.names[c.id]) || c.name;
  const cos = () => state.cosmetics || { owned: [], equipped: {} };

  function ensureArt(char, cb) {
    if (loaded[char] === true) return cb();
    if (loaded[char]) { loaded[char].push(cb); return; }
    loaded[char] = [cb];
    const s = document.createElement('script'); s.src = '../renderer/' + ART_FILE[char];
    const done = () => { const q = loaded[char]; loaded[char] = true; q.forEach(f => f()); };
    s.onload = done; s.onerror = done; document.head.appendChild(s);
  }

  const FACE_SVG = '<svg viewBox="0 0 100 100"><ellipse cx="40" cy="45" rx="7.4" ry="9.4" fill="#1b2338"/><ellipse cx="60" cy="45" rx="7.4" ry="9.4" fill="#1b2338"/>' +
    '<circle cx="37.6" cy="41.7" r="2.7" fill="#fff"/><circle cx="57.6" cy="41.7" r="2.7" fill="#fff"/><path d="M43 57 Q50 64 57 57" fill="none" stroke="#1b2338" stroke-width="2.9" stroke-linecap="round"/></svg>';

  function paintPreview(host, char) {
    const spec = PREVIEW[char]; if (!spec) return;
    const pose = spec[0], src = spec[1](); const A = window.Cosmetics.anchorsFor(char, pose);
    if (!src || !A) { host.innerHTML = '<div class="wr-empty">Loading</div>'; return; }
    const H = char === 'blob' ? 120 : 150, k = H / A.fh, W = Math.round(A.fw * k);
    host.innerHTML = '';
    const view = document.createElement('div'); view.className = 'wr-view'; view.style.width = W + 'px'; view.style.height = H + 'px';
    if (char === 'hero' || char === 'wizard') view.style.imageRendering = 'pixelated'; else view.style.imageRendering = 'auto';
    const base = document.createElement('img'); base.className = 'base'; base.src = src; base.alt = ''; view.appendChild(base);
    if (char === 'blob' || char === 'ghost') view.insertAdjacentHTML('beforeend', FACE_SVG);
    const layer = document.createElement('div'); layer.className = 'items'; view.appendChild(layer);
    host.appendChild(view);
    const list = window.Cosmetics.place(char, pose, cos().equipped[char] || {}, ART);
    window.Cosmetics.paint(layer, list, ART, k);
  }

  function card(it, c, worn, owned, ok) {
    const slotOpen = ok;
    let btn;
    if (!ok) btn = `<button class="act ghost" disabled>Not for ${esc(nameOf(c))}</button>`;
    else if (worn) btn = `<button class="act ghost" data-remove="${it.slot}">Remove</button>`;
    else if (owned) btn = `<button class="act" data-equip="${it.id}" data-slot="${it.slot}">Equip</button>`;
    else btn = `<button class="act" data-buy="${it.id}" ${affordable(it.price) ? '' : 'disabled'}>Buy · <span class="cost">${fmt(it.price)}⚡</span></button>`;
    return `<div class="wr-item${worn ? ' worn' : ''}"><div class="pic"><img src="${ART[it.id] ? ART[it.id].src : ''}" alt=""></div><b>${esc(it.name)}</b>` +
      `<span class="price">${owned ? (worn ? 'Wearing' : 'Owned') : fmt(it.price) + ' Sparks'}</span>${btn}</div>`;
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
        `<div class="wr-grid">${list.map(i => card(i, c, worn[slot] === i.id, mine.includes(i.id), ok(i))).join('')}</div>`;
      return `<div class="wr-slot"><h4>${SLOT_LABEL[slot]}</h4>${body}</div>`;
    }).join('');
    root.innerHTML = `<p class="hint">Spend Sparks on little outfits. Each buddy wears one hat, one pair of glasses and one neck piece at a time, and they show up on the desktop in every pose.</p>
      <div class="wr-pick">${owned.map(x => `<button class="wr-chip${x.id === sel ? ' on' : ''}" data-pick="${x.id}">${EMOJI[x.id] || '⭐'} ${esc(nameOf(x))}</button>`).join('')}</div>
      <div class="wr-layout"><div class="wr-stage"><div id="wrPreview"></div><div class="wr-name">${esc(nameOf(c))}</div>
        <div class="wr-sub">${['head', 'face', 'neck'].map(s => worn[s] ? esc((items.find(i => i.id === worn[s]) || {}).name || worn[s]) : '').filter(Boolean).join(', ') || 'Nothing on yet'}</div></div>
      <div>${slots}</div></div>`;
    ensureArt(sel, () => { const h = root.querySelector('#wrPreview'); if (h && sel === c.id) paintPreview(h, sel); });
    root.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => { sel = b.dataset.pick; paint(); }));
    root.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.buy, r = await window.buddy.buyCosmetic(id);
      if (r && r.ok) { const it = items.find(i => i.id === id); if (it && !(it.not && it.not.includes(sel))) await window.buddy.equipCosmetic(sel, it.slot, id); }
      else { const old = b.innerHTML; b.textContent = r && r.reason === 'poor' ? 'Not enough ⚡' : 'Try again'; setTimeout(() => { b.innerHTML = old; }, 1100); }
    }));
    root.querySelectorAll('[data-equip]').forEach(b => b.addEventListener('click', () => window.buddy.equipCosmetic(sel, b.dataset.slot, b.dataset.equip)));
    root.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => window.buddy.equipCosmetic(sel, b.dataset.remove, null)));
  }

  window.buddy.onState((s) => { state = s; paint(); });
  window.buddy.getState().then((s) => { state = s; paint(); });
  window.buddy.onSparks((n) => { if (state) { state.sparks = n; } });
})();
