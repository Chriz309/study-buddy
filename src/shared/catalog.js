// Single source of truth for characters, costs and app constants.
// Metadata lives here (main process owns it); the visual art + rigs live in
// the renderer (src/renderer/characters.js), keyed by the same `id`.

const CURRENCY = { name: 'Sparks', symbol: '⚡' }; // ⚡
// DEV-ONLY testing tools (bonus Sparks + sell buddy). MUST be false for public
// releases, set to false in the commit that merges dev -> main. (search: DEV_TOOLS)
const DEV_TOOLS = false;
// Cost of one gumball-machine roll (random unowned buddy). Deliberately steep:
// base earn is 1 Spark/sec (+0.4/sec per extra owned buddy, +0.1/sec per feed
// level), so at ~8 h/day of the app running this is roughly a week's earnings,
// a real reward, not a formality. Tune this single number to taste.
const GUMBALL_COST = 300000;

// move:  'walk'  gravity, walks + climbs edges
//        'float' drifts, ignores gravity (ghosts)
//        'fly'   drifts higher + swoops (birds)
//        'swim'  lurks below the screen, surfaces in arcs (sea creatures)
// rarity: common | uncommon | rare | unique | legendary  (drives the future gacha)
// Focused on Blob while we perfect the art/animation pipeline. More characters
// return later via the gacha, each generated through the Canva -> cutout ->
// soft-body-mesh pipeline. (search: ROSTER)
const CHARACTERS = [
  { id: 'blob',  name: 'Blob', tier: 1, move: 'walk',  rarity: 'common',   cost: 0,   personality: 'sunny', sizeScale: 0.66, blurb: 'A cheerful little slime. Squishy, glossy, alive.', implemented: true },
  { id: 'ghost', name: 'Boo',  tier: 1, move: 'float', rarity: 'uncommon', cost: 600, personality: 'shy',   blurb: 'A bashful ghost, floats, swirls, and phases in and out.', implemented: true },
  { id: 'cat',   name: 'Pib',  tier: 1, move: 'walk',  gait: 'step', rarity: 'rare', cost: 900, personality: 'playful', blurb: 'A cozy orange tabby, strolls about, sits to watch, and curls up for naps. Now and then it spots a butterfly and gives chase.', implemented: true },
  // Tier 2: rarer (unique), but can come out of any crank.
  { id: 'hero',  name: 'Captain Cram', tier: 2, move: 'walk', gait: 'step', rarity: 'unique', cost: 1500, personality: 'hyper', blurb: 'A tiny 16-bit caped crusader fuelled by revision. Leaps off the top of the screen, patrols the skies and powers up with +1 INT.', implemented: true },
  // Tier 3: legendary. Sprite-only spell antics (levitate, potions, blink, study, star show) plus the big desktop spells.
  { id: 'wizard', name: 'Merlo', tier: 3, move: 'walk', gait: 'step', rarity: 'legendary', cost: 3000, personality: 'wise', blurb: 'A tiny 16-bit wizard who opens portals, brews potions and hurls fireballs across your desktop, between bouts of serious spellbook revision.', implemented: true },
];

// Which buddies the gumball machine can hand out: every implemented buddy you don't own yet.
// Tiers no longer gate the machine (since 0.8): any buddy can come out of any crank, weighted by rarity.
function tierUnlocked(tier, owned) { return true; }
function rollPool(owned) { return CHARACTERS.filter(c => c.implemented && !owned.includes(c.id)); }
function lockedIds(owned) { return []; }
// Pick one buddy from the pool, weighted by rarity (rarer = less likely, never impossible).
function pickWeighted(pool, rand) {
  const r = typeof rand === 'function' ? rand : Math.random;
  const w = (c) => (RARITIES[c.rarity] && RARITIES[c.rarity].weight) || 1;
  const total = pool.reduce((a, c) => a + w(c), 0);
  let x = r() * total;
  for (const c of pool) { x -= w(c); if (x < 0) return c; }
  return pool[pool.length - 1];
}

const RARITIES = {
  common:    { label: 'Common',    color: '#9aa4b2', weight: 50 },
  uncommon:  { label: 'Uncommon',  color: '#54e0a0', weight: 30 },
  rare:      { label: 'Rare',      color: '#53b9ff', weight: 15 },
  unique:    { label: 'Unique',    color: '#c08bff', weight: 6 },
  legendary: { label: 'Legendary', color: '#ffb43f', weight: 2 },
};

const PERSONALITIES = ['chill', 'hyper', 'sleepy', 'naughty'];

// ---- TEST BUILD: every implemented character is owned so movement/looks can
// be checked without grinding. For release, set owned back to ['blob'] and let
// the gacha hand them out. (search: TEST_UNLOCK_ALL)
const IMPLEMENTED_IDS = CHARACTERS.filter(c => c.implemented).map(c => c.id);

