# Study Buddy — overnight work log

Newest first. Each entry = one shipped improvement (pushed to GitHub; CI auto-builds a release so the app auto-updates).

## 2026-10-28
- **v0.3.9** — **Food drop on feed**: feeding drops a cookie from above into the blob's open mouth; it catches, chews, hearts + sparkle.
- **v0.3.8** — Occasional **glance toward your cursor** while idle (feels aware of you).
- **v0.3.7** — **Reactions**: heart-eyes when you pat it, dizzy swirl-eyes when thrown hard. (More expression variety.)
- **v0.3.6** — **Window awareness (experimental)**: the blob can now land & perch on the ACTIVE window's top edge (drop it onto a window and it sits on the title bar; it stays on the desktop otherwise). Main polls the foreground window rect on Windows; fails safe to normal behaviour. Needs live confirmation on Chris's PC.
- **v0.3.5** — **Parachute**: when dropped/thrown from a height, the slime SOMETIMES (~40%) pops a cute red-white parachute and floats down gently, releasing near the ground.
- **v0.3.4** — Slime mechanics overhaul: **bouncy-hop locomotion** (slimes hop in little arcs instead of walking), **feet removed** from normal states and shown **only while climbing** (back turned), on the new **smooth antenna-less dome body**. Face/blush retuned onto the wide dome.
- **v0.3.3** — Smooth slime head (removed antenna/orb), small default size (85), and CI now publishes a Release on every push so the installed app auto-updates.
