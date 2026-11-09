/* Shop & Settings window logic. Reads the authoritative state from main and
   sends mutations back over the preload bridge; main re-broadcasts state so
   this view and the overlay stay in sync. */
(function () {
  const $ = (s) => document.querySelector(s);
  const EMOJI = { blob:'🫧', ghost:'👻', cat:'🐱', chirp:'🐤', quack:'🦆', finn:'🐬', axo:'🦎',
                  jelly:'🎐', fox:'🦊', octo:'🐙', cog:'⚙️', ember:'🐲', zrk:'👽', hero:'🦸', wizard:'🧙' };
  const feedCost = (lvl) => 50 * (lvl + 1);
  // colour presets = hue-rotate degrees applied to the sprite; swatch previews the real tint
  const PALETTE = [0, 45, 90, 140, 190, 250, 300];
  const SWBASE = '#2fa8ff';
  const CAT_SWATCHES = [{key:'ginger',label:'Ginger',dot:'#f0a04b'},{key:'grey',label:'Grey',dot:'#9aa0a6'},{key:'black',label:'Black',dot:'#3a3a3f'},{key:'white',label:'White',dot:'#eceae4'}];
  let state = null;
  const displayName = (c) => (state.names && state.names[c.id]) || c.name;
  const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // ---- tabs ----
  document.querySelectorAll('#tabs button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#tabs button').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); $('#' + b.dataset.tab).classList.add('active');
    });
  });

  // ---- wallet ----
  function fmt(n) { return Math.floor(n).toLocaleString(); }
  const affordable = (cost) => !!state && (state.infiniteSparks === true || state.sparks >= cost);
  function paintWallet() {
    if (!state) return;
    $('#sparks').textContent = state.infiniteSparks ? '∞' : fmt(state.sparks);   // dev builds: Sparks never run out
    $('#rate').textContent = '+' + (state.rate || 1).toFixed(1) + ' / sec';
  }

  // ---- gumball machine (gacha) ----
  const BALL_COLORS = ['#ff7a90','#ffd23f','#53d6ff','#54e0a0','#c08bff','#ff9f4f','#7ad1ff'];
  function buildDome() {
    const dome = $('#gmDome'); if (!dome || dome._built) return; dome._built = true;
    // a little pile of gumballs in the lower half of the dome
    const spots = [[18,70],[44,78],[70,74],[32,54],[58,56],[84,64],[46,40],[72,42],[24,88],[60,86],[86,84],[8,86]];
    spots.forEach((p, i) => {
      const b = document.createElement('span'); b.className = 'ball';
      b.style.left = p[0] + 'px'; b.style.top = p[1] + 'px';
      b.style.background = `radial-gradient(circle at 35% 30%, #fff8, ${BALL_COLORS[i % BALL_COLORS.length]} 60%)`;
      dome.appendChild(b);
    });
  }
  function paintGumball() {
    buildDome();
    const cost = state.gumballCost || 500;
    const pool = state.gumballPool || [];
    $('#gmCost').textContent = cost.toLocaleString() + '⚡';
    const crank = $('#gmCrank'), desc = $('#gmDesc'), res = $('#gmResult');
    if (pool.length === 0) {
      crank.disabled = true;
      desc.textContent = 'You’ve adopted every friend available right now, more are on the way! 🎉';
      if (!res.querySelector('.gm-reveal')) { res.textContent = 'Collection complete'; res.classList.add('none'); }
    } else {
      crank.disabled = !affordable(cost);
      desc.textContent = `Crank the handle to adopt a random new buddy you don’t own yet, ${pool.length} still hiding inside.`;
    }
  }
  let rolling = false;
  function setResult(msg, muted) { const r = $('#gmResult'); r.textContent = msg; r.classList.toggle('none', !!muted); }
  function reveal(r) {
    const em = EMOJI[r.got] || '⭐';
    $('#gmResult').classList.remove('none');
    $('#gmResult').innerHTML = `<span class="gm-reveal"><span class="em">${em}</span> You adopted <b>${r.name}</b>! It’s now your active buddy.</span>`;
  }
  function wireCrank() {
    const crank = $('#gmCrank'); if (!crank || crank._wired) return; crank._wired = true;
    crank.addEventListener('click', async () => {
      if (rolling || crank.disabled) return;
      const pool = state.gumballPool || [];
      if (pool.length === 0) return;
      if (!affordable(state.gumballCost || 500)) { setResult('Not enough ⚡, keep studying!', true); return; }
      rolling = true; $('#gumball').classList.add('spin'); setResult('…', true);
      let r; try { r = await window.buddy.roll(); } catch { r = null; }
      setTimeout(() => {
        $('#gumball').classList.remove('spin'); rolling = false;
        if (r && r.ok) reveal(r);
        else if (r && r.reason === 'complete') setResult('You’ve collected them all! 🎉', true);
        else if (r && r.reason === 'poor') setResult('Not enough ⚡', true);
        else setResult('Something went wrong, try again.', true);
      }, 750);
    });
  }

  // ---- collection ----
  function paintShop() {
    paintGumball();
    const grid = $('#shopGrid'); grid.innerHTML = '';
    // owned first, then hidden (implemented but not yet rolled), then future "soon"
    const order = [...state.catalog].sort((a, b) => {
      const rank = (c) => state.owned.includes(c.id) ? 0 : c.implemented ? 1 : 2;
      return rank(a) - rank(b);
    });
    for (const c of order) {
      const owned = state.owned.includes(c.id);
      const active = state.active === c.id;
      const tierLocked = !owned && (state.lockedIds || []).includes(c.id);
      const card = document.createElement('div');
      card.className = 'card' + (active ? ' active-c' : '') + (owned ? '' : ' locked') + (c.rarity === 'legendary' ? ' legendary' : '');
      const badge = active ? '<span class="badge on">Active</span>'
                   : owned ? '<span class="badge on">Owned</span>'
                   : !c.implemented ? '<span class="badge">Soon</span>'
                   : tierLocked ? '<span class="badge">Locked</span>'
                   : '<span class="badge">In the machine</span>';
      let foot;
      if (owned && active)      foot = `<button class="act ghost" disabled>In use</button>`;
      else if (owned)           foot = `<button class="act" data-use="${c.id}">Set active</button>`;
      else if (!c.implemented)  foot = `<button class="act ghost" disabled>Coming soon</button>`;
      else if (tierLocked)      foot = `<button class="act ghost" disabled>🔒 Adopt every Tier ${(c.tier || 2) - 1} buddy first</button>`;
      else                      foot = `<button class="act ghost" disabled>🎰 Crank to adopt</button>`;
      const rar = (state.rarities && state.rarities[c.rarity]) || { label: c.rarity, color: '#9aa4b2' };
      const moveLabel = { walk:'walks', float:'floats', fly:'flies', swim:'swims' }[c.move] || c.move;
      const mystery = !owned && c.implemented;         // hide identity of friends still in the machine
      const pre = owned ? (EMOJI[c.id] || '⭐') : '❔';
      card.innerHTML = `
        <div class="pre">${pre}</div>
        <h3>${owned ? esc(displayName(c)) : (c.implemented ? '???' : c.name)} ${badge}</h3>
        <div class="chips">
          <span class="chip" style="color:${rar.color};background:${rar.color}22">${rar.label}</span>
          <span class="chip">${moveLabel}</span>
        </div>
        <p class="blurb">${owned ? c.blurb : (tierLocked ? 'A rare Tier ' + (c.tier || 2) + ' friend. Adopt every Tier ' + ((c.tier || 2) - 1) + ' buddy and it joins the gumball machine.' : mystery ? 'A mystery friend waiting in the gumball machine.' : c.blurb)}</p>
        <div class="foot">${foot}</div>`;
      grid.appendChild(card);
    }
    grid.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => window.buddy.setActive(b.dataset.use)));
  }

  // ---- care (feeding) ----
  function paintCare() {
    const grid = $('#careGrid'); grid.innerHTML = '';
    const owned = state.catalog.filter(c => state.owned.includes(c.id));
    for (const c of owned) {
      const lvl = (state.levels && state.levels[c.id]) || 0;
      const cost = feedCost(lvl);
      const afford = affordable(cost);
      const card = document.createElement('div');
      card.className = 'card' + (state.active === c.id ? ' active-c' : '');
      let swatches;
      if (c.id === 'cat') { const cur = (state.colors && state.colors[c.id]) || 'ginger';
        swatches = CAT_SWATCHES.map(s =>
          `<button class="sw${s.key === cur ? ' on' : ''}" style="background:${s.dot}" title="${s.label}" data-col="${c.id}" data-catcol="${s.key}"></button>`).join('');
      } else { const curHue = (state.colors && state.colors[c.id]) || 0;
        swatches = PALETTE.map(h =>
          `<button class="sw${h === curHue ? ' on' : ''}" style="background:${SWBASE};filter:hue-rotate(${h}deg)" title="${h === 0 ? 'Original' : 'Tint'}" data-col="${c.id}" data-hue="${h}"></button>`).join('');
      }
      card.innerHTML = `
        <div class="pre">${EMOJI[c.id] || '⭐'}</div>
        <input class="nameedit" data-name="${c.id}" value="${esc(displayName(c))}" maxlength="18" spellcheck="false" />
        <div class="lvl">Level ${lvl} · +${(0.1 * lvl).toFixed(1)}⚡/s bonus</div>
        <div class="swlabel">Colour</div>
        <div class="swatches">${swatches}</div>
        ${(state.devTools && c.id !== 'blob') ? `<button class="sell" data-sell="${c.id}">🧪 Sell (dev)</button>` : ''}
        <div class="foot">
          <button class="act" data-feed="${c.id}" ${afford?'':'disabled'}>Feed · <span class="cost">${cost}⚡</span></button>
        </div>`;
      grid.appendChild(card);
    }
    // feeding (click, and press-and-hold to repeat) is wired once on #careGrid at the bottom of this file
    grid.querySelectorAll('.nameedit').forEach(inp => {
      const commit = () => window.buddy.rename(inp.dataset.name, inp.value);
      inp.addEventListener('change', commit);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    });
    grid.querySelectorAll('.sw').forEach(b => b.addEventListener('click', () =>
      window.buddy.setColor(b.dataset.col, b.dataset.catcol !== undefined ? b.dataset.catcol : +b.dataset.hue)));
    grid.querySelectorAll('[data-sell]').forEach(b => b.addEventListener('click', () => window.buddy.devSell(b.dataset.sell)));
  }

  function flash(btn, msg) {
    const old = btn.innerHTML; btn.innerHTML = msg;
    setTimeout(() => { btn.innerHTML = old; }, 1100);
  }

  // ---- behaviour ----
  const SIZES = [{v:34,l:'Tiny'},{v:50,l:'XS'},{v:72,l:'S'},{v:110,l:'M'},{v:160,l:'L'},{v:220,l:'XL'}];
  function sizeOpts(cur){ const o = SIZES.map(x => [x.v, x.l]); if (!SIZES.some(x => x.v === cur)) o.unshift([cur, cur + 'px']); return o; }
  function paintBehaviour() {
    const s = state.settings;
    const rows = $('#behaviourRows');
    rows.innerHTML = `
      ${rowSelect('Personality', 'How your buddy acts day to day.', 'personality',
          state.personalities.map(p => [p, cap(p)]), s.personality)}
      ${rowRange('Mischief', 'Higher = livelier: more climbing, peeking and jumping, and special antics more often.', 'mischief', 0, 100, 5, s.mischief, '%')}
      ${rowRange('Speed', 'How fast it moves around.', 'speed', 0.4, 2, 0.1, s.speed, '×')}
      ${rowSelect('Size', 'How big it appears on screen.', 'size', sizeOpts(s.size), s.size)}
      ${rowToggle('Stay in one spot', 'Naughty corner: stops roaming, just idle animations, little hops and reactions where it stands.', 'stayPut', s.stayPut)}
      ${rowToggle('Special antics', 'Every buddy has its own: Pib chases a butterfly, Captain Cram flies a patrol, Blob scales the wall or goes on a bounce spree, Boo dashes through walls or swoops. Happens more often the higher Mischief is. Never in fullscreen.', 'antics', s.antics !== false)}
      ${state.platform === 'win32' ? rowToggle('Desktop mischief', 'Now and then your buddy appears to play with your taskbar, icons and windows. Only a drawn illusion on top: nothing is ever moved, clicked or typed, and it stops the moment you come near. Windows only.', 'deskMischief', !!state.mischiefOn) + rowSelect('Mischief frequency', 'How often the desktop pranks happen.', 'deskMischiefFreq', [['rare', 'Rare'], ['normal', 'Normal'], ['chaos', 'Chaos']], s.deskMischiefFreq || 'normal') : ''}
      ${rowToggle('Speech bubbles', 'Let it say things now and then.', 'speech', s.speech)}
      ${rowRange('Chattiness', 'How often it speaks up (floaty pets talk less).', 'chatter', 0, 1, 0.1, (s.chatter==null?0.6:s.chatter), '')}
      ${rowToggle('Reduce motion', 'Calmer, minimal animation.', 'reduceMotion', s.reduceMotion)}
      ${rowToggle('Show all my buddies', 'Every buddy you own roams the desktop at once (up to 4 besides your main one). The extras are calmer: they wander, nap and play simple antics, but no desktop pranks. Needs more than one buddy.', 'showAll', !!s.showAll)}
      ${rowPick(s)}
      ${rowToggle('Roam across all monitors', 'Let it cross to other screens (may flicker on some setups).', 'roamMonitors', s.roamMonitors)}
      ${rowToggle('Pause idle points', 'Stop earning Sparks and settle down.', 'paused', s.paused)}
      ${rowToggle('Start on system boot', 'Launch quietly when you log in.', 'startOnBoot', s.startOnBoot)}
    `;
    rows.querySelectorAll("[data-showpick]").forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.showpick, hide = Array.isArray(state.settings.hideBuddies) ? state.settings.hideBuddies.slice() : [];
      const i = hide.indexOf(id); if (i >= 0) hide.splice(i, 1); else hide.push(id);
      window.buddy.patchSettings({ hideBuddies: hide });
    }));
    rows.querySelectorAll('[data-set]').forEach(el => {
      const key = el.dataset.set;
      const evt = el.type === 'checkbox' ? 'change' : (el.tagName === 'SELECT' ? 'change' : 'input');
      el.addEventListener(evt, () => {
        let v;
        if (el.type === 'checkbox') v = el.checked;
        else if (el.type === 'range') v = key === 'mischief' ? parseInt(el.value,10) : parseFloat(el.value);
        else v = isNaN(+el.value) ? el.value : +el.value;
        const near = el.parentElement.querySelector('.val');
        if (near) near.textContent = key === 'mischief' ? v + '%' : key === 'speed' ? v.toFixed(1) + '×' : key === 'chatter' ? Math.round(v*100) + '%' : v;
        window.buddy.patchSettings({ [key]: v });
      });
    });
  }
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  function rowRange(label, sub, key, min, max, step, val, unit) {
    const disp = key === 'speed' ? (+val).toFixed(1) + unit : key === 'chatter' ? Math.round(val*100) + '%' : val + unit;
    return `<div class="row"><div><div class="label">${label}</div><div class="sub">${sub}</div></div>
      <div class="ctrl"><input type="range" data-set="${key}" min="${min}" max="${max}" step="${step}" value="${val}">
      <span class="val">${disp}</span></div></div>`;
  }
  function rowSelect(label, sub, key, opts, val) {
    const o = opts.map(([v,l]) => `<option value="${v}" ${String(v)===String(val)?'selected':''}>${l}</option>`).join('');
    return `<div class="row"><div><div class="label">${label}</div><div class="sub">${sub}</div></div>
      <div class="ctrl"><select data-set="${key}">${o}</select></div></div>`;
  }
  // multi-pet: pick which of your OTHER owned buddies come out (your main buddy is always shown). Only owned ones are listed.
  function rowPick(s) {
    const others = state.catalog.filter(c => state.owned.includes(c.id) && c.id !== state.active);
    if (!s.showAll || !others.length) return '';
    const hide = Array.isArray(s.hideBuddies) ? s.hideBuddies : [];
    const chips = others.map(c => `<button class="pickb${hide.includes(c.id) ? '' : ' on'}" data-showpick="${c.id}" title="${hide.includes(c.id) ? 'Staying home' : 'Out and about'}">${EMOJI[c.id] || '⭐'} ${esc(displayName(c))}</button>`).join('');
    return `<div class="row"><div><div class="label">Which buddies come out</div><div class="sub">Tap a buddy to keep it home or bring it out. Your main buddy is always out.</div></div>
      <div class="ctrl"><div class="pickrow">${chips}</div></div></div>`;
  }
  function rowToggle(label, sub, key, on) {
    return `<div class="row"><div><div class="label">${label}</div><div class="sub">${sub}</div></div>
      <div class="ctrl"><label class="switch"><input type="checkbox" data-set="${key}" ${on?'checked':''}><span class="slider"></span></label></div></div>`;
  }

  // ---- about ----
  function paintAbout() {
    if (state.update) {
      const u = state.update, st = $('#updateStatus');
      const map = { idle:'', checking:'Checking…', current:'You’re up to date.',
        available:'Downloading update ' + (u.info && u.info.version || '') + '…',
        downloaded:'Update ' + (u.info && u.info.version || '') + ' downloaded, ready to install.',
        manual:'Study Buddy ' + (u.info && u.info.version || '') + ' is out!',
        error:'Could not check right now.' };
      st.textContent = map[u.status] || '';
      const inst = $('#installUpdate'), chk = $('#checkUpdate');
      const ready = u.status === 'downloaded' || u.status === 'manual';
      if (inst) { inst.style.display = ready ? '' : 'none'; inst.textContent = u.status === 'manual' ? 'Download update' : 'Restart & update now'; }
      if (chk) chk.style.display = ready ? 'none' : '';
    }
    const hb = $('#ctlHide'); if (hb) { hb.textContent = state.buddyHidden ? '👋 Show' : '🙈 Hide'; hb.title = state.buddyHidden ? 'Show buddy' : 'Hide buddy'; }
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
    paintWallet(); paintShop(); paintCare(); paintBehaviour(); paintAbout();
    $('#aboutVer').textContent = 'current version ' + (state.appVersion || '-');
    const dv = $('#ctlDev'); if (dv) dv.style.display = state.devTools ? '' : 'none';
  }
  window.buddy.onSparks((n) => {
    if (!state) return; state.sparks = n; paintWallet();
    // keep the gumball crank's affordability fresh without a full repaint storm
    const crank = $('#gmCrank'); const pool = state.gumballPool || [];
    if (crank && !rolling) crank.disabled = pool.length === 0 || !affordable(state.gumballCost || 500);
  });
  // A state push rebuilds the page. While a slider is held, hold the repaint until release, or the rebuilt slider drops the drag.
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
    try { const r = await window.buddy.feed(id); if (r && !r.ok) { const b = document.querySelector('[data-feed="' + id + '"]'); if (b && r.reason === 'poor') flash(b, 'Not enough ⚡'); return false; } return true; }
    catch { return false; } finally { feedBusy = false; }
  }
  function feedLoop(id, delay) {
    feedTimer = setTimeout(async () => { if (feedId !== id) return; const ok = await feedOnce(id); if (ok && feedId === id) feedLoop(id, Math.max(60, delay * 0.85)); else stopFeed(); }, delay);
  }
  const careGrid = $('#careGrid');
  careGrid.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('[data-feed]'); if (!b || b.disabled || e.button !== 0) return;
    e.preventDefault(); stopFeed(); const id = b.dataset.feed; feedId = id;
    feedOnce(id).then((ok) => { if (ok && feedId === id) feedLoop(id, 380); else stopFeed(); });
  });
  window.addEventListener('pointerup', stopFeed, true); window.addEventListener('pointercancel', stopFeed, true); window.addEventListener('blur', stopFeed);
  careGrid.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-feed]'); if (b && !b.disabled && e.detail === 0) feedOnce(b.dataset.feed); });
  window.buddy.onState((s) => { state = s; if (holdingRange) { repaintPending = true; return; } paintAll(); });
  window.buddy.getState().then((s) => { state = s; paintAll(); });
})();
