/* Tiny on-screen update toast. Shows even when only the sprite is on screen. */
(function () {
  const v = new URLSearchParams(location.search).get('v');
  if (v) document.getElementById('sub').textContent = `Study Buddy ${v} is ready to install.`;
  const go = document.getElementById('go');
  go.addEventListener('click', () => { go.textContent = 'Updating…'; window.buddy.installUpdate(); });
  document.getElementById('later').addEventListener('click', () => window.buddy.dismissUpdate());
})();
