'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const SV = require('../src/shared/studyview');

test('clock formats mm:ss and clamps', () => {
  assert.equal(SV.clock(25 * 60000), '25:00'); assert.equal(SV.clock(61000), '01:01'); assert.equal(SV.clock(999), '00:01');
  assert.equal(SV.clock(-5), '00:00'); assert.equal(SV.clock(undefined), '00:00'); assert.equal(SV.clock(3600000), '60:00');
});
test('phase labels and block dots', () => {
  assert.equal(SV.phaseLabel({ phase: 'idle' }), 'Ready'); assert.equal(SV.phaseLabel({ phase: 'focus' }), 'Focus');
  assert.equal(SV.phaseLabel({ phase: 'break', long: false }), 'Short break'); assert.equal(SV.phaseLabel({ phase: 'break', long: true }), 'Long break');
  assert.equal(SV.dots({ phase: 'idle' }).show, false); assert.equal(SV.dots({ phase: 'focus', preset: '50/10', cycle: 0 }).show, false);
  assert.deepEqual(SV.dots({ phase: 'focus', preset: '25/5', cycle: 2 }), { done: 2, of: 4, show: true, current: 3 });
  assert.equal(SV.dots({ phase: 'break', long: true, preset: '25/5', cycle: 4 }).done, 4);
});
test('controls are enabled per state', () => {
  assert.deepEqual(SV.controls({ phase: 'idle' }), { start: true, pause: false, resume: false, skip: false, stop: false });
  assert.deepEqual(SV.controls({ phase: 'focus', paused: false }), { start: false, pause: true, resume: false, skip: true, stop: true });
  assert.equal(SV.controls({ phase: 'focus', paused: true }).resume, true);
});
test('parseCommand validates the action and the preset on the main side', () => {
  assert.deepEqual(SV.parseCommand('start', '25/5'), { action: 'start', preset: '25/5' }); assert.deepEqual(SV.parseCommand('stop'), { action: 'stop' });
  for (const bad of [['start', '1/1'], ['start'], ['start', '__proto__'], ['nope'], ['tick'], [undefined], ['constructor']]) assert.equal(SV.parseCommand(...bad), null, bad.join());
  for (const k of SV.PRESET_KEYS) assert.ok(require('../src/main/study').PRESETS[k], k + ' is a real preset');
});
test('explainer copy has no em or en dashes and mentions the key facts', () => {
  const all = SV.allText().join('\n'); assert.ok(!/[–—]/.test(all));
  assert.ok(/60 Sparks/.test(all) && /25/.test(all) && /50/.test(all) && /15 minute/.test(all) && /tray/i.test(all));
  for (const f of ['src/settings/study.js', 'src/shared/studyview.js']) assert.ok(!/[–—]/.test(fs.readFileSync(f, 'utf8')), f);
});
test('study tab is wired: nav button, section, scripts, preload and main handler', () => {
  const html = fs.readFileSync('src/settings/settings.html', 'utf8');
  assert.ok(html.includes('data-tab="study"') && html.includes('id="study"') && html.includes('study.js') && html.includes('studyview.js'));
  assert.ok(html.indexOf('data-tab="care"') < html.indexOf('data-tab="study"') && !html.includes('id="studyStats"'));
  assert.ok(fs.readFileSync('src/main/preload.js', 'utf8').includes("'study:cmd'") && fs.readFileSync('src/main/main.js', 'utf8').includes("ipcMain.handle('study:cmd'"));
});