const DEFAULTS = {
  version: 6,
  sparks: 800,                 // a little to play with, enough for a first gumball crank
  active: 'blob',
  owned: ['blob'],             // start with just Blob; everyone else lives in the gumball machine
  levels: {},
  names: {},                   // per-character custom names { blob: 'Gloop' }
  colors: {},                  // per-character hue-rotate degrees { blob: 120 }
  cosmetics: { owned: [], equipped: {} },   // Wardrobe: owned item ids + per-buddy equipped { charId: { head, face, neck } } (src/shared/wardrobe.js)
  codes: [],                   // redeemed easter-egg codes (future)
  study: { total: 0, streak: 0, lastDay: '', today: 0, todayDay: '' },   // study timer stats (src/main/study.js)
  settings: {
    size: 50,                 // XS by default (now goes much smaller)
    speed: 1.0,
    personality: 'chill',
    mischief: 25,
    sound: false,
    speech: true,
    chatter: 0.6,              // 0..1 how talkative (ghost gets scaled down)
    startOnBoot: true,   // on by default (v0.5.2+)
    paused: false,
    stayPut: false,            // "naughty corner": stay in place, idle animations only
    reduceMotion: false,
    roamMonitors: true,        // cross to other monitors
    windowAware: true,         // perch on the active window's top edge (Windows)
    showAll: false,
    hideBuddies: [],           // multi-pet: owned buddies the user chose NOT to show (ids)            // show every owned pet at once (future multi-pet)
    antics: true,              // now-and-then special antics (cat butterfly chase, Captain Cram's stunts)
    deskMischief: true,        // desktop mischief (overlay illusions, Windows): ON by default since 0.7.1. An explicit false (turned off, or tray "Stop mischief") stays off
    deskMischiefFreq: 'normal',// rare | normal | chaos
  },
};

// ---- Wardrobe: cosmetics bought with Sparks, one item per slot per buddy ----
// Art lives in src/renderer/art-cosmetics.js (scripts/gen_cosmetics.py); anchors per buddy and pose in src/renderer/cosmetics.js.
// `not` lists buddies that cannot wear an item (Merlo already has the iconic hat, so he takes no head items).
const COSMETIC_SLOTS = ['head', 'face', 'neck'];
const COSMETICS = [
  { id: 'blush',         slot: 'face', name: 'Blush stickers',  price: 2000 },
  { id: 'beanie',        slot: 'head', name: 'Cosy beanie',     price: 2000, not: ['wizard'] },
  { id: 'party_hat',     slot: 'head', name: 'Party hat',       price: 3000, not: ['wizard'] },
  { id: 'bow_tie',       slot: 'neck', name: 'Bow tie',         price: 3000 },
  { id: 'flower_crown',  slot: 'head', name: 'Flower crown',    price: 4000, not: ['wizard'] },
  { id: 'grad_cap',      slot: 'head', name: 'Graduation cap',  price: 5000, not: ['wizard'] },
  { id: 'round_glasses', slot: 'face', name: 'Round glasses',   price: 5000 },
  { id: 'chef_hat',      slot: 'head', name: 'Chef hat',        price: 6000, not: ['wizard'] },
  { id: 'scarf',         slot: 'neck', name: 'Cosy scarf',      price: 6000 },
  { id: 'monocle',       slot: 'face', name: 'Monocle',         price: 7000 },
  { id: 'frog_hat',      slot: 'head', name: 'Frog hat',        price: 8000, not: ['wizard'] },
  { id: 'star_shades',   slot: 'face', name: 'Star sunglasses', price: 9000 },
  { id: 'top_hat',       slot: 'head', name: 'Top hat',         price: 12000, not: ['wizard'] },
  { id: 'crown',         slot: 'head', name: 'Royal crown',     price: 40000, not: ['wizard'] },
  { id: 'gold_medal',    slot: 'neck', name: 'Gold medal',      price: 40000 },
];
function cosmeticById(id) { return COSMETICS.find(c => c.id === id); }
function canWear(charId, item) { return !!item && !(item.not && item.not.includes(charId)); }

function characterById(id) { return CHARACTERS.find(c => c.id === id); }
// On-screen size for a buddy: the Size setting times its own scale (Blob reads one size step smaller, so its Medium is the old Small).
function sizeFor(id, size) { const c = characterById(id), k = c && c.sizeScale > 0 ? c.sizeScale : 1; return Math.round((size || 140) * k); }

module.exports = { sizeFor, tierUnlocked, rollPool, lockedIds, pickWeighted, CURRENCY, DEV_TOOLS, GUMBALL_COST, CHARACTERS, RARITIES, PERSONALITIES, DEFAULTS, characterById, IMPLEMENTED_IDS, COSMETICS, COSMETIC_SLOTS, cosmeticById, canWear };
