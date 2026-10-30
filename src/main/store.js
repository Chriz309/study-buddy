// Tiny JSON store in the OS userData folder. No external deps.
//
// Crash-safe saving:
//  • Writes go to buddy-save.json.tmp, are flushed to disk, then swapped in with a
//    rename — so a crash / power cut mid-write can never leave a half-written save.
//  • buddy-save.json.bak keeps a recent known-good copy (refreshed every few minutes).
//  • If the save is ever unreadable, it's kept aside as buddy-save.corrupt-<time>.json
//    and the backup is loaded instead of silently resetting the student to zero.
//  • saveNow() writes immediately — used on quit, shutdown, sleep and before updates
//    (the old 300 ms delayed save meant the last changes were lost when quitting).
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { DEFAULTS, GUMBALL_COST } = require('../shared/catalog');

const FILE = () => path.join(app.getPath('userData'), 'buddy-save.json');
const BAK = () => FILE() + '.bak';
const TMP = () => FILE() + '.tmp';
const SAVE_DELAY = 1000;              // at most one disk write per second while running
const BACKUP_EVERY = 5 * 60 * 1000;   // refresh the .bak copy every 5 minutes

function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(over)) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) &&
        base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], over[k]);
    } else {
      out[k] = over[k];
    }
  }
  return out;
}

let state = JSON.parse(JSON.stringify(DEFAULTS));

// returns the parsed save, or null if missing; throws if present but unreadable
function readSave(file) {
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not a save object');
  return parsed;
}

function load() {
  let saved = null;
  try { saved = readSave(FILE()); }
  catch {
    // unreadable main save: keep it for inspection, fall back to the backup
    try { fs.copyFileSync(FILE(), path.join(path.dirname(FILE()), `buddy-save.corrupt-${Date.now()}.json`)); } catch {}
  }
  if (!saved) { try { saved = readSave(BAK()); } catch { saved = null; } }
  state = saved ? deepMerge(DEFAULTS, saved) : JSON.parse(JSON.stringify(DEFAULTS));
  if (!Array.isArray(state.owned)) state.owned = ['blob'];
  // guarantee the default character is always owned
  if (!state.owned.includes('blob')) state.owned.unshift('blob');

  // migration → v3: the gumball machine replaces the old test-unlock-all.
  // Put every non-Blob buddy back into the machine so they can be adopted by
  // cranking it, and make sure there's enough for at least one crank.
  if (!state.version || state.version < 3) {
    state.owned = ['blob'];
    state.active = 'blob';
    state.version = 3;
    save();
  }

  // migration → v4 (v0.5.2): "Start on login" is now ON by default. Switch it on ONCE
  // for every existing user; if they turn it off again afterwards, that choice sticks.
  if (state.version < 4) {
    state.settings = { ...state.settings, startOnBoot: true };
    state.version = 4;
    save();
  }
  return state;
}

let lastBackup = 0;
function writeNow() {
  const file = FILE(), tmp = TMP();
  const data = JSON.stringify(state, null, 2);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    // keep a recent known-good copy before replacing the main file
    if (Date.now() - lastBackup > BACKUP_EVERY && fs.existsSync(file)) {
      try { readSave(file); fs.copyFileSync(file, BAK()); lastBackup = Date.now(); } catch {}
    }
    fs.renameSync(tmp, file);   // atomic swap (replaces the old file on Windows/macOS too)
  } catch (e) {
    // e.g. antivirus briefly locking the file: fall back to a direct write
    try { fs.writeFileSync(file, data); } catch {}
  }
}

let saveTimer = null;
// schedule a write (throttled: changes within the next second are batched together)
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; writeNow(); }, SAVE_DELAY);
}
// write immediately (quit / shutdown / sleep / before installing an update)
function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  writeNow();
}

function get() { return state; }
function set(patch) { state = deepMerge(state, patch); save(); return state; }
function replace(next) { state = next; save(); return state; }

module.exports = { load, save, saveNow, get, set, replace };
