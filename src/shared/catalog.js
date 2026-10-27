// Single source of truth for characters, costs and app constants.
// Metadata lives here (main process owns it); the visual art + rigs live in
// the renderer (src/renderer/characters.js), keyed by the same `id`.

const CURRENCY = { name: 'Sparks', symbol: '⚡' }; // ⚡

// move:  'walk'  gravity, walks + climbs edges
//        'float' drifts, ignores gravity (ghosts)
//        'fly'   drifts higher + swoops (birds)
//        'swim'  lurks below the screen, surfaces in arcs (sea creatures)
// rarity: common | uncommon | rare | unique | legendary  (drives the future gacha)
const CHARACTERS = [
  { id: 'blob',  name: 'Blob',     tier: 1, move: 'walk',  rarity: 'common',    cost: 0,     personality: 'sunny',   blurb: 'A cheerful little slime-bot. Your first friend.',        implemented: true  },
  { id: 'pib',   name: 'Pib',      tier: 1, move: 'walk',  rarity: 'common',    cost: 250,   personality: 'smug',    blurb: 'A tiny cat certain the desktop belongs to it.',          implemented: true  },
  { id: 'chirp', name: 'Chirp',    tier: 1, move: 'fly',   rarity: 'common',    cost: 400,   personality: 'perky',   blurb: 'A little bird that flits and swoops around the screen.',  implemented: true  },
  { id: 'boo',   name: 'Boo',      tier: 1, move: 'float', rarity: 'uncommon',  cost: 600,   personality: 'shy',     blurb: 'A bashful ghost. Drifts, hides, peeks.',                  implemented: true  },
  { id: 'quack', name: 'Quackers', tier: 2, move: 'walk',  rarity: 'uncommon',  cost: 1500,  personality: 'chaos',   blurb: 'A duck with no respect for your productivity.',           implemented: false },
  { id: 'finn',  name: 'Finn',     tier: 2, move: 'swim',  rarity: 'rare',      cost: 3000,  personality: 'playful', blurb: 'A dolphin that surfaces from the bottom of your screen.', implemented: true  },
  { id: 'axo',   name: 'Axo',      tier: 2, move: 'walk',  rarity: 'rare',      cost: 3500,  personality: 'derp',    blurb: 'An axolotl that walks on land, somehow. Always smiling.', implemented: false },
  { id: 'fox',   name: 'Sly',      tier: 3, move: 'walk',  rarity: 'rare',      cost: 10000, personality: 'sly',     blurb: 'A clever fox with a big swishy tail.',                    implemented: false },
  { id: 'jelly', name: 'Wobble',   tier: 3, move: 'float', rarity: 'rare',      cost: 6000,  personality: 'zen',     blurb: 'A jellyfish that bobs serenely through your day.',        implemented: false },
  { id: 'octo',  name: 'Inko',     tier: 3, move: 'float', rarity: 'unique',    cost: 16000, personality: 'curious', blurb: 'An octopus. Eight arms, infinite mischief.',              implemented: false },
  { id: 'cog',   name: 'Cog',      tier: 4, move: 'walk',  rarity: 'unique',    cost: 24000, personality: 'posh',    blurb: 'A brass arcade automaton who over-engineers everything.', implemented: false },
  { id: 'ember', name: 'Ember',    tier: 4, move: 'fly',   rarity: 'legendary', cost: 36000, personality: 'fierce',  blurb: 'A pocket dragon. Small, dramatic, occasionally smoky.',   implemented: false },
  { id: 'zrk',   name: 'Zrk',      tier: 4, move: 'float', rarity: 'legendary', cost: 50000, personality: 'alien',   blurb: 'A friendly alien, here to observe your snack habits.',    implemented: false },
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
  version: 2,
  sparks: 800,                 // a little to play with feeding
  active: 'blob',
  owned: IMPLEMENTED_IDS.slice(),   // TEST_UNLOCK_ALL
  levels: {},
  cosmetics: {},               // per-character unlocked cosmetics (future)
  codes: [],                   // redeemed easter-egg codes (future)
  settings: {
    size: 120,
    speed: 1.0,
    personality: 'chill',
    mischief: 25,
    sound: false,
    speech: true,
    chatter: 0.6,              // 0..1 how talkative (ghost gets scaled down)
    startOnBoot: false,
    paused: false,
    reduceMotion: false,
    roamMonitors: false,       // cross to other monitors (off by default: avoids the paint glitch)
    showAll: false,            // show every owned pet at once (future multi-pet)
  },
};

function characterById(id) { return CHARACTERS.find(c => c.id === id); }

module.exports = { CURRENCY, CHARACTERS, RARITIES, PERSONALITIES, DEFAULTS, characterById, IMPLEMENTED_IDS };
