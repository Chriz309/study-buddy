/* Egg-hatch reveal. Reads ?id=&name=&rarity=, plays a timeline, then closes. */
(function () {
  const q = new URLSearchParams(location.search);
  const id = q.get('id') || '', name = q.get('name') || 'New buddy', rarity = (q.get('rarity') || '').toLowerCase();
  const EMOJI = { blob: '🫧', ghost: '👻', cat: '🐱', chirp: '🐤', quack: '🦆', fox: '🦊', octo: '🐙', ember: '🐲' };
  const RAR = { common:['Common','#9aa4b2'], uncommon:['Uncommon','#54e0a0'], rare:['Rare','#53b9ff'], unique:['Unique','#c08bff'], legendary:['Legendary','#ffb43f'] };

  // egg art (same in both clipped halves so they form one egg)
  const EGG = `<svg width="170" height="210" viewBox="0 0 170 210" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="eg" cx="40%" cy="32%" r="75%">
        <stop offset="0%" stop-color="#fffdf5"/><stop offset="55%" stop-color="#ffedc4"/><stop offset="100%" stop-color="#f4c978"/>
      </radialGradient>
    </defs>
    <path d="M85,8 C128,8 150,74 150,116 C150,168 120,202 85,202 C50,202 20,168 20,116 C20,74 42,8 85,8 Z"
      fill="url(#eg)" stroke="#d9a94e" stroke-width="3"/>
    <ellipse cx="62" cy="150" rx="12" ry="9" fill="#f0b85e" opacity=".55"/>
    <ellipse cx="104" cy="128" rx="9" ry="7" fill="#f0b85e" opacity=".5"/>
    <ellipse cx="92" cy="172" rx="8" ry="6" fill="#f0b85e" opacity=".45"/>
    <ellipse cx="58" cy="60" rx="16" ry="11" fill="#fff" opacity=".35"/>
  </svg>`;
  document.getElementById('eggTop').innerHTML = EGG;
  document.getElementById('eggBottom').innerHTML = EGG;

  document.getElementById('buddy').textContent = EMOJI[id] || '⭐';
  document.getElementById('ltext').textContent = 'You hatched ' + name + '!';
  const lr = document.getElementById('lrar');
  if (RAR[rarity]) { lr.textContent = RAR[rarity][0]; lr.style.color = RAR[rarity][1]; } else lr.style.display = 'none';

  // sparkle burst
  const stage = document.getElementById('stage');
  const colors = ['#ffd23f', '#ffffff', '#ff8fbc', '#53d6ff', '#54e0a0'];
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('div'); s.className = 'spark';
    const a = (i / 14) * Math.PI * 2, r = 120 + Math.random() * 70;
    s.style.setProperty('--dx', Math.cos(a) * r + 'px');
    s.style.setProperty('--dy', Math.sin(a) * r + 'px');
    s.style.background = colors[i % colors.length];
    s.style.transitionDelay = (Math.random() * 0.1) + 's';
    stage.appendChild(s);
  }

  let done = false;
  function finish() { if (done) return; done = true; stage.classList.add('out'); setTimeout(() => { try { window.buddy.hatchDone(); } catch {} }, 650); }

  const T = (ms, cls) => setTimeout(() => stage.classList.add(cls), ms);
  requestAnimationFrame(() => {
    stage.classList.add('in');
    T(650, 'wobble');
    T(1750, 'crack');
    T(2350, 'hatch');
    setTimeout(finish, 5200);
  });
  window.addEventListener('pointerdown', finish);   // click to skip
})();
