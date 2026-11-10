'use strict';
// Windows foreground-window + fullscreen probe.
//
// Before: a brand-new PowerShell process was started every 1.5 s, and each one
// re-compiled the Win32 helper (Add-Type), roughly 0.3–1 s of CPU every poll,
// which drains laptop batteries.
// Now: ONE long-lived PowerShell compiles the helper once, then answers each
// request we write to its stdin. It costs ~nothing between polls and exits by
// itself when its stdin closes (i.e. when Study Buddy quits).
// If the long-lived process can't be used, we fall back to the original
// one-shot method, so window-awareness keeps working either way.
const { spawn, execFile } = require('child_process');
const path = require('path');
// absolute path: never a PATH lookup (same rule as mischief/probe.js)
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

// The C# helper (compiled once by Add-Type). Snap() is per-monitor DPI aware (SetThreadDpiAwarenessContext(-4)), so every rectangle it
// reports is in PHYSICAL pixels, whatever monitor the window is on (a DPI-unaware GetWindowRect returned scaled-down values for windows on a
// 125% monitor). It returns ONE line, parsed by fullscreen.parseProbe:
//   "l,t,r,b|class|pid|ns|w1;w2;..."   foreground window, SHQueryUserNotificationState, then the z-ordered window list (top first):
//   each "l,t,r,b,flags,pid,class". Nothing here reads window titles or contents, only geometry, class names and process ids.
// No single quotes in the C#: it lives inside a PowerShell single-quoted string.
const CS = [
  'public delegate bool EP(System.IntPtr h, System.IntPtr l);',
  '[DllImport("user32.dll")] static extern bool EnumWindows(EP p, System.IntPtr l);',
  '[DllImport("user32.dll")] static extern bool IsWindowVisible(System.IntPtr h);',
  '[DllImport("user32.dll")] static extern bool IsIconic(System.IntPtr h);',
  '[DllImport("user32.dll")] static extern bool IsZoomed(System.IntPtr h);',
  '[DllImport("user32.dll")] static extern bool GetWindowRect(System.IntPtr h, out RECT r);',
  '[DllImport("user32.dll")] static extern int GetClassName(System.IntPtr h, System.Text.StringBuilder s, int m);',
  '[DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint p);',
  '[DllImport("user32.dll")] static extern int GetWindowLong(System.IntPtr h, int i);',
  '[DllImport("user32.dll")] static extern System.IntPtr GetForegroundWindow();',
  '[DllImport("user32.dll")] static extern System.IntPtr SetThreadDpiAwarenessContext(System.IntPtr c);',
  '[DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(System.IntPtr h, int a, out int v, int s);',
  '[DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int s);',
  'public struct RECT { public int left, top, right, bottom; }',
  'static string Cls(System.IntPtr h) { var sb = new System.Text.StringBuilder(256); GetClassName(h, sb, 256); var o = new System.Text.StringBuilder(); foreach (char c in sb.ToString()) o.Append(char.IsLetterOrDigit(c) || ".-_".IndexOf(c) >= 0 ? c : (char)95); return o.ToString(); }',
  'public static string Snap() {',
  '  System.IntPtr old = SetThreadDpiAwarenessContext(new System.IntPtr(-4));',
  '  try {',
  '    var sb = new System.Text.StringBuilder(); RECT r; uint pid; System.IntPtr fg = GetForegroundWindow();',
  '    if (fg != System.IntPtr.Zero && GetWindowRect(fg, out r)) { GetWindowThreadProcessId(fg, out pid); sb.Append(r.left + "," + r.top + "," + r.right + "," + r.bottom + "|" + Cls(fg) + "|" + pid); } else sb.Append("0,0,0,0||0");',
  '    int ns = 0; if (SHQueryUserNotificationState(out ns) != 0) ns = 0;',
  '    sb.Append("|" + ns + "|");',
  '    int n = 0, total = 0;',
  '    EnumWindows((h, l) => {',
  '      total++; if (n >= 80) return false;',
  '      if (!IsWindowVisible(h) || IsIconic(h)) return true;',
  '      RECT w; if (!GetWindowRect(h, out w) || w.right - w.left < 100 || w.bottom - w.top < 100) return true;',
  '      int cl = 0; DwmGetWindowAttribute(h, 13, out cl, 4); if (cl != 0) return true;',
  '      int st = GetWindowLong(h, -16), ex = GetWindowLong(h, -20); uint p; GetWindowThreadProcessId(h, out p);',
  '      int f = 1 | (IsZoomed(h) ? 8 : 0) | ((st & 0xC00000) == 0xC00000 ? 16 : 0) | ((ex & 0x80) != 0 ? 32 : 0) | ((ex & 0x20) != 0 ? 64 : 0) | ((ex & 8) != 0 ? 128 : 0);',
  '      if (n > 0) sb.Append(";");',
  '      sb.Append(w.left + "," + w.top + "," + w.right + "," + w.bottom + "," + f + "," + p + "," + Cls(h)); n++; return true;',
  '    }, System.IntPtr.Zero);',
  '    return total > 0 ? sb.ToString() : "";',
  '  } finally { if (old != System.IntPtr.Zero) SetThreadDpiAwarenessContext(old); }',
  '}',
].join(' ');
const ADD_TYPE = "Add-Type -Namespace Win -Name U -MemberDefinition '" + CS + "'";
// one-shot command (also the fallback when the long-lived helper can't be used)
const ONE_SHOT = ADD_TYPE + ' ; Write-Output ([Win.U]::Snap())';
// long-lived loop: read a request id per line, reply "id#result" and flush
const LOOP = ADD_TYPE + ' ; while ($null -ne ($id = [Console]::In.ReadLine())) { try { $o = [Win.U]::Snap() } catch { $o = "" } ; [Console]::Out.WriteLine("$id#$o"); [Console]::Out.Flush() }';

