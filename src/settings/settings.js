/* Shop & Settings window logic. Reads the authoritative state from main and sends mutations back over the preload
   bridge; main re-broadcasts state so this view and the overlay stay in sync.
   Sections: Buddies (gumball machine + collection), Settings, About, and the header. Customise lives in wardrobe.js and
   Study in study.js; both share the small helper kit exposed here as window.SB (art loading, sprites, tints, escaping). */
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const feedCost = (lvl) => 50 * (lvl + 1);
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const fmt = (n) => Math.floor(n).toLocaleString();
  let state = null;
  const displayName = (c) => (state.names && state.names[c.id]) || c.name;

  // ---- shared kit (used by wardrobe.js too) ----
  // Buddy art is big (the painted cat alone is about 1 MB): each file is loaded the first time that buddy is shown.
  const ART = {
    blob:   { file: 'art.js',        pose: 'front', get: () => window.BLOB_ART, face: true },
    ghost:  { file: 'art-ghost.js',  pose: 'front', get: () => window.GHOST_ART, face: true },
    cat:    { file: 'art-cat.js',    pose: 'front', get: () => (window.CAT_ART || {}).front },
    hero:   { file: 'art-hero.js',   pose: 'idle',  get: () => (window.HERO_ART || {}).idle, px: true },
    wizard: { file: 'art-wizard.js', pose: 'idle',  get: () => (window.WIZARD_ART || {}).idle, px: true },
  };
  const CAT_COLORS = { ginger: '', grey: 'grayscale(1) brightness(1.02)', black: 'grayscale(1) brightness(.42) contrast(1.15)', white: 'grayscale(1) brightness(1.72) contrast(.82)' };
  const CAT_SWATCHES = [{ key: 'ginger', label: 'Ginger', dot: '#f0a04b' }, { key: 'grey', label: 'Grey', dot: '#9aa0a6' }, { key: 'black', label: 'Black', dot: '#3a3a3f' }, { key: 'white', label: 'White', dot: '#eceae4' }];
  // other buddies: hue-rotate degrees applied to the sprite; the swatch previews the real tint
  const PALETTE = [0, 45, 90, 140, 190, 250, 300];
  const SWBASE = '#2fa8ff';
  const FACE_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="40" cy="45" rx="7.4" ry="9.4" fill="#1b2338"/><ellipse cx="60" cy="45" rx="7.4" ry="9.4" fill="#1b2338"/>' +
    '<circle cx="37.6" cy="41.7" r="2.7" fill="#fff"/><circle cx="57.6" cy="41.7" r="2.7" fill="#fff"/><path d="M43 57 Q50 64 57 57" fill="none" stroke="#1b2338" stroke-width="2.9" stroke-linecap="round"/></svg>';
  const loaded = {};
  function ensureArt(id, cb) {
    const a = ART[id]; if (!a || loaded[id] === true) return cb();
    if (loaded[id]) { loaded[id].push(cb); return; }
    loaded[id] = [cb];
    const s = document.createElement('script'); s.src = '../renderer/' + a.file;
    const done = () => { const q = loaded[id]; loaded[id] = true; q.forEach(f => f()); };
    s.onload = done; s.onerror = done; document.head.appendChild(s);
  }
  const artSrc = (id) => (ART[id] && ART[id].get()) || null;
  // the colour the user picked for a buddy as a CSS filter (cat: named coats like the desktop pet; the rest: hue-rotate)
  function tintFor(id, colors) {
    const col = colors && colors[id];
    if (id === 'cat') return CAT_COLORS[col || 'ginger'] || '';
    if (RC && RC.has(id)) return '';   // pixel buddies recolour their clothes only (recoloredSrc below), never a whole-sprite tint
    const h = typeof col === 'number' ? col : 0; return h ? 'hue-rotate(' + h + 'deg)' : '';
  }
  // The sprite a buddy really shows on the desktop for its chosen colour: the pixel buddies get a clothes-recoloured copy (same maths as
  // the desktop pet, src/shared/recolor.js); everyone else keeps the plain art (their colour is the CSS filter from tintFor).
  const RC = window.Recolor, rcCache = {};
  function recoloredSrc(id, colors, cb) {
    const src = artSrc(id), v = colors && typeof colors[id] === 'number' ? colors[id] : 0;
    if (!src || !RC || !RC.has(id) || !RC.shiftFor(id, v)) return cb(src);
    const key = id + '@' + v; if (rcCache[key]) return cb(rcCache[key]);
    const im = new Image();
    im.onload = () => { try { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height); RC.recolorPixels(d.data, id, v); g.putImageData(d, 0, 0); rcCache[key] = c.toDataURL(); } catch { rcCache[key] = src; } cb(rcCache[key]); };
    im.onerror = () => cb(src); im.src = src;
  }
  // draw a buddy's real sprite into `host` (kept as is if the same buddy is already in there, so repaints never flicker)
  function spriteInto(host, id, colors) {
    ensureArt(id, () => {
      const src = artSrc(id);
      if (!src) { host.innerHTML = '<span class="spr-ph"></span>'; return; }
      let spr = host.firstElementChild;
      if (!spr || !spr.classList.contains('spr') || spr.dataset.id !== id) {
        host.innerHTML = '';
        spr = document.createElement('span'); spr.className = 'spr' + (ART[id].px ? ' px' : ''); spr.dataset.id = id;
        const img = document.createElement('img'); img.alt = ''; img.src = src; spr.appendChild(img);
        if (ART[id].face) spr.insertAdjacentHTML('beforeend', FACE_SVG);
        host.appendChild(spr);
      }
      const f = tintFor(id, colors); if (spr.style.filter !== f) spr.style.filter = f;
      const img = spr.querySelector('img'); recoloredSrc(id, colors, (u) => { if (img && u && img.src !== u) img.src = u; });
    });
  }
  window.SB = { esc, ART, ensureArt, artSrc, tintFor, spriteInto, recoloredSrc, CAT_SWATCHES, PALETTE, SWBASE, FACE_SVG, fmt };

  // ---- tabs ----
  const tabBtns = document.querySelectorAll('#tabs button');
  tabBtns.forEach(b => {
    b.addEventListener('click', () => {
      tabBtns.forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); $('#' + b.dataset.tab).classList.add('active');
      $('main').scrollTop = 0;
    });
  });

  // ---- header: Sparks balance ----
  const affordable = (cost) => !!state && (state.infiniteSparks === true || state.sparks >= cost);
  function paintWallet() {
    if (!state) return;
    $('#sparks').textContent = state.infiniteSparks ? '∞' : fmt(state.sparks);   // dev builds: Sparks never run out
    $('#rate').textContent = '+' + (state.rate || 1).toFixed(1) + ' / sec';
  }

  // ---- gumball machine ----
  const BALL_COLORS = ['#ff7a90', '#ffd23f', '#53d6ff', '#54e0a0', '#c08bff', '#ff9f4f', '#7ad1ff'];
  function buildDome() {
    const dome = $('#gmDome'); if (!dome || dome._built) return; dome._built = true;
    // a little pile of gumballs in the lower half of the dome
    const spots = [[18, 70], [44, 78], [70, 74], [32, 54], [58, 56], [84, 64], [46, 40], [72, 42], [24, 88], [60, 86], [86, 84], [8, 86]];
    spots.forEach((p, i) => {
      const b = document.createElement('span'); b.className = 'ball';
      b.style.left = p[0] + 'px'; b.style.top = p[1] + 'px';
      b.style.background = `radial-gradient(circle at 35% 30%, #fff8, ${BALL_COLORS[i % BALL_COLORS.length]} 60%)`;
      dome.appendChild(b);
    });
  }
  function paintGumball() {
    buildDome();
    const cost = state.gumballCost || 500, pool = state.gumballPool || [];
    $('#gmCost').textContent = cost.toLocaleString() + '⚡';
    const crank = $('#gmCrank'), desc = $('#gmDesc'), res = $('#gmResult');
    if (pool.length === 0) {
      crank.disabled = true;
      desc.textContent = 'You’ve adopted every friend available right now, more are on the way!';
      if (!res.querySelector('.gm-reveal')) { res.textContent = 'Collection complete'; res.classList.add('none'); }
    } else {
      crank.disabled = !affordable(cost);
      desc.textContent = `Crank the handle to adopt a random new buddy you don’t own yet. ${pool.length} still hiding inside.`;
    }
  }
  let rolling = false;
  function setResult(msg, muted) { const r = $('#gmResult'); r.textContent = msg; r.classList.toggle('none', !!muted); }
  function reveal(r) {
    const res = $('#gmResult'); res.classList.remove('none');
    res.innerHTML = '<span class="gm-reveal"><span class="gm-spr" data-sprite></span><span>You adopted <b>' + esc(r.name || 'a new buddy') + '</b>! It’s now your main buddy.</span></span>';
    spriteInto(res.querySelector('[data-sprite]'), r.got, state && state.colors);
  }
  function wireCrank() {
    const crank = $('#gmCrank'); if (!crank || crank._wired) return; crank._wired = true;
    crank.addEventListener('click', async () => {
      if (rolling || crank.disabled) return;
      if ((state.gumballPool || []).length === 0) return;
      if (!affordable(state.gumballCost || 500)) { setResult('Not enough ⚡, keep studying!', true); return; }
      rolling = true; $('#gumball').classList.add('spin'); setResult('…', true);
      let r; try { r = await window.buddy.roll(); } catch { r = null; }
      setTimeout(() => {
        $('#gumball').classList.remove('spin'); rolling = false;
        if (r && r.ok) reveal(r);
        else if (r && r.reason === 'complete') setResult('You’ve collected them all!', true);
        else if (r && r.reason === 'poor') setResult('Not enough ⚡', true);
        else setResult('Something went wrong, try again.', true);
      }, 750);
    });
  }

  // ---- buddies: the collection ----
  // Cards are kept between repaints and updated in place (a feed press-and-hold repaints about 10 times a second, and
  // rebuilding would reload each sprite and drop the pressed button). A card is rebuilt only when its kind changes.
  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>';
  const rarOf = (c) => (state.rarities && state.rarities[c.rarity]) || { label: c.rarity, color: '#9aa4b2' };
  const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
  function cardKind(c, owned) { return owned ? 'own' : c.implemented ? 'mys' : 'soon'; }
  function buildCard(c, kind) {
    const el = document.createElement('article');
    el.className = 'bcard card ' + (kind === 'own' ? '' : kind === 'mys' ? 'mystery' : 'soon');
    el.dataset.id = c.id; el.dataset.kind = kind;
    if (kind === 'own') {
      el.innerHTML = `
        <div class="b-art"><span data-sprite></span><span class="b-mark">${STAR_SVG}<span>Main buddy</span></span></div>
        <div class="b-body">
          <div class="b-head"><h3 class="b-name"></h3><span class="chip b-rar"></span></div>
          <div class="b-meta"></div>
          <p class="b-blurb"></p>
        </div>
        <div class="b-actions">
          <div class="b-btns"><button class="btn sm" data-feed="${c.id}"></button><button class="btn sm" data-use="${c.id}">Set as main</button></div>
          <label class="check"><input type="checkbox" data-desk="${c.id}"><span class="box">${CHECK_SVG}</span><span>On desktop</span><small></small></label>
          <button class="btn sm dev b-dev" data-sell="${c.id}" hidden>Sell (dev)</button>
        </div>`;
      spriteInto(el.querySelector('[data-sprite]'), c.id, state.colors);
    } else {
      el.innerHTML = `
        <div class="b-art"><span class="b-q">${kind === 'mys' ? '?' : '…'}</span></div>
        <div class="b-body">
          <div class="b-head"><h3 class="b-name"></h3><span class="chip b-rar"></span></div>
          <p class="b-blurb"></p>
        </div>
        <div class="b-actions"><button class="btn sm block" disabled></button></div>`;
    }
    return el;
  }
  function updateCard(el, c, kind) {
    const rar = rarOf(c), chip = el.querySelector('.b-rar');
    setText(chip, rar.label); chip.style.color = rar.color; chip.style.background = rar.color + '22';
    if (kind !== 'own') {
      setText(el.querySelector('.b-name'), kind === 'mys' ? '???' : c.name);
      setText(el.querySelector('.b-blurb'), kind === 'mys' ? 'A mystery friend waiting in the gumball machine.' : c.blurb);
      setText(el.querySelector('.b-actions .btn'), kind === 'mys' ? 'In the machine' : 'Coming soon');
      return;
    }
    const main = state.active === c.id, lvl = (state.levels && state.levels[c.id]) || 0, cost = feedCost(lvl);
    el.classList.toggle('main', main);
    setText(el.querySelector('.b-name'), displayName(c));
    el.querySelector('.b-meta').innerHTML = `Level <b>${lvl}</b> · <b>+${(0.1 * lvl).toFixed(1)}</b> ⚡/s bonus`;
    setText(el.querySelector('.b-blurb'), c.blurb);
    const feed = el.querySelector('[data-feed]');
    if (!feed._flash) { feed.innerHTML = `Feed · <span class="cost">${cost}⚡</span>`; feed.disabled = !affordable(cost); }
    el.querySelector('[data-use]').hidden = main;
    // On desktop: the main buddy is always out; the others follow showAll and the hide list
    const s = state.settings, hide = Array.isArray(s.hideBuddies) ? s.hideBuddies : [];
    const cb = el.querySelector('[data-desk]'), out = main || (!!s.showAll && !hide.includes(c.id));
    cb.checked = out; cb.disabled = main;
    setText(el.querySelector('.check small'), main ? 'always' : '');
    const sell = el.querySelector('[data-sell]'); sell.hidden = !(state.devTools && c.id !== 'blob');
    spriteInto(el.querySelector('[data-sprite]'), c.id, state.colors);
  }
  function paintBuddies() {
    paintGumball();
    const grid = $('#buddyGrid');
    // main first, then the rest you own, then friends still in the machine, then future ones
    const rank = (c) => state.owned.includes(c.id) ? (state.active === c.id ? 0 : 1) : c.implemented ? 2 : 3;
    const order = state.catalog.map((c, i) => [c, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
    const keep = new Set();
    order.forEach((c, i) => {
      const kind = cardKind(c, state.owned.includes(c.id));
      let el = grid.querySelector(`:scope > [data-id="${c.id}"]`);
      if (el && el.dataset.kind !== kind) { el.remove(); el = null; }
      if (!el) el = buildCard(c, kind);
      updateCard(el, c, kind); keep.add(el);
      if (grid.children[i] !== el) grid.insertBefore(el, grid.children[i] || null);
    });
    [...grid.children].forEach(el => { if (!keep.has(el)) el.remove(); });
    const have = state.owned.length, total = state.catalog.filter(c => c.implemented).length;
    setText($('#collTitle'), 'Your collection · ' + have + (total >= have ? ' of ' + total : ''));
  }
  function flash(btn, msg) {
    btn._flash = true; btn.textContent = msg;
    setTimeout(() => { btn._flash = false; if (state) paintBuddies(); }, 1100);
  }
  // On desktop tick: one patch with showAll and the full hide list (every other non-main owned buddy that stays unticked)
  function tickDesktop(id, on) {
    const s = state.settings, hide = Array.isArray(s.hideBuddies) ? s.hideBuddies : [];
    const others = state.catalog.filter(c => state.owned.includes(c.id) && c.id !== state.active).map(c => c.id);
    const ticked = new Set(others.filter(x => s.showAll && !hide.includes(x)));
    if (on) ticked.add(id); else ticked.delete(id);
    if (ticked.size === 0) window.buddy.patchSettings({ showAll: false, hideBuddies: [] });
    else window.buddy.patchSettings({ showAll: true, hideBuddies: others.filter(x => !ticked.has(x)) });
  }
  $('#buddyGrid').addEventListener('change', (e) => {
    const cb = e.target.closest && e.target.closest('[data-desk]'); if (cb && !cb.disabled) tickDesktop(cb.dataset.desk, cb.checked);
  });
  $('#buddyGrid').addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('button'); if (!t) return;
    if (t.dataset.use) window.buddy.setActive(t.dataset.use);
    else if (t.dataset.sell) window.buddy.devSell(t.dataset.sell);
  });

  // ---- settings ----
  const SIZES = [{ v: 34, l: 'Tiny' }, { v: 50, l: 'XS' }, { v: 72, l: 'S' }, { v: 110, l: 'M' }, { v: 160, l: 'L' }, { v: 220, l: 'XL' }];
  const sizeOpts = (cur) => { const o = SIZES.map(x => [x.v, x.l]); if (!SIZES.some(x => x.v === cur)) o.unshift([cur, cur + 'px']); return o; };
  function rowRange(label, sub, key, min, max, step) {
    return `<div class="row"><div class="txt"><div class="label">${label}</div><div class="sub">${sub}</div></div>
      <div class="ctrl"><input type="range" data-set="${key}" min="${min}" max="${max}" step="${step}"><span class="val"></span></div></div>`;
  }
  function rowSelect(label, sub, key, opts) {
    const o = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    return `<div class="row"><div class="txt"><div class="label">${label}</div><div class="sub">${sub}</div></div>
      <div class="ctrl"><select data-set="${key}">${o}</select></div></div>`;
  }
  function rowToggle(label, sub, key) {
    return `<div class="row"><div class="txt"><div class="label">${label}</div><div class="sub">${sub}</div></div>
      <div class="ctrl"><label class="switch"><input type="checkbox" data-set="${key}" aria-label="${label}"><span class="slider"></span></label></div></div>`;
  }
  const group = (title, rows) => `<div class="group"><span class="eyebrow">${title}</span><div class="card rows">${rows}</div></div>`;
  function buildSettings() {
    const win = state.platform === 'win32';
    $('#settingsRoot').innerHTML =
      group('Personality and movement',
        rowSelect('Personality', 'How your buddy acts day to day.', 'personality', state.personalities.map(p => [p, cap(p)])) +
        rowRange('Mischief', 'Higher means livelier: more climbing, peeking and jumping, and special antics more often.', 'mischief', 0, 100, 5) +
        rowRange('Speed', 'How fast it moves around.', 'speed', 0.4, 2, 0.1) +
        rowSelect('Size', 'How big it appears on screen.', 'size', sizeOpts(state.settings.size)) +
        rowToggle('Stay in one spot', 'Naughty corner: it stops roaming and just idles, hops and reacts where it stands.', 'stayPut') +
        rowToggle('Reduce motion', 'Calmer, minimal animation.', 'reduceMotion')) +
      group('Antics and desktop mischief',
        rowToggle('Special antics', 'Every buddy has its own stunts, like Pib chasing a butterfly or Captain Cram flying a patrol. They happen more often the higher Mischief is, and never in fullscreen.', 'antics') +
        (win ? rowToggle('Desktop mischief', 'Now and then your buddy appears to play with your taskbar, icons and windows. It is only a drawn illusion on top: nothing is ever moved, clicked or typed, and it stops the moment you come near. Windows only.', 'deskMischief') +
               rowSelect('Mischief frequency', 'How often the desktop pranks happen.', 'deskMischiefFreq', [['rare', 'Rare'], ['normal', 'Normal'], ['chaos', 'Chaos']]) : '')) +
      group('Speech',
        rowToggle('Speech bubbles', 'Let it say things now and then.', 'speech') +
        rowRange('Chattiness', 'How often it speaks up (floaty pets talk less).', 'chatter', 0, 1, 0.1)) +
      group('Study',
        rowToggle('Study alerts', 'Notify me when a focus block or break ends.', 'studyNotify')) +
      group('App',
        rowToggle('Pause idle points', 'Stop earning Sparks and settle down.', 'paused') +
        rowToggle('Start on login', 'Launch quietly when you log in.', 'startOnBoot'));
    $('#settingsRoot').querySelectorAll('[data-set]').forEach(el => {
      const key = el.dataset.set;
      el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
        let v;
        if (el.type === 'checkbox') v = el.checked;
        else if (el.type === 'range') v = key === 'mischief' ? parseInt(el.value, 10) : parseFloat(el.value);
        else v = isNaN(+el.value) ? el.value : +el.value;
        if (el.type === 'range') showRange(el, v);
        window.buddy.patchSettings({ [key]: v });
      });
    });
  }
  const rangeText = (key, v) => key === 'mischief' ? v + '%' : key === 'speed' ? (+v).toFixed(1) + '×' : Math.round(v * 100) + '%';
  function showRange(el, v) {
    const near = el.parentElement.querySelector('.val'); if (near) near.textContent = rangeText(el.dataset.set, v);
    el.style.setProperty('--p', ((v - el.min) / (el.max - el.min) * 100) + '%');
  }
  function settingValue(key) {
    const s = state.settings;
    switch (key) {
      case 'antics': return s.antics !== false;
      case 'studyNotify': return s.studyNotify !== false;
      case 'deskMischief': return !!state.mischiefOn;
      case 'deskMischiefFreq': return s.deskMischiefFreq || 'normal';
      case 'chatter': return s.chatter == null ? 0.6 : s.chatter;
      default: return s[key];
    }
  }
  // Settings rows are built once and synced in place: a state push never closes an open dropdown or drops a slider drag.
  function paintSettings() {
    if (!$('#settingsRoot').firstElementChild) buildSettings();
    $('#settingsRoot').querySelectorAll('[data-set]').forEach(el => {
      const key = el.dataset.set, v = settingValue(key);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'range') { if (holdingRange) return; el.value = v; showRange(el, +v); }
      else {
        if (el.tagName === 'SELECT' && !Array.from(el.options).some(o => o.value === String(v))) el.add(new Option(v + 'px', v), el.options[0]);
        if (document.activeElement !== el) el.value = v;
      }
    });
  }

  // ---- about + header actions ----
  function paintAbout() {
    if (state.update) {
      const u = state.update, st = $('#updateStatus');
      const map = { idle: '', checking: 'Checking…', current: 'You’re up to date.',
        available: 'Downloading update ' + (u.info && u.info.version || '') + '…',
        downloaded: 'Update ' + (u.info && u.info.version || '') + ' downloaded, ready to install.',
        manual: 'Study Buddy ' + (u.info && u.info.version || '') + ' is out!',
        error: 'Could not check right now.' };
      st.textContent = map[u.status] || '';
      const inst = $('#installUpdate'), chk = $('#checkUpdate');
      const ready = u.status === 'downloaded' || u.status === 'manual';
      if (inst) { inst.style.display = ready ? '' : 'none'; inst.textContent = u.status === 'manual' ? 'Download update' : 'Restart & update now'; }
      if (chk) chk.style.display = ready ? 'none' : '';
    }
    const hb = $('#ctlHide'); if (hb) { $('#ctlHideLabel').textContent = state.buddyHidden ? 'Show' : 'Hide'; hb.title = state.buddyHidden ? 'Show buddy' : 'Hide buddy'; }
  }
  wireCrank();
  $('#checkUpdate').addEventListener('click', () => { window.buddy.checkUpdate(); $('#updateStatus').textContent = 'Checking…'; });
  $('#installUpdate').addEventListener('click', () => { $('#updateStatus').textContent = (state && state.update && state.update.status === 'manual') ? 'Opening the download page…' : 'Restarting to update…'; window.buddy.installUpdate(); });
  $('#ctlDrive').addEventListener('click', () => window.buddy.openDrive());
  $('#ctlQuit').addEventListener('click', () => window.buddy.quit());
  $('#ctlHide').addEventListener('click', () => { if (state && state.buddyHidden) window.buddy.showBuddy(); else window.buddy.hideBuddy(); });
  $('#ctlDev').addEventListener('click', () => window.buddy.devAddSparks());
  $('#mail').addEventListener('dblclick', () => window.buddy.openEmail());
  { const wa = $('#wa'); if (wa) wa.addEventListener('dblclick', () => window.buddy.openWhatsApp()); }

  // ---- wire state ----
  function paintAll() {
    paintWallet(); paintBuddies(); paintSettings(); paintAbout();
    $('#aboutVer').textContent = 'current version ' + (state.appVersion || '-');
    const dv = $('#ctlDev'); if (dv) dv.style.display = state.devTools ? '' : 'none';
  }
  // the Sparks tick arrives every second without a state push: keep the crank and the Feed buttons honest
  function refreshAffordability() {
    const crank = $('#gmCrank'), pool = state.gumballPool || [];
    if (crank && !rolling) crank.disabled = pool.length === 0 || !affordable(state.gumballCost || 500);
    document.querySelectorAll('#buddyGrid [data-feed]').forEach(b => {
      if (b._flash) return; const lvl = (state.levels && state.levels[b.dataset.feed]) || 0; b.disabled = !affordable(feedCost(lvl));
    });
  }
  window.buddy.onSparks((n) => { if (!state) return; state.sparks = n; paintWallet(); refreshAffordability(); });
  // While a slider is held the repaint waits for release, so the drag is never dropped.
  let holdingRange = false, repaintPending = false;
  const releaseRange = () => { if (!holdingRange) return; holdingRange = false; if (repaintPending) { repaintPending = false; paintAll(); } };
  document.addEventListener('pointerdown', (e) => { if (e.target && e.target.matches && e.target.matches('input[type=range]')) holdingRange = true; }, true);
  window.addEventListener('pointerup', releaseRange, true); window.addEventListener('pointercancel', releaseRange, true); window.addEventListener('blur', releaseRange);
  // Feed: press and hold to keep feeding (first feed at once, then repeats that speed up). Delegated on the grid and keyed by
  // buddy id, so the repaint after each feed (new level and price) never breaks the hold. Keyboard Enter/Space still feeds once.
  let feedTimer = null, feedId = null, feedBusy = false;
  const stopFeed = () => { clearTimeout(feedTimer); feedTimer = null; feedId = null; };
  async function feedOnce(id) {
    if (feedBusy) return true; feedBusy = true;
    try {
      const r = await window.buddy.feed(id);
      if (r && !r.ok) { const b = document.querySelector('[data-feed="' + id + '"]'); if (b && r.reason === 'poor') flash(b, 'Not enough ⚡'); return false; }
      return true;
    } catch { return false; } finally { feedBusy = false; }
  }
  function feedLoop(id, delay) {
    feedTimer = setTimeout(async () => { if (feedId !== id) return; const ok = await feedOnce(id); if (ok && feedId === id) feedLoop(id, Math.max(60, delay * 0.85)); else stopFeed(); }, delay);
  }
  const grid = $('#buddyGrid');
  grid.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('[data-feed]'); if (!b || b.disabled || e.button !== 0) return;
    e.preventDefault(); stopFeed(); const id = b.dataset.feed; feedId = id;
    feedOnce(id).then((ok) => { if (ok && feedId === id) feedLoop(id, 380); else stopFeed(); });
  });
  window.addEventListener('pointerup', stopFeed, true); window.addEventListener('pointercancel', stopFeed, true); window.addEventListener('blur', stopFeed);
  grid.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-feed]'); if (b && !b.disabled && e.detail === 0) feedOnce(b.dataset.feed); });
  window.buddy.onState((s) => { state = s; if (holdingRange) { repaintPending = true; return; } paintAll(); });
  window.buddy.getState().then((s) => { state = s; paintAll(); });
})();
