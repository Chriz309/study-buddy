'use strict';
// Acceptance rules 1, 2, 3, 5 and "no always-on interval", checked against the SOURCE so a regression cannot slip in unnoticed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { SCRIPT, FORBIDDEN } = require('../src/main/mischief/probe-script');

const ROOT = path.join(__dirname, '..');
const DIRS = [path.join(ROOT, 'src', 'main', 'mischief'), path.join(ROOT, 'src', 'mischief')];
const files = DIRS.flatMap(d => fs.readdirSync(d).filter(f => /\.(js|html)$/.test(f)).map(f => path.join(d, f)));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // comments may explain what we do NOT do

test('the UI Automation probe never calls GetText and contains nothing forbidden (rules 1 and 2)', () => {
  assert.ok(!/GetText/i.test(SCRIPT), 'probe must not contain GetText');
  for (const bad of FORBIDDEN) assert.ok(!SCRIPT.includes(bad), 'probe script contains ' + bad);
  assert.ok(SCRIPT.includes('GetBoundingRectangles') && SCRIPT.includes('IsPassword'), 'asks for rectangles only and checks IsPassword');
  assert.ok(!/\.Current\.Name|\.Value\b|TextPattern\]::Pattern\)\.DocumentRange\.Get/.test(SCRIPT.replace(/\$c\.Name/g, '')), 'does not read names/values of documents');
  assert.ok(!/ValuePattern|LegacyIAccessible|\.GetAttributeValue|\.GetChildren|\.Clone\(/.test(SCRIPT));
});

test('no source file of the mischief system can read text, send input, touch the clipboard, registry, disk or network', () => {
  const banned = [/GetText/i, /SendInput|SendKeys|PostMessage|keybd_event|mouse_event|SetCursorPos|robotjs|nut-js|uiohook/i, /clipboard/i, /\bregedit|winreg|HKEY_/i,
    /writeFile|appendFile|createWriteStream|\.toPNG\(|\.toJPEG\(|\.toBitmap\(\)\.(?:toString)|saveAs|\.savePage/, /require\(['"](?:https?|net|dgram|tls|http2)['"]\)|fetch\(|XMLHttpRequest|WebSocket|net\.request|\.sendBeacon/,
    /EncodedCommand|Invoke-Expression|DownloadString|setIgnoreMouseEvents\(\s*false/, /globalShortcut|powerSaveBlocker/, /iohook|SetWindowsHookEx/i];
  for (const f of files) {
    const s = strip(fs.readFileSync(f, 'utf8')).replace(/GetText.*FORBIDDEN/g, '');
    if (path.basename(f) === 'probe-script.js') continue;   // its FORBIDDEN list names the banned words; the probe script itself is checked above
    for (const re of banned) assert.ok(!re.test(s), `${path.basename(f)} matches ${re}`);
  }
});

test('the only dev-time pixel readback is in memory (host.pixels), and nothing is written next to the log', () => {
  const host = fs.readFileSync(path.join(DIRS[0], 'host.js'), 'utf8');
  assert.ok(/toBitmap\(\)/.test(host) && !/fs\./.test(host) && !/require\('fs'\)/.test(host), 'host: no fs at all');
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main', 'main.js'), 'utf8');
  const block = main.slice(main.indexOf('async function devVerify'), main.indexOf('// --- dev helpers'));
  assert.ok(block.length > 100 && !/writeFile|toPNG|toJPEG/.test(block), 'devVerify compares in memory only');
});

test('the overlay window is click-through, non-focusable, skipTaskbar, screen-saver level, and created per prank only', () => {
  const host = fs.readFileSync(path.join(DIRS[0], 'host.js'), 'utf8');
  for (const needle of ['transparent: true', 'frame: false', 'skipTaskbar: true', 'focusable: false', 'setIgnoreMouseEvents(true)', "setAlwaysOnTop(true, 'screen-saver')", 'showInactive', 'sandbox: true', 'contextIsolation: true']) assert.ok(host.includes(needle), needle);
  assert.ok(!/setIgnoreMouseEvents\(false/.test(host));
  assert.ok(/w\.destroy\(\)/.test(host), 'destroyed after the prank');
  const pre = fs.readFileSync(path.join(ROOT, 'src', 'mischief', 'overlay-preload.js'), 'utf8');
  assert.ok(/ready:|error:/.test(pre) && !/invoke|readFile|require\('fs'\)/.test(pre), 'overlay can only say ready / error');
});

test('Windows only: probe and manager refuse other platforms; no always-on interval was added', () => {
  assert.ok(/process\.platform !== 'win32'/.test(fs.readFileSync(path.join(DIRS[0], 'probe.js'), 'utf8')));
  assert.ok(/platform !== 'win32'|platform === 'win32'/.test(fs.readFileSync(path.join(DIRS[0], 'manager.js'), 'utf8')));
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main', 'main.js'), 'utf8');
  assert.ok(/function initMischief\(\) \{\s*\n?\s*if \(process\.platform !== 'win32'\) return;/.test(main.replace(/\r/g, '')), 'nothing is even created off Windows');
  assert.equal((main.match(/setInterval\(/g) || []).length, 5, 'main.js has the same 5 timers as v0.6: none added for mischief');
  const mgr = fs.readFileSync(path.join(DIRS[0], 'manager.js'), 'utf8');
  assert.equal((mgr.match(/setInterval\(/g) || []).length, 1, 'the manager has exactly one interval: the abort monitor, created per prank and cleared in end()');
  assert.ok(/clearInterval\(mon\)/.test(mgr));
  assert.equal((mgr.match(/setTimeout\(onTimer/g) || []).length, 1, 'one single scheduling timeout');
});

test('default OFF in public builds, ON in dev builds (opt-in)', () => {
  const cat = require('../src/shared/catalog');
  assert.equal(cat.DEFAULTS.settings.deskMischief, null);
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main', 'main.js'), 'utf8');
  assert.ok(/return v == null \? DEV : !!v;/.test(main), 'unset means "dev build only"');
});