const FIRST_TIMEOUT = 8000;   // first reply includes the one-time Add-Type compile
const TIMEOUT = 2500;
const MAX_FAILS = 3;          // after this many crashes/timeouts, use the one-shot fallback

let proc = null, buf = '', nextId = 1, answered = 0, fails = 0, stopped = false;
const pending = new Map();    // id -> { cb, timer }

function settle(id, value) {
  const p = pending.get(id); if (!p) return;
  pending.delete(id); clearTimeout(p.timer);
  try { p.cb(value); } catch {}
}
function failAll() { for (const id of [...pending.keys()]) settle(id, null); }

function start(cmd) {
  try {
    proc = spawn(cmd || POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', LOOP],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  } catch { proc = null; fails++; return false; }
  buf = ''; answered = 0;
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
      const k = line.indexOf('#'); if (k < 0) continue;
      // An EMPTY answer means the helper did not compile or threw (Add-Type is blocked on locked-down PCs): that is a failure, not a
      // healthy probe. It used to count as healthy, so fullscreen detection stayed silently off for the whole session.
      const body = line.slice(k + 1);
      answered++; if (body) fails = 0; else fails++;
      settle(Number(line.slice(0, k)), body || null);
      if (!body && fails >= MAX_FAILS) stop(true);
    }
  });
  const dead = () => { if (proc) { proc = null; if (!stopped) fails++; failAll(); } };
  proc.on('exit', dead); proc.on('error', dead);
  proc.stdin.on('error', dead);
  return true;
}

// The fallback starts a whole PowerShell and compiles the helper each time, so it must not run on every poll: after a failure it waits,
// doubling up to ONE_SHOT_MAX_WAIT (a PC where PowerShell is blocked then costs one short-lived process every few minutes, not one every 1.5 s).
const ONE_SHOT_MIN_WAIT = 5000, ONE_SHOT_MAX_WAIT = 5 * 60 * 1000;
let oneShotWait = 0, oneShotNextAt = 0;
const nextWait = (w) => Math.min(ONE_SHOT_MAX_WAIT, w ? w * 2 : ONE_SHOT_MIN_WAIT);
function oneShot(cb, now = Date.now(), run = execFile) {
  if (now < oneShotNextAt) return cb(null);
  oneShotNextAt = now + (oneShotWait || ONE_SHOT_MIN_WAIT);   // never two at once, and never more often than the minimum wait
  run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', ONE_SHOT], { timeout: 6000, windowsHide: true }, (err, stdout) => {
    const out = err || !stdout ? null : String(stdout).trim() || null;
    oneShotWait = out ? 0 : nextWait(oneShotWait); oneShotNextAt = now + (oneShotWait || ONE_SHOT_MIN_WAIT);
    cb(out);
  });
}

// cb(resultString | null)
function query(cb) {
  if (stopped) return cb(null);
  if (fails >= MAX_FAILS) return oneShot(cb);
  if (!proc && !start()) return oneShot(cb);
  const id = nextId++;
  const timer = setTimeout(() => {
    settle(id, null); fails++;
    if (fails >= MAX_FAILS) stop(true);   // give up on the long-lived process
  }, answered ? TIMEOUT : FIRST_TIMEOUT);
  pending.set(id, { cb, timer });
  try { proc.stdin.write(id + '\n'); } catch { settle(id, null); }
}

// quitting: close stdin (PowerShell exits on its own), then make sure it's gone
function stop(keepFallback) {
  if (!keepFallback) stopped = true;
  const p = proc; proc = null; failAll();
  if (!p) return;
  try { p.stdin.end(); } catch {}
  setTimeout(() => { try { p.kill(); } catch {} }, 1500).unref();
}

// after a sleep the helper's pipes can be stale: drop it and start clean on the next query (the fallback back-off starts over too)
function restart() {
  if (stopped) return;
  stop(true); fails = 0; oneShotWait = 0; oneShotNextAt = 0;
}

module.exports = { query, stop, restart, _test: { start, oneShot, nextWait, LOOP, ONE_SHOT, CS, POWERSHELL, ONE_SHOT_MIN_WAIT, ONE_SHOT_MAX_WAIT,
  reset: () => { oneShotWait = 0; oneShotNextAt = 0; fails = 0; }, state: () => ({ fails, answered, alive: !!proc, oneShotWait, oneShotNextAt }) } };
