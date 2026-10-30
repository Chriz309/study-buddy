'use strict';
// Windows foreground-window probe.
//
// Before: a brand-new PowerShell process was started every 1.5 s, and each one
// re-compiled the Win32 helper (Add-Type) — roughly 0.3–1 s of CPU every poll,
// which drains laptop batteries.
// Now: ONE long-lived PowerShell compiles the helper once, then answers each
// request we write to its stdin. It costs ~nothing between polls and exits by
// itself when its stdin closes (i.e. when Study Buddy quits).
// If the long-lived process can't be used, we fall back to the original
// one-shot method, so window-awareness keeps working either way.
const { spawn, execFile } = require('child_process');

const ADD_TYPE = 'Add-Type -Namespace Win -Name U -MemberDefinition \'[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r); [DllImport("user32.dll")] public static extern int GetClassName(System.IntPtr h, System.Text.StringBuilder s, int m); public struct RECT { public int left, top, right, bottom; }\'';
// one probe -> "left,top,right,bottom|ClassName"
const PROBE = '$h=[Win.U]::GetForegroundWindow(); $r=New-Object Win.U+RECT; [void][Win.U]::GetWindowRect($h,[ref]$r); $sb=New-Object System.Text.StringBuilder 256; [void][Win.U]::GetClassName($h,$sb,256); ("{0},{1},{2},{3}|{4}" -f $r.left,$r.top,$r.right,$r.bottom,$sb.ToString())';
// original one-shot command (unchanged behaviour, used as the fallback)
const ONE_SHOT = ADD_TYPE + ' ; ' + PROBE.replace('("{0}', 'Write-Output ("{0}');
// long-lived loop: read a request id per line, reply "id#result" and flush
const LOOP = ADD_TYPE + ' ; while ($null -ne ($id = [Console]::In.ReadLine())) { try { $o = & { ' + PROBE + ' } } catch { $o = "" } ; [Console]::Out.WriteLine("$id#$o"); [Console]::Out.Flush() }';

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
    proc = spawn(cmd || 'powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', LOOP],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  } catch { proc = null; fails++; return false; }
  buf = ''; answered = 0;
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
      const k = line.indexOf('#'); if (k < 0) continue;
      answered++; fails = 0;
      settle(Number(line.slice(0, k)), line.slice(k + 1));
    }
  });
  const dead = () => { if (proc) { proc = null; if (!stopped) fails++; failAll(); } };
  proc.on('exit', dead); proc.on('error', dead);
  proc.stdin.on('error', dead);
  return true;
}

function oneShot(cb) {
  execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ONE_SHOT], { timeout: 2500, windowsHide: true },
    (err, stdout) => cb(err || !stdout ? null : String(stdout).trim()));
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

module.exports = { query, stop, _test: { start, LOOP, ONE_SHOT, state: () => ({ fails, answered, alive: !!proc }) } };
