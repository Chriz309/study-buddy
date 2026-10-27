/* Shop & Settings window logic. Reads the authoritative state from main and
   sends mutations back over the preload bridge; main re-broadcasts state so
   this view and the overlay stay in sync. */
(function () {
  const $ = (s) => document.querySelector(s);
  const EMOJI = { blob:'🫧', pib:'🐱', chirp:'🐤', boo:'👻', quack:'🦆', finn:'🐬', axo:'🦎',
                  jelly:'🎐', fox:'🦊', octo:'🐙', cog:'⚙️', ember:'🐲', zrk:'👽' };
  const feedCost = (lvl) => 50 * (lvl + 1);
  let state = null;

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
  function paintWallet() {
    if (!state) return;
    $('#sparks').textContent = fmt(state.sparks);
    $('#rate').textContent = '+' + (state.rate || 1).toFixed(1) + ' / sec';
  }

  // ---- shop ----
  function paintShop() {
    const grid = $('#shopGrid'); grid.innerHTML = '';
    for (const c of state.catalog) {
      const owned = state.owned.includes(c.id);
      const active = state.active === c.id;
      const afford = state.sparks >= c.cost;
      const card = document.createElement('div');
      card.className = 'card' + (active ? ' active-c' : '') + (owned ? '' : ' locked');
      const badge = active ? '<span class="badge on">Active</span>'
                   : owned ? '<span class="badge on">Owned</span>'
                   : !c.implemented ? '<span class="badge">Soon</span>' : '';
      let foot;
      if (owned && active)      foot = `<button class="act ghost" disabled>In use</button>`;
      else if (owned)           foot = `<button class="act" data-use="${c.id}">Set active</button>`;
      else if (!c.implemented)  foot = `<button class="act ghost" disabled>Coming soon</button>`;
      else                      foot = `<button class="act" data-buy="${c.id}" ${afford?'':'disabled'}>Unlock · <span class="cost">${c.cost}⚡</span></button>`;
      const rar = (state.rarities && state.rarities[c.rarity]) || { label: c.rarity, color: '#9aa4b2' };
      const moveLabel = { walk:'walks', float:'floats', fly:'flies', swim:'swims' }[c.move] || c.move;
      card.innerHTML = `
        <div class="pre">${EMOJI[c.id] || '⭐'}</div>
        <h3>${c.name} ${badge}</h3>
        <div class="chips">
          <span class="chip" style="color:${rar.color};background:${rar.color}22">${rar.label}</span>
          <span class="chip">${moveLabel}</span>
        </div>
        <p class="blurb">${c.blurb}</p>
        <div class="foot">${foot}</div>`;
      grid.appendChild(card);
    }
    grid.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', async () => {
      const r = await window.buddy.unlock(b.dataset.buy);
      if (!r.ok && r.reason === 'poor') flash(b, 'Not enough ⚡');
    }));
    grid.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => window.buddy.setActive(b.dataset.use)));
  }

  // ---- care (feeding) ----
  function paintCare() {
    const grid = $('#careGrid'); grid.innerHTML = '';
    const owned = state.catalog.filter(c => state.owned.includes(c.id));
    for (const c of owned) {
      const lvl = (state.levels && state.levels[c.id]) || 0;
      const cost = feedCost(lvl);
      const afford = state.sparks >= cost;
      const card = document.createElement('div');
      card.className = 'card' + (state.active === c.id ? ' active-c' : '');
      card.innerHTML = `
        <div class="pre">${EMOJI[c.id] || '⭐'}</div>
        <h3>${c.name}</h3>
        <div class="lvl">Level ${lvl} · +${(0.1 * lvl).toFixed(1)}⚡/s bonus</div>
        <p class="blurb">Feeding raises its level and your earn rate.</p>
        <div class="foot">
          <button class="act" data-feed="${c.id}" ${afford?'':'disabled'}>Feed · <span class="cost">${cost}⚡</span></button>
        </div>`;
      grid.appendChild(card);
    }
    grid.querySelectorAll('[data-feed]').forEach(b => b.addEventListener('click', async () => {
      const r = await window.buddy.feed(b.dataset.feed);
      if (r && !r.ok && r.reason === 'poor') flash(b, 'Not enough ⚡');
    }));
  }

  function flash(btn, msg) {
    const old = btn.innerHTML; btn.innerHTML = msg;
    setTimeout(() => { btn.innerHTML = old; }, 1100);
  }

  // ---- behaviour ----
  const SIZES = [{v:80,l:'S'},{v:120,l:'M'},{v:170,l:'L'},{v:220,l:'XL'}];
  function paintBehaviour() {
    const s = state.settings;
    const rows = $('#behaviourRows');
    rows.innerHTML = `
      ${rowSelect('Personality', 'How your buddy acts day to day.', 'personality',
          state.personalities.map(p => [p, cap(p)]), s.personality)}
      ${rowRange('Mischief', 'Higher = more cheeky antics (climbing, peeking, jumping).', 'mischief', 0, 100, 5, s.mischief, '%')}
      ${rowRange('Speed', 'How fast it moves around.', 'speed', 0.4, 2, 0.1, s.speed, '×')}
      ${rowSelect('Size', 'How big it appears on screen.', 'size', SIZES.map(x => [x.v, x.l]), s.size)}
      ${rowToggle('Speech bubbles', 'Let it say things now and then.', 'speech', s.speech)}
      ${rowRange('Chattiness', 'How often it speaks up (floaty pets talk less).', 'chatter', 0, 1, 0.1, (s.chatter==null?0.6:s.chatter), '')}
      ${rowToggle('Reduce motion', 'Calmer, minimal animation.', 'reduceMotion', s.reduceMotion)}
      ${rowToggle('Roam across all monitors', 'Let it cross to other screens (may flicker on some setups).', 'roamMonitors', s.roamMonitors)}
      ${rowToggle('Pause idle points', 'Stop earning Sparks and settle down.', 'paused', s.paused)}
      ${rowToggle('Start on system boot', 'Launch quietly when you log in.', 'startOnBoot', s.startOnBoot)}
    `;
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
        downloaded:'Update ready — restart to apply.', error:'Could not check right now.' };
      st.textContent = map[u.status] || '';
    }
  }
  $('#checkUpdate').addEventListener('click', () => { window.buddy.checkUpdate(); $('#updateStatus').textContent = 'Checking…'; });
  $('#mail').addEventListener('dblclick', () => window.buddy.openEmail());
  { const wa = $('#wa'); if (wa) wa.addEventListener('dblclick', () => window.buddy.openWhatsApp()); }

  // ---- wire state ----
  function paintAll() {
    paintWallet(); paintShop(); paintCare(); paintBehaviour(); paintAbout();
    $('#aboutVer').textContent = 'version ' + (state.appVersion || '—');
  }
  window.buddy.onSparks((n) => {
    if (!state) return; state.sparks = n; paintWallet();
    // keep buy/feed affordability fresh without a full repaint storm
    document.querySelectorAll('[data-buy]').forEach(b => {
      const c = state.catalog.find(x => x.id === b.dataset.buy); if (c) b.disabled = state.sparks < c.cost;
    });
  });
  window.buddy.onState((s) => { state = s; paintAll(); });
  window.buddy.getState().then((s) => { state = s; paintAll(); });
})();
