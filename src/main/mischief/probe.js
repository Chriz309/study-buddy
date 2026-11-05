'use strict';
// UI Automation probe for ONE prank: a PowerShell that lives from "a prank is about to start" until it ends, then its stdin is closed.
// There is no always-on probe: nothing here runs between pranks. Windows only.
const { spawn } = require('child_process');
const path = require('path');
const active = new Set();   // every child we started: killed synchronously on quit
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');   // absolute path: never a PATH lookup
const { SCRIPT } = require('./probe-script');

function createProbe(opts = {}) {
  let proc = null, buf = '', nextId = 1, dead = false;
  const pending = new Map();
  const settle = (id, v) => { const p = pending.get(id); if (!p) return; pending.delete(id); clearTimeout(p.timer); p.cb(v); };
  const failAll = () => { for (const id of [...pending.keys()]) settle(id, null); };
  function start() {
    if (process.platform !== 'win32') return false;
    try { proc = spawn(opts.command || POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }); } catch { return false; }
    active.add(proc); const me = proc; me.on('exit', () => active.delete(me));
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); const k = line.indexOf('#'); if (k < 0) continue;
        let v = null; try { v = JSON.parse(line.slice(k + 1)); } catch {}
        settle(Number(line.slice(0, k)), v);
      }
    });
    const gone = () => { dead = true; failAll(); };
    proc.on('exit', gone); proc.on('error', gone); proc.stdin.on('error', gone);
    return true;
  }
  // resolves with the parsed JSON, or null on timeout / failure
  function request(cmd, timeout) {
    return new Promise((resolve) => {
      if (!proc || dead) return resolve(null);
      const id = nextId++, timer = setTimeout(() => settle(id, null), timeout || 2500);
      pending.set(id, { cb: resolve, timer });
      try { proc.stdin.write(id + '|' + cmd + '\n'); } catch { settle(id, null); }
    });
  }
  function stop() {
    const p = proc; proc = null; dead = true; failAll(); if (!p) return;
    try { p.stdin.end(); } catch {}
    setTimeout(() => { try { p.kill(); } catch {} }, 800).unref();
  }
  return { start, request, stop, isAlive: () => !!proc && !dead };
}
const killAll = () => { for (const p of [...active]) { try { p.kill(); } catch {} } active.clear(); };
module.exports = { createProbe, killAll };
