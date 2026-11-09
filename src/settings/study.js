/* Study tab: pomodoro controls, live countdown, stats and a short explainer. State comes from main (study view inside the
   state push, plus a 'study' tick every second while a block runs); commands go over the bridge (studyCmd) and main validates them. */
(function () {
  const root = document.getElementById('studyRoot'); const SV = window.StudyView;
  if (!root || !SV) return;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let view = null;   // { ...status, stats }
  const li = (a) => a.map(t => '<li>' + esc(t) + '</li>').join('');
  const E = SV.EXPLAINER;
  root.innerHTML = `
    <div class="st-timer card"><div class="st-phase" id="stPhase">Ready</div><div class="st-clock" id="stClock">25:00</div>
      <div class="st-dots" id="stDots"></div><div class="st-sub" id="stSub"></div>
      <div class="st-btns"><button class="act" data-c="start" data-p="25/5">Start 25 / 5</button><button class="act" data-c="start" data-p="50/10">Start 50 / 10</button>
        <button class="act ghost" id="stPause" data-c="pause">Pause</button><button class="act ghost" data-c="skip">Skip</button><button class="act ghost" data-c="stop">Stop</button></div></div>
    <div class="card st-stats" id="stStats"></div>
    <div class="card st-help"><h3>${esc(E.title)}</h3><p>${esc(E.intro)}</p><ul>${li(E.rhythm)}</ul>
      <h4>${esc(E.buddyTitle)}</h4><ul>${li(E.buddy)}</ul><h4>${esc(E.tipsTitle)}</h4><ul>${li(E.tips)}</ul><p class="hint" style="margin:8px 0 0">${esc(E.tray)}</p></div>`;
  const $ = (s) => root.querySelector(s);

  function paintTimer() {
    const st = view || { phase: 'idle', remainingMs: 0 }, idle = st.phase === 'idle', c = SV.controls(st), d = SV.dots(st);
    $('#stPhase').textContent = SV.phaseLabel(st) + (st.paused ? ' (paused)' : '');
    $('#stClock').textContent = SV.clock(idle ? 25 * 60000 : st.remainingMs);
    $('#stClock').classList.toggle('dim', idle || !!st.paused);
    $('#stDots').innerHTML = d.show ? Array.from({ length: d.of }, (_, i) => '<span class="dot' + (i < d.done ? ' on' : i + 1 === d.current ? ' now' : '') + '"></span>').join('') +
      '<span class="lbl">Block ' + (d.current || Math.min(d.done + 1, d.of)) + ' of ' + d.of + '</span>' : '';
    $('#stSub').textContent = idle ? 'Pick a rhythm to begin. Your buddy will keep you company.' : st.phase === 'focus' ? 'Stay with one task. Your buddy is being quiet.' : 'Break time. Stand up, stretch, drink some water.';
    root.querySelectorAll('[data-c]').forEach(b => { const k = b.dataset.c; b.disabled = !c[k]; });
    const pb = $('#stPause'); pb.dataset.c = c.resume ? 'resume' : 'pause'; pb.textContent = c.resume ? 'Resume' : 'Pause'; pb.disabled = !(c.pause || c.resume);
  }
  function paintStats() {
    const st = view && view.stats; if (!st) return;
    const row = (k, v) => '<div class="st-row"><span>' + k + '</span><b>' + v + '</b></div>';
    $('#stStats').innerHTML = '<h3>Study stats</h3>' + row('Sessions today', st.today) + row('Total sessions', st.total) + row('Daily streak', st.streak + (st.streak === 1 ? ' day' : ' days')) +
      row('Sparks earned from studying', (st.sparks || 0).toLocaleString() + ' ⚡') + '<p class="hint" style="margin:8px 0 0">A finished focus block pays 60 Sparks per minute.</p>';
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-c]'); if (!b || b.disabled) return;
    window.buddy.studyCmd(b.dataset.c, b.dataset.p).then((r) => { if (r && r.study) { view = r.study; paint(); } }).catch(() => {});
  });
  function paint() { paintTimer(); paintStats(); }
  // a light 1 s redraw only while the window is open, the timer is running and this tab is on screen (main's tick does the rest)
  window.buddy.onStudy((s) => { view = { ...(view || {}), ...s }; if (root.parentElement.classList.contains('active')) paintTimer(); });
  window.buddy.onState((s) => { view = s.study; paint(); });
  window.buddy.getState().then((s) => { view = s.study; paint(); });
})();
