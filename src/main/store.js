// Tiny JSON store in the OS userData folder. No external deps.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { DEFAULTS, GUMBALL_COST } = require('../shared/catalog');

const FILE = () => path.join(app.getPath('userData'), 'buddy-save.json');

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

function load() {
  try {
    const raw = fs.readFileSync(FILE(), 'utf8');
    state = deepMerge(DEFAULTS, JSON.parse(raw));
  } catch {
    state = JSON.parse(JSON.stringify(DEFAULTS));
  }
  // guarantee the default character is always owned
  if (!state.owned.includes('blob')) state.owned.unshift('blob');

  // migration → v3: the gumball machine replaces the old test-unlock-all.
  // Put every non-Blob buddy back into the machine so they can be adopted by
  // cranking it, and make sure there's enough for at least one crank.
  if (!state.version || state.version < 3) {
    state.owned = ['blob'];
    state.active = 'blob';
    if (!(state.sparks >= GUMBALL_COST)) state.sparks = GUMBALL_COST;
    state.version = 3;
    save();
  }
  return state;
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE()), { recursive: true });
      fs.writeFileSync(FILE(), JSON.stringify(state, null, 2));
    } catch (e) { /* best effort */ }
  }, 300);
}

function get() { return state; }
function set(patch) { state = deepMerge(state, patch); save(); return state; }
function replace(next) { state = next; save(); return state; }

module.exports = { load, save, get, set, replace };
