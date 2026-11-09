'use strict';
// Wardrobe rules (pure, no electron): normalising the saved shape, buying and equipping with validation.
// main.js calls these from the IPC handlers; test/cosmetics.test.js exercises them directly.
const { CHARACTERS, COSMETIC_SLOTS, cosmeticById, canWear } = require('./catalog');

const knownChar = (id) => CHARACTERS.some(c => c.id === id);

// Any saved value (old `{}`, junk, a newer build) -> { owned: [valid unique ids], equipped: { charId: { head, face, neck } } }.
// Equipped items must be owned, fit their slot and be wearable by that buddy; anything else is dropped.
function normalizeCosmetics(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const owned = [];
  for (const id of Array.isArray(src.owned) ? src.owned : []) if (typeof id === 'string' && cosmeticById(id) && !owned.includes(id)) owned.push(id);
  const equipped = {};
  const eq = src.equipped && typeof src.equipped === 'object' && !Array.isArray(src.equipped) ? src.equipped : {};
  for (const charId of Object.keys(eq)) {
    if (!knownChar(charId) || !eq[charId] || typeof eq[charId] !== 'object') continue;
    const row = {};
    for (const slot of COSMETIC_SLOTS) {
      const id = eq[charId][slot], it = typeof id === 'string' ? cosmeticById(id) : null;
      if (it && it.slot === slot && owned.includes(id) && canWear(charId, it)) row[slot] = id;
    }
    if (Object.keys(row).length) equipped[charId] = row;
  }
  return { owned, equipped };
}

// state = the saved state, economy = devmode.createEconomy(...). Returns { ok, reason?, patch? }; patch is what to store.set().
function buyCosmetic(state, id, economy) {
  const it = typeof id === 'string' ? cosmeticById(id) : null;
  if (!it) return { ok: false, reason: 'unknown' };
  const cos = normalizeCosmetics(state.cosmetics);
  if (cos.owned.includes(id)) return { ok: false, reason: 'owned' };
  if (!economy.canAfford(state.sparks, it.price)) return { ok: false, reason: 'poor', cost: it.price };
  return { ok: true, patch: { sparks: economy.after(state.sparks, it.price), cosmetics: { owned: [...cos.owned, id], equipped: cos.equipped } } };
}

// id === null (or '') takes the slot's item off.
function equipCosmetic(state, charId, slot, id) {
  if (!knownChar(charId) || !state.owned.includes(charId)) return { ok: false, reason: 'unowned' };
  if (!COSMETIC_SLOTS.includes(slot)) return { ok: false, reason: 'slot' };
  const cos = normalizeCosmetics(state.cosmetics);
  const row = { ...(cos.equipped[charId] || {}) };
  if (id == null || id === '') delete row[slot];
  else {
    const it = typeof id === 'string' ? cosmeticById(id) : null;
    if (!it) return { ok: false, reason: 'unknown' };
    if (it.slot !== slot) return { ok: false, reason: 'slot' };
    if (!cos.owned.includes(id)) return { ok: false, reason: 'notowned' };
    if (!canWear(charId, it)) return { ok: false, reason: 'cannotwear' };
    row[slot] = id;
  }
  const equipped = { ...cos.equipped };
  if (Object.keys(row).length) equipped[charId] = row; else delete equipped[charId];
  return { ok: true, patch: { cosmetics: { owned: cos.owned, equipped } } };
}

module.exports = { normalizeCosmetics, buyCosmetic, equipCosmetic };
