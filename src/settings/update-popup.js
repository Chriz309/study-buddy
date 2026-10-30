/* Tiny on-screen update toast. Shows even when only the sprite is on screen. */
(function () {
  const v = new URLSearchParams(location.search).get('v');
  const mac = new URLSearchParams(location.search).get('mac') === '1';
  const go = document.getElementById('go');
  if (mac) {
    // macOS: no silent self-install for unsigned apps — offer the download instead
    document.querySelector('.t').textContent = 'Study Buddy update available';
    document.getElementById('sub').textContent = `Version ${v || ''} is out — download it and drag it into Applications.`;
    go.textContent = 'Download';
  } else if (v) document.getElementById('sub').textContent = `Study Buddy ${v} is ready to install.`;
  go.addEventListener('click', () => { go.textContent = mac ? 'Opening…' : 'Updating…'; window.buddy.installUpdate(); });
  document.getElementById('later').addEventListener('click', () => window.buddy.dismissUpdate());
})();
