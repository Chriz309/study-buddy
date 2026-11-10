/* Study section: pomodoro controls with a progress ring, live countdown, stats and a short explainer. State comes from main
   (study view inside the state push, plus a 'study' tick every second while a block runs); commands go over the bridge
   (studyCmd) and main validates them. All styling lives in settings.css. */
(function () {
  const root = document.getElementById('studyRoot'); const SV = window.StudyView;
  if (!root || !SV) return;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let view = null;   // { ...status, stats }
  const li = (a) => a.map(t => '<li>' + esc(t) + '</li>').join('');
  const E = SV.EXPLAINER;
  const R = 90, C = 2 * Math.PI * R;   // progress ring radius and circumference
  root.innerHTML = `
    <div class="st-grid">
      <div class="st-timer card">
        <div class="st-ring idle" id="stRing">
          <svg viewBox="0 0 208 208" aria-hidden="true"><circle class="bg" cx="104" cy="104" r="${R}"></circle><circle class="fg" id="stArc" cx="104" cy="104" r="${R}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="0"></circle></svg>
          <div class="st-mid"><div class="st-phase" id="stPhase">Ready</div><div class="st-clock" id="stClock" role="timer">25:00</div></div>
        </div>
        <div class="st-dots" id="stDots"></div>
        <div class="st-sub" id="stSub"></div>
        <div class="st-btns">
          <button class="btn primary" data-c="start" data-p="25/5">Start 25 / 5</button>
          <button class="btn" data-c="start" data-p="50/10">Start 50 / 10</button>
        </div>
        <div class="st-btns">
          <button class="btn sm" id="stPause" data-c="pause">Pause</button>
          <button class="btn sm" data-c="skip">Skip</button>
          <button class="btn sm" data-c="stop">Stop</button>
        </div>
      </div>
      <div class="card st-stats" id="stStats"></div>
    </div>
    <details class="card st-help">
      <summary><span>${esc(E.title)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
      <div class="body"><p>${esc(E.intro)}</p><ul>${li(E.rhythm)}</ul>
        <h4>${esc(E.buddyTitle)}</h4><ul>${li(E.buddy)}</ul><h4>${esc(E.tipsTitle)}</h4><ul>${li(E.tips)}</ul><p class="hint">${esc(E.tray)}</p></div>
    </details>`;
  const $ = (s) => root.querySelector(s);

  function paintTimer() {
    const st = view || { phase: 'idle', remainingMs: 0 }, idle = st.phase === 'idle', c = SV.controls(st), d = SV.dots(st);
    $('#stPhase').textContent = SV.phaseLabel(st) + (st.paused ? ' (paused)' : '');
    $('#stClock').textContent = SV.clock(idle ? 25 * 60000 : st.remainingMs);
    $('#stClock').classList.toggle('dim', idle || !!st.paused);
    const frac = idle || !st.totalMs ? 1 : Math.min(1, Math.max(0, st.remainingMs / st.totalMs));
    $('#stArc').setAttribute('stroke-dashoffset', (C * (1 - frac)).toFixed(2));
    const ring = $('#stRing'); ring.classList.toggle('idle', idle); ring.classList.toggle('brk', !idle && st.phase !== 'focus');
    $('#stDots').innerHTML = d.show ? Array.from({ length: d.of }, (_, i) => '<span class="dot' + (i < d.done ? ' on' : i + 1 === d.current ? ' now' : '') + '"></span>').join('') +
      '<span class="lbl">Block ' + (d.current || Math.min(d.done + 1, d.of)) + ' of ' + d.of + '</span>' : '';
    $('#stSub').textContent = idle ? 'Pick a rhythm to begin. Your buddy will keep you company.' : st.phase === 'focus' ? 'Stay with one task. Your buddy is being quiet.' : 'Break time. Stand up, stretch, drink some water.';
    root.querySelectorAll('[data-c]').forEach(b => { const k = b.dataset.c; b.disabled = !c[k]; });
    const pb = $('#stPause'); pb.dataset.c = c.resume ? 'resume' : 'pause'; pb.textContent = c.resume ? 'Resume' : 'Pause'; pb.disabled = !(c.pause || c.resume);
  }
  function paintStats() {
    const st = view && view.stats; if (!st) return;
    const row = (k, v, cls) => '<div class="st-row"><span>' + k + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</b></div>';
    $('#stStats').innerHTML = '<h3>Study stats</h3>' + row('Sessions today', st.today) + row('Total sessions', st.total) + row('Daily streak', st.streak + (st.streak === 1 ? ' day' : ' days')) +
      row('Sparks from studying', (st.sparks || 0).toLocaleString() + ' ⚡', 'gold') + '<p class="hint">A finished focus block pays 60 Sparks per minute.</p>';
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-c]'); if (!b || b.disabled) return;
    window.buddy.studyCmd(b.dataset.c, b.dataset.p).then((r) => { if (r && r.study) { view = r.study; paint(); } }).catch(() => {});
  });
  function paint() { paintTimer(); paintStats(); }
  // a light 1 s redraw only while the window is open, the timer is running and this section is on screen (main's tick does the rest)
  window.buddy.onStudy((s) => { view = { ...(view || {}), ...s }; if (root.parentElement.classList.contains('active')) paintTimer(); });
  window.buddy.onState((s) => { view = s.study; paint(); });
  window.buddy.getState().then((s) => { view = s.study; paint(); });
})();
