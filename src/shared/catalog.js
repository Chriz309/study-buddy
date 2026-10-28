// Single source of truth for characters, costs and app constants.
// Metadata lives here (main process owns it); the visual art + rigs live in
// the renderer (src/renderer/characters.js), keyed by the same `id`.

const CURRENCY = { name: 'Sparks', symbol: '⚡' }; // ⚡
const GUMBALL_COST = 500;   // cost of one gumball-machine roll (random unowned buddy)

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
];

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
  version: 3,
  sparks: 800,                 // a little to play with — enough for a first gumball crank
  active: 'blob',
  owned: ['blob'],             // start with just Blob; everyone else lives in the gumball machine
  levels: {},
  cosmetics: {},               // per-character unlocked cosmetics (future)
  codes: [],                   // redeemed easter-egg codes (future)
  settings: {
    size: 85,                  // small by default
    speed: 1.0,
    personality: 'chill',
    mischief: 25,
    sound: false,
    speech: true,
    chatter: 0.6,              // 0..1 how talkative (ghost gets scaled down)
    startOnBoot: false,
    paused: false,
    reduceMotion: false,
    roamMonitors: true,        // cross to other monitors
    windowAware: true,         // perch on the active window's top edge (Windows)
    showAll: false,            // show every owned pet at once (future multi-pet)
  },
};

function characterById(id) { return CHARACTERS.find(c => c.id === id); }

module.exports = { CURRENCY, GUMBALL_COST, CHARACTERS, RARITIES, PERSONALITIES, DEFAULTS, characterById, IMPLEMENTED_IDS };
