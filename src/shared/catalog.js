// Single source of truth for characters, costs and app constants.
// Metadata lives here (main process owns it); the visual art + rigs live in
// the renderer (src/renderer/characters.js), keyed by the same `id`.

const CURRENCY = { name: 'Sparks', symbol: '⚡' }; // ⚡
// DEV-ONLY testing tools (bonus Sparks + sell buddy). MUST be false for public
// releases — set to false in the commit that merges dev -> main. (search: DEV_TOOLS)
const DEV_TOOLS = false;
// Cost of one gumball-machine roll (random unowned buddy). Deliberately steep:
// base earn is 1 Spark/sec (+0.4/sec per extra owned buddy, +0.1/sec per feed
// level), so at ~8 h/day of the app running this is roughly a week's earnings —
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
  { id: 'blob',  name: 'Blob', tier: 1, move: 'walk',  rarity: 'common',   cost: 0,   personality: 'sunny', blurb: 'A cheerful little slime. Squishy, glossy, alive.', implemented: true },
  { id: 'ghost', name: 'Boo',  tier: 1, move: 'float', rarity: 'uncommon', cost: 600, personality: 'shy',   blurb: 'A bashful ghost — floats, swirls, and phases in and out.', implemented: true },
  { id: 'cat',   name: 'Pib',  tier: 1, move: 'walk',  gait: 'step', rarity: 'rare', cost: 900, personality: 'playful', blurb: 'A cozy orange tabby — strolls about, sits to watch, and curls up for naps. Now and then it spots a butterfly and gives chase.', implemented: true },
  // Tier 2: only enters the gumball machine once every tier-1 buddy is adopted (see rollPool).
  { id: 'hero',  name: 'Captain Cram', tier: 2, move: 'walk', gait: 'step', rarity: 'unique', cost: 1500, personality: 'hyper', blurb: 'A tiny 16-bit caped crusader fuelled by revision. Leaps off the top of the screen, patrols the skies and powers up with +1 INT.', implemented: true },
];

// Which buddies the gumball machine can hand out for a given owned list. A higher tier only
// unlocks once every implemented buddy of the tier below is owned (tier 1 is always open).
function tierUnlocked(tier, owned) {
  for (const c of CHARACTERS) if (c.implemented && c.tier < tier && !owned.includes(c.id)) return false;
  return true;
}
function rollPool(owned) { return CHARACTERS.filter(c => c.implemented && !owned.includes(c.id) && tierUnlocked(c.tier || 1, owned)); }
// implemented, not owned, but still behind a tier gate
function lockedIds(owned) { return CHARACTERS.filter(c => c.implemented && !owned.includes(c.id) && !tierUnlocked(c.tier || 1, owned)).map(c => c.id); }

const RARITIES = {
  common:    { label: 'Common',    color: '#9aa4b2' },
  uncommon:  { label: 'Uncommon',  color: '#54e0a0' },
  rare:      { label: 'Rare',      color: '#53b9ff' },
  unique:    { label: 'Unique',    color: '#c08bff' },
  legendary: { label: 'Legendary', color: '#ffb43f' },
};

const PERSONALITIES = ['chill', 'hyper', 'sleepy', 'naughty'];

// ---- TEST BUILD: every implemented character is owned so movement/looks can
// be checked without grinding. For release, set owned back to ['blob'] and let
// the gacha hand them out. (search: TEST_UNLOCK_ALL)
const IMPLEMENTED_IDS = CHARACTERS.filter(c => c.implemented).map(c => c.id);

const DEFAULTS = {
  version: 5,
  sparks: 800,                 // a little to play with — enough for a first gumball crank
  active: 'blob',
  owned: ['blob'],             // start with just Blob; everyone else lives in the gumball machine
  levels: {},
  names: {},                   // per-character custom names { blob: 'Gloop' }
  colors: {},                  // per-character hue-rotate degrees { blob: 120 }
  cosmetics: {},               // per-character unlocked cosmetics (future)
  codes: [],                   // redeemed easter-egg codes (future)
  settings: {
    size: 50,                  // XS by default (now goes much smaller)
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
    showAll: false,            // show every owned pet at once (future multi-pet)
    antics: true,              // now-and-then special antics (cat butterfly chase, Captain Cram's stunts)
    deskMischief: null,        // desktop mischief (overlay illusions, Windows). null = never chosen: OFF in public builds, ON in dev builds
    deskMischiefFreq: 'normal',// rare | normal | chaos
  },
};

function characterById(id) { return CHARACTERS.find(c => c.id === id); }

module.exports = { tierUnlocked, rollPool, lockedIds, CURRENCY, DEV_TOOLS, GUMBALL_COST, CHARACTERS, RARITIES, PERSONALITIES, DEFAULTS, characterById, IMPLEMENTED_IDS };
