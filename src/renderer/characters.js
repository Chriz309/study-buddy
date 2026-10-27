/* Character art + voice — illustrated style.
   Each sprite is self-contained: gradients + fills + outlines are baked into the
   SVG so it looks identical in-app and in previews, and the CSS only drives
   poses/expression (transforms), never colour. Shared part classes (.eye .foot
   .wing .tail .fin ...) let the engine animate every creature the same way. */
window.CHAR_ART = {

  /* ---------------- BLOB — glossy slime-bot ---------------- */
  blob: {
    move: 'walk', accent: '#ffd23f', hatAnchor: { x: 50, y: 20, s: 1 },
    svg: `
      <defs>
        <radialGradient id="bl-b" cx="36%" cy="28%" r="82%">
          <stop offset="0%" stop-color="#b6f1ff"/><stop offset="50%" stop-color="#5eccf7"/><stop offset="100%" stop-color="#2d8ae0"/>
        </radialGradient>
        <linearGradient id="bl-f" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#46aef0"/><stop offset="100%" stop-color="#2b7ad0"/>
        </linearGradient>
        <radialGradient id="bl-ch" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ff9ec4" stop-opacity=".95"/><stop offset="100%" stop-color="#ff9ec4" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="bl-tip" cx="40%" cy="35%" r="70%">
          <stop offset="0%" stop-color="#fff4b0"/><stop offset="60%" stop-color="#ffd23f"/><stop offset="100%" stop-color="#f0a81e"/>
        </radialGradient>
      </defs>
      <ellipse class="gshadow" cx="50" cy="90" rx="26" ry="5" fill="#13233a" opacity=".16"/>
      <g class="feet">
        <ellipse class="foot footL" cx="37" cy="85" rx="10" ry="6.6" fill="url(#bl-f)" stroke="#1d3b5e" stroke-width="3"/>
        <ellipse class="foot footR" cx="63" cy="85" rx="10" ry="6.6" fill="url(#bl-f)" stroke="#1d3b5e" stroke-width="3"/>
      </g>
      <g class="bodyG">
        <line class="antenna" x1="50" y1="30" x2="50" y2="17" stroke="#2d8ae0" stroke-width="3" stroke-linecap="round"/>
        <circle class="antennaTip" cx="50" cy="13.5" r="4.4" fill="url(#bl-tip)" stroke="#1d3b5e" stroke-width="1.4"/>
        <circle cx="50" cy="13.5" r="7.5" fill="#ffd23f" opacity=".18"/>
        <path class="body" d="M19 67 C19 29 81 29 81 67 L81 72 Q81 85 68 85 L32 85 Q19 85 19 72 Z" fill="url(#bl-b)" stroke="#1d3b5e" stroke-width="3.3" stroke-linejoin="round"/>
        <path d="M24 75 Q50 84 76 75 Q50 80 24 75 Z" fill="#12314f" opacity=".12"/>
        <path d="M30 42 Q40 33 52 37 Q41 36 33 46 Q30 45 30 42 Z" fill="#ffffff" opacity=".5"/>
        <circle cx="64" cy="44" r="3" fill="#ffffff" opacity=".4"/>
        <ellipse class="cheek" cx="30" cy="63" rx="7" ry="5" fill="url(#bl-ch)"/>
        <ellipse class="cheek" cx="70" cy="63" rx="7" ry="5" fill="url(#bl-ch)"/>
        <ellipse class="eye" cx="40" cy="57" rx="6.4" ry="8.4" fill="#1c2740"/>
        <ellipse class="eye" cx="60" cy="57" rx="6.4" ry="8.4" fill="#1c2740"/>
        <circle class="glint" cx="37.6" cy="53.4" r="2.5" fill="#fff"/>
        <circle class="glint" cx="57.6" cy="53.4" r="2.5" fill="#fff"/>
        <circle cx="42" cy="60.5" r="1.3" fill="#fff" opacity=".65"/>
        <circle cx="62" cy="60.5" r="1.3" fill="#fff" opacity=".65"/>
        <path class="mouth" d="M43 65 Q50 72 57 65" fill="none" stroke="#1c2740" stroke-width="2.8" stroke-linecap="round"/>
      </g>`,
    lines: { greet:["Hi! I'm {name}. I live on your screen now.","{name}, reporting for study duty!"],
      idle:["What are we working on?","You've got this.","Hydrate. That's an order.","*hums quietly*"],
      pet:["eeee!","again!","boop received ✅"], drag:["wheee!","I'm flying!"],
      sleep:["zzz...","5 more minutes..."], study:["Past paper > panic.","You pass, I pass. Deal?"] },
  },

  /* ---------------- PIB — chubby illustrated cat ---------------- */
  pib: {
    move: 'walk', accent: '#ffb152', hatAnchor: { x: 50, y: 20, s: 1 },
    svg: `
      <defs>
        <radialGradient id="pi-b" cx="40%" cy="30%" r="80%">
          <stop offset="0%" stop-color="#ffd9a6"/><stop offset="55%" stop-color="#ffb259"/><stop offset="100%" stop-color="#ef8f33"/>
        </radialGradient>
        <radialGradient id="pi-ch" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ff8fb0" stop-opacity=".9"/><stop offset="100%" stop-color="#ff8fb0" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse class="gshadow" cx="50" cy="90" rx="25" ry="5" fill="#3a1f0c" opacity=".16"/>
      <path class="tailcat" d="M74 78 C95 74 93 48 82 44" fill="none" stroke="#f09a40" stroke-width="8" stroke-linecap="round"/>
      <path d="M74 78 C95 74 93 48 82 44" fill="none" stroke="#c9741f" stroke-width="3" stroke-linecap="round" opacity=".5"/>
      <g class="feet">
        <ellipse class="foot footL" cx="40" cy="85" rx="9" ry="5.8" fill="#ef8f33" stroke="#7a3f12" stroke-width="2.8"/>
        <ellipse class="foot footR" cx="60" cy="85" rx="9" ry="5.8" fill="#ef8f33" stroke="#7a3f12" stroke-width="2.8"/>
      </g>
      <g class="bodyG">
        <path class="ear" d="M28 44 L22 20 L46 34 Z" fill="url(#pi-b)" stroke="#7a3f12" stroke-width="3" stroke-linejoin="round"/>
        <path class="ear" d="M72 44 L78 20 L54 34 Z" fill="url(#pi-b)" stroke="#7a3f12" stroke-width="3" stroke-linejoin="round"/>
        <path d="M30 40 L27 27 L40 35 Z" fill="#ff9ec4"/><path d="M70 40 L73 27 L60 35 Z" fill="#ff9ec4"/>
        <ellipse class="body" cx="50" cy="60" rx="28" ry="26" fill="url(#pi-b)" stroke="#7a3f12" stroke-width="3.2"/>
        <path d="M26 66 Q50 86 74 66 Q50 78 26 66 Z" fill="#8a4d16" opacity=".12"/>
        <path d="M34 44 Q44 38 54 42 Q44 42 37 49 Q34 48 34 44 Z" fill="#fff" opacity=".45"/>
        <ellipse class="cheek" cx="33" cy="66" rx="6.5" ry="4.6" fill="url(#pi-ch)"/>
        <ellipse class="cheek" cx="67" cy="66" rx="6.5" ry="4.6" fill="url(#pi-ch)"/>
        <ellipse class="eye" cx="41" cy="58" rx="5.4" ry="7.4" fill="#2a1a0c"/>
        <ellipse class="eye" cx="59" cy="58" rx="5.4" ry="7.4" fill="#2a1a0c"/>
        <circle class="glint" cx="39" cy="55" r="2" fill="#fff"/><circle class="glint" cx="57" cy="55" r="2" fill="#fff"/>
        <path class="nose" d="M46.5 64.5 L53.5 64.5 L50 68.5 Z" fill="#ff7a9c" stroke="#7a3f12" stroke-width="1.2" stroke-linejoin="round"/>
        <path class="mouth" d="M50 68.5 Q45 73 41 70 M50 68.5 Q55 73 59 70" fill="none" stroke="#2a1a0c" stroke-width="2.4" stroke-linecap="round"/>
        <g class="whisker" stroke="#2a1a0c" stroke-width="1.3" stroke-linecap="round" opacity=".4">
          <line x1="19" y1="62" x2="35" y2="63"/><line x1="19" y1="68" x2="35" y2="66"/>
          <line x1="81" y1="62" x2="65" y2="63"/><line x1="81" y1="68" x2="65" y2="66"/>
        </g>
      </g>`,
    lines: { greet:["{name} has claimed this desktop.","mrrp. acceptable human."],
      idle:["Supervising. Not ignoring you.","Judging your font choices.","*flops dramatically*"],
      pet:["...adequate.","purr (you didn't hear that)","mrrrp ❤"], drag:["unhand me","I meant to be up here"],
      sleep:["do not perceive me","nap. non-negotiable."], study:["Study now, nap later.","Close 30 tabs. I dare you."] },
  },

  /* ---------------- BOO — soft illustrated ghost ---------------- */
  boo: {
    move: 'float', accent: '#b39dff', hatAnchor: { x: 50, y: 24, s: 1 },
    svg: `
      <defs>
        <linearGradient id="bo-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#8a7bc8"/><stop offset="55%" stop-color="#7467b4"/><stop offset="100%" stop-color="#5f5399"/>
        </linearGradient>
        <radialGradient id="bo-ch" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ffb24d" stop-opacity=".85"/><stop offset="100%" stop-color="#ffb24d" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse class="gshadow" cx="50" cy="92" rx="20" ry="4" fill="#2a2150" opacity=".14"/>
      <ellipse class="halo" cx="50" cy="16" rx="15" ry="5" fill="none" stroke="#f2b24a" stroke-width="4"/>
      <g class="bodyG">
        <path class="body" d="M22 54 C22 26 78 26 78 54 L78 80 Q72 72 65 79 Q58 86 51 79 Q44 72 37 79 Q30 86 23 79 Q22 74 22 70 Z"
              fill="url(#bo-b)" stroke="#2e2550" stroke-width="3.4" stroke-linejoin="round"/>
        <path d="M30 40 Q40 31 52 35 Q40 36 33 47 Q29 46 30 40 Z" fill="#fff" opacity=".22"/>
        <ellipse cx="36" cy="46" rx="4.5" ry="6" fill="#fff" opacity=".12"/>
        <path class="eye eyeline" d="M35 50 Q41 56 47 50" fill="none" stroke="#241d44" stroke-width="3.2" stroke-linecap="round"/>
        <path class="eye eyeline" d="M53 50 Q59 56 65 50" fill="none" stroke="#241d44" stroke-width="3.2" stroke-linecap="round"/>
        <ellipse class="cheek" cx="33" cy="58" rx="5.5" ry="3.6" fill="url(#bo-ch)"/>
        <ellipse class="cheek" cx="67" cy="58" rx="5.5" ry="3.6" fill="url(#bo-ch)"/>
        <path class="mouth" d="M45 59 Q50 64 55 59" fill="none" stroke="#241d44" stroke-width="2.6" stroke-linecap="round"/>
      </g>`,
    lines: { greet:["oh! hi. I'm {name}.","*waves shyly*"], idle:["I'll just float here.","you're doing great.","*drifts*"],
      pet:["!!","❤"], drag:["wa-ah","weightless, so, sure"], sleep:["phasing out...","zzz"],
      study:["even ghosts revise.","a memo is forever."] },
  },

  /* ---------------- CHIRP — round little bird ---------------- */
  chirp: {
    move: 'fly', accent: '#ff8f3f', hatAnchor: { x: 42, y: 30, s: .8 },
    svg: `
      <defs>
        <radialGradient id="ch-b" cx="42%" cy="32%" r="78%">
          <stop offset="0%" stop-color="#ffe88a"/><stop offset="55%" stop-color="#ffcf3f"/><stop offset="100%" stop-color="#f2a62e"/>
        </radialGradient>
      </defs>
      <g class="bodyG">
        <path class="tail" d="M68 56 L88 48 L86 60 L92 66 L70 66 Z" fill="#f2a62e" stroke="#7a4e10" stroke-width="2.8" stroke-linejoin="round"/>
        <path d="M49 30 Q53 22 58 26 Q54 28 53 34 Z" fill="#f2a62e" stroke="#7a4e10" stroke-width="2.4" stroke-linejoin="round"/>
        <ellipse class="body" cx="47" cy="56" rx="22" ry="22" fill="url(#ch-b)" stroke="#7a4e10" stroke-width="3.1"/>
        <path d="M30 60 Q47 76 66 60 Q47 70 30 60 Z" fill="#8a5a12" opacity=".12"/>
        <path d="M34 44 Q44 37 54 42 Q44 42 38 50 Q34 49 34 44 Z" fill="#fff" opacity=".5"/>
        <path class="wing wingF" d="M50 52 C40 48 30 54 36 66 C44 72 52 66 55 59 Z" fill="#ffd23f" stroke="#7a4e10" stroke-width="2.8" stroke-linejoin="round"/>
        <ellipse class="cheek" cx="35" cy="60" rx="5" ry="3.4" fill="#ff9ec4" opacity=".6"/>
        <ellipse class="eye" cx="40" cy="52" rx="5.2" ry="6.8" fill="#2a1c08"/>
        <circle class="glint" cx="38.2" cy="49.4" r="1.9" fill="#fff"/>
        <path class="nose" d="M30 54 L18 51.5 L24 57 L18 61.5 L30 59 Z" fill="#ff8f3f" stroke="#7a4e10" stroke-width="1.4" stroke-linejoin="round"/>
        <g class="feet" stroke="#e08a1e" stroke-width="2.6" stroke-linecap="round"><line class="leg" x1="43" y1="77" x2="43" y2="85"/><line class="leg" x1="52" y1="77" x2="52" y2="85"/></g>
      </g>`,
    lines: { greet:["tweet! I'm {name}!","up here! hi!"], idle:["weeee, flying!","nice view up here","*chirps*"],
      pet:["chirp chirp!","☀"], drag:["wheee!","gliiiide"], sleep:["*tucks head*","zzz"],
      study:["little and often!","flap flap, you got this"] },
  },

  /* ---------------- FINN — sleek dolphin ---------------- */
  finn: {
    move: 'swim', accent: '#7fe3ff', hatAnchor: { x: 36, y: 40, s: .8 },
    svg: `
      <defs>
        <linearGradient id="fi-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#9fe3f5"/><stop offset="50%" stop-color="#5fb9e0"/><stop offset="100%" stop-color="#3f93c4"/>
        </linearGradient>
      </defs>
      <g class="bodyG">
        <path class="fin" d="M50 20 Q60 30 50 46 Q46 32 50 20 Z" fill="#4f9fcc" stroke="#1d4a63" stroke-width="2.8" stroke-linejoin="round"/>
        <path class="body" d="M12 56 Q24 34 54 39 Q84 43 92 58 Q74 55 60 60 Q40 67 22 64 Q14 62 12 56 Z"
              fill="url(#fi-b)" stroke="#1d4a63" stroke-width="3.2" stroke-linejoin="round"/>
        <path d="M22 60 Q48 72 74 59 Q48 67 22 60 Z" fill="#dff4ff" opacity=".55"/>
        <path class="tail" d="M90 58 Q99 49 97 45 Q90 54 86 56 Q92 59 97 71 Q99 66 90 58 Z" fill="#4f9fcc" stroke="#1d4a63" stroke-width="2.8" stroke-linejoin="round"/>
        <path d="M30 46 Q42 40 54 44 Q42 44 34 51 Q30 50 30 46 Z" fill="#fff" opacity=".4"/>
        <ellipse class="eye" cx="33" cy="52" rx="3.6" ry="4.4" fill="#152b3a"/>
        <circle class="glint" cx="31.8" cy="50.4" r="1.3" fill="#fff"/>
        <path class="mouth" d="M16 58 Q25 64 34 61" fill="none" stroke="#152b3a" stroke-width="2.4" stroke-linecap="round"/>
      </g>`,
    lines: { greet:["*splash* hi! I'm {name}!","eee-eee!"], idle:["*does a little flip*","the desktop sea is nice","eee!"],
      pet:["click-click!","❤"], drag:["wheee, airborne!","*flips*"], sleep:["drifting...","zzz"],
      study:["dive into that past paper!","make a splash on this test"] },
  },

};
