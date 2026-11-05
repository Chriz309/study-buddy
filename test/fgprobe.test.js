'use strict';
// The Windows probe helper (src/main/fgprobe.js): static properties of the script, plus a real run on Windows.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { execFile } = require('child_process');
const probe = require('../src/main/fgprobe');
const fsd = require('../src/main/fullscreen');

test('the probe is per-monitor DPI aware (v2) and asks the shell for the notification state', () => {
  const { CS, LOOP, ONE_SHOT } = probe._test;
  assert.ok(/SetThreadDpiAwarenessContext\(new System\.IntPtr\(-4\)\)/.test(CS), 'physical pixels on every monitor');
  assert.ok(CS.includes('SHQueryUserNotificationState') && CS.includes('EnumWindows') && CS.includes('DwmGetWindowAttribute(h, 13'), 'notification state, z-order walk, cloaked');
  assert.ok(!CS.includes("'"), 'no single quote inside the PowerShell single-quoted string');
  for (const cmd of [LOOP, ONE_SHOT]) assert.ok(cmd.includes('[Win.U]::Snap()'), 'the long-lived loop and the one-shot fallback run the same helper');
});
test('the probe reads geometry, class names and process ids only', () => {
  const { CS } = probe._test;
  for (const bad of ['GetWindowText', 'SendMessage', 'PostMessage', 'SetForegroundWindow', 'SetWindowPos', 'ShowWindow', 'SendInput', 'ReadProcessMemory']) assert.ok(!CS.includes(bad), bad);
});
test('main.js: no fgEmpty un-hide, whole-rect DIP conversion for ledges, update popup waits, antics blocked on any fullscreen display', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  assert.ok(!main.includes('fgEmpty') && !main.includes('clearFullscreen'), 'two failed probes no longer un-hide the sprite');
  assert.ok(main.includes('screen.screenToDipRect(null,') && !main.includes('screenToDipPoint'), 'no corner conversion');
  assert.ok(/if \(fsDisplays\.size\) \{ pendingPopup = \{ version \}/.test(main), 'update popup deferral');
  assert.ok(main.includes("if (fsDisplays.size) return 'fullscreen';"), 'antics blocked on any covered display');
  assert.ok(main.includes('mischief.stop(\'fullscreen\')'), 'a running prank stops at once');
});

test('Windows: a real probe run parses, has windows and a notification state', { skip: process.platform !== 'win32' }, async () => {
  const out = await new Promise((resolve) => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', probe._test.ONE_SHOT], { timeout: 20000, windowsHide: true },
    (err, so) => resolve(err ? null : String(so).trim())));
  const p = fsd.parseProbe(out);
  assert.ok(p, 'probe output parses: ' + String(out).slice(0, 200));
  assert.ok(p.windows.length > 0 && Number.isFinite(p.ns));
  assert.ok(p.windows.every(w => w.rect.w >= 100 && w.rect.h >= 100 && w.visible && !w.iconic));
});
