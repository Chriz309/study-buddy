'use strict';
// Study tab helpers (pure, no electron, no DOM): clock + labels + which buttons are live, the validated command shape
// used by the IPC handler, and the explainer copy. Loaded by main (require) and by the settings page (window.StudyView).
(function (root) {
  const PRESET_KEYS = ['25/5', '50/10'];
  const ACTIONS = ['start', 'pause', 'resume', 'skip', 'stop'];
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (ms) => { const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000)); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); };
  const phaseLabel = (st) => !st || st.phase === 'idle' ? 'Ready' : st.phase === 'focus' ? 'Focus' : st.long ? 'Long break' : 'Short break';
  // block dots for the 25/5 rhythm: how many focus blocks are finished in the current set of 4 (a long break shows all 4)
  function dots(st) {
    if (!st || st.phase === 'idle' || st.preset !== '25/5') return { done: 0, of: 4, show: false };
    const c = st.cycle || 0, inSet = st.phase === 'break' && st.long ? 4 : c % 4;
    return { done: inSet, of: 4, show: true, current: st.phase === 'focus' ? Math.min(4, inSet + 1) : 0 };
  }
  // which controls make sense right now
  function controls(st) {
    const idle = !st || st.phase === 'idle';
    return { start: idle, pause: !idle && !st.paused, resume: !idle && !!st.paused, skip: !idle, stop: !idle };
  }
  // main-side validation of a renderer request: returns { action, preset? } or null
  function parseCommand(action, preset) {
    if (!ACTIONS.includes(action)) return null;
    if (action === 'start') return PRESET_KEYS.includes(preset) ? { action, preset } : null;
    return { action };
  }
  const EXPLAINER = {
    title: 'What is the study timer?',
    intro: 'The Pomodoro method is a simple way to beat procrastination: work with full focus for a short block, then rest. Short blocks feel easy to start, and the breaks keep your brain fresh for the whole evening.',
    rhythm: [
      'Start 25 / 5: focus for 25 minutes, then a 5 minute short break. After 4 focus blocks you get a 15 minute long break.',
      'Start 50 / 10: focus for 50 minutes, then a 10 minute break. Great for deep work like past papers or long readings.',
    ],
    buddyTitle: 'What your buddy does',
    buddy: [
      'Stays calm and quiet while you focus: no antics, no chatter, just reading or sitting beside you.',
      'Shows a small ring on the desktop so you can see the time left at a glance.',
      'Celebrates when a focus block ends and gives you 60 Sparks for every focus minute you finish.',
      'If you stop a block early there is no bonus, so only stop when you really need to.',
    ],
    tipsTitle: 'Tips for a good block',
    tips: [
      'Put your phone away, out of reach.',
      'Pick one task for each block and write it down first.',
      'Stand up, stretch and drink water on your breaks.',
    ],
    tray: 'The tray menu has the same controls: right-click the buddy icon and open Study timer.',
  };
  const allText = () => [EXPLAINER.title, EXPLAINER.intro, ...EXPLAINER.rhythm, EXPLAINER.buddyTitle, ...EXPLAINER.buddy, EXPLAINER.tipsTitle, ...EXPLAINER.tips, EXPLAINER.tray];
  const api = { PRESET_KEYS, ACTIONS, clock, phaseLabel, dots, controls, parseCommand, EXPLAINER, allText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.StudyView = api;
})(typeof window !== 'undefined' ? window : this);
