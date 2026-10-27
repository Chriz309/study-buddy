/* Character art + voice.
   Shared part classes let the engine rig every creature the same way.
   Style: thick ink outline (via CSS stroke on .body/.ear/.foot/.tail/.fin/.wing),
   a soft .shine highlight, a .body2 shaded belly, expressive face parts.
   Per-creature colours live in index.html as .char-<id> { --c1 --c2 --accent --ink }. */
window.CHAR_ART = {

  blob: {
    move: 'walk', accent: '#ffd23f',
    svg: `
      <g class="feet">
        <ellipse class="foot footL" cx="37" cy="86" rx="10" ry="6.5"/>
        <ellipse class="foot footR" cx="63" cy="86" rx="10" ry="6.5"/>
      </g>
      <g class="bodyG">
        <line class="antenna" x1="50" y1="30" x2="50" y2="16"/>
        <circle class="antennaTip" cx="50" cy="13" r="4.2"/>
        <path class="body" d="M20 68 C20 30 80 30 80 68 L80 73 Q80 85 68 85 L32 85 Q20 85 20 73 Z"/>
        <path class="body2" d="M23 75 Q23 85 34 85 L66 85 Q77 85 77 75 Q50 83 23 75 Z"/>
        <ellipse class="shine" cx="37" cy="48" rx="9" ry="12"/>
        <ellipse class="cheek" cx="31" cy="64" rx="5.2" ry="3.5"/>
        <ellipse class="cheek" cx="69" cy="64" rx="5.2" ry="3.5"/>
        <ellipse class="eye" cx="40" cy="57" rx="6" ry="7.6"/>
        <ellipse class="eye" cx="60" cy="57" rx="6" ry="7.6"/>
        <circle class="glint" cx="38" cy="54" r="1.9"/>
        <circle class="glint" cx="58" cy="54" r="1.9"/>
        <path class="mouth" d="M44 66 Q50 72 56 66"/>
      </g>`,
    lines: {
      greet: ["Hi! I'm {name}. I live on your screen now.", "{name}, reporting for study duty!"],
      idle:  ["What are we working on?", "You've got this.", "Hydrate. That's an order.", "*hums quietly*"],
      pet:   ["eeee!", "again!", "boop received ✅"],
      drag:  ["wheee!", "I'm flying!"],
      sleep: ["zzz...", "5 more minutes..."],
      study: ["Past paper > panic.", "You pass, I pass. Deal?"],
    },
  },

  pib: {
    move: 'walk', accent: '#ffb152',
    svg: `
      <path class="tailcat" d="M75 76 C94 72 92 50 83 46"/>
      <g class="feet">
        <ellipse class="foot footL" cx="40" cy="85" rx="8.5" ry="5.5"/>
        <ellipse class="foot footR" cx="60" cy="85" rx="8.5" ry="5.5"/>
      </g>
      <g class="bodyG">
        <path class="ear" d="M29 45 L24 22 L45 35 Z"/>
        <path class="ear" d="M71 45 L76 22 L55 35 Z"/>
        <path class="ear2" d="M31 42 L28 29 L40 36 Z"/>
        <path class="ear2" d="M69 42 L72 29 L60 36 Z"/>
        <ellipse class="body" cx="50" cy="60" rx="28" ry="26"/>
        <path class="body2" d="M26 66 Q50 86 74 66 Q50 80 26 66Z"/>
        <ellipse class="shine" cx="38" cy="48" rx="8" ry="11"/>
        <ellipse class="cheek" cx="33" cy="65" rx="5" ry="3.3"/>
        <ellipse class="cheek" cx="67" cy="65" rx="5" ry="3.3"/>
        <ellipse class="eye" cx="41" cy="58" rx="5" ry="6.8"/>
        <ellipse class="eye" cx="59" cy="58" rx="5" ry="6.8"/>
        <circle class="glint" cx="39.4" cy="55.6" r="1.6"/>
        <circle class="glint" cx="57.4" cy="55.6" r="1.6"/>
        <path class="nose" d="M46.5 65 L53.5 65 L50 69 Z"/>
        <path class="mouth" d="M50 69 Q45 74 41 71 M50 69 Q55 74 59 71"/>
        <g class="whisker">
          <line x1="20" y1="62" x2="35" y2="63"/><line x1="20" y1="68" x2="35" y2="66"/>
          <line x1="80" y1="62" x2="65" y2="63"/><line x1="80" y1="68" x2="65" y2="66"/>
        </g>
      </g>`,
    lines: {
      greet: ["{name} has claimed this desktop.", "mrrp. acceptable human."],
      idle:  ["Supervising. Not ignoring you.", "Judging your font choices.", "*flops dramatically*"],
      pet:   ["...adequate.", "purr (you didn't hear that)", "mrrrp ❤"],
      drag:  ["unhand me", "I meant to be up here"],
      sleep: ["do not perceive me", "nap. non-negotiable."],
      study: ["Study now, nap on your keyboard later.", "Close 30 tabs. I dare you."],
    },
  },

  chirp: {
    move: 'fly', accent: '#ffd23f',
    svg: `
      <g class="bodyG">
        <path class="wing wingB" d="M52 54 C70 44 86 50 80 62 C72 70 58 66 52 60 Z"/>
        <ellipse class="body" cx="46" cy="58" rx="22" ry="20"/>
        <path class="body2" d="M26 62 Q46 78 66 62 Q46 72 26 62Z"/>
        <path class="tail" d="M24 60 L10 55 L12 66 Z"/>
        <ellipse class="shine" cx="38" cy="49" rx="6.5" ry="9"/>
        <path class="wing wingF" d="M44 54 C28 44 12 50 18 63 C27 72 40 66 46 60 Z"/>
        <ellipse class="eye" cx="40" cy="54" rx="4.6" ry="6"/>
        <circle class="glint" cx="38.6" cy="52" r="1.5"/>
        <ellipse class="cheek" cx="33" cy="60" rx="4" ry="2.8"/>
        <path class="nose" d="M24 55 L14 57 L24 60 Z"/>
        <g class="feet"><line class="leg" x1="44" y1="76" x2="44" y2="84"/><line class="leg" x1="52" y1="76" x2="52" y2="84"/></g>
      </g>`,
    lines: {
      greet: ["tweet! I'm {name}!", "up here! hi!"],
      idle:  ["weeee, flying!", "nice view from up here", "*chirps*"],
      pet:   ["chirp chirp!", "☀"],
      drag:  ["wheee!", "gliiiide"],
      sleep: ["*tucks head*", "zzz"],
      study: ["little and often, that's the trick", "flap flap, you got this"],
    },
  },

  boo: {
    move: 'float', accent: '#b39dff',
    svg: `
      <g class="bodyG">
        <ellipse class="halo" cx="50" cy="20" rx="15" ry="5"/>
        <path class="body" d="M24 52 C24 26 76 26 76 52 L76 80 Q70 73 64 80 Q58 86 52 80 Q46 73 40 80 Q34 86 28 80 Q24 76 24 72 Z"/>
        <ellipse class="shine" cx="37" cy="44" rx="7" ry="10"/>
        <path class="eye eyeline" d="M36 50 Q42 55 47 50"/>
        <path class="eye eyeline" d="M53 50 Q58 55 64 50"/>
        <ellipse class="cheek" cx="34" cy="58" rx="4.6" ry="3"/>
        <ellipse class="cheek" cx="66" cy="58" rx="4.6" ry="3"/>
        <path class="mouth" d="M45 60 Q50 65 55 60"/>
      </g>`,
    lines: {
      greet: ["oh! hi. I'm {name}.", "*waves shyly*"],
      idle:  ["I'll just float here.", "you're doing great.", "*drifts*"],
      pet:   ["!!", "❤"],
      drag:  ["wa-ah", "weightless, so, sure"],
      sleep: ["phasing out...", "zzz"],
      study: ["even ghosts revise.", "a memo is forever."],
    },
  },

  finn: {
    move: 'swim', accent: '#7fe3ff',
    svg: `
      <g class="bodyG">
        <path class="fin" d="M50 22 Q58 30 50 44 Q46 32 50 22 Z"/>
        <path class="body" d="M14 56 Q24 36 52 40 Q82 44 90 58 Q74 56 60 60 Q40 66 24 64 Q16 62 14 56 Z"/>
        <path class="body2" d="M22 60 Q46 70 72 60 Q50 66 22 60 Z"/>
        <path class="tail" d="M90 58 Q98 50 96 46 Q90 54 86 56 Q92 60 96 70 Q98 66 90 58 Z"/>
        <ellipse class="shine" cx="40" cy="48" rx="10" ry="4"/>
        <ellipse class="eye" cx="34" cy="52" rx="3.3" ry="4"/>
        <circle class="glint" cx="33" cy="50.6" r="1.1"/>
        <path class="mouth" d="M18 58 Q26 63 34 61"/>
      </g>`,
    lines: {
      greet: ["*splash* hi! I'm {name}!", "eee-eee!"],
      idle:  ["*does a little flip*", "the desktop sea is nice today", "eee!"],
      pet:   ["click-click!", "❤"],
      drag:  ["wheee, airborne!", "*flips*"],
      sleep: ["drifting...", "zzz"],
      study: ["dive into that past paper!", "make a splash on this test"],
    },
  },

};
