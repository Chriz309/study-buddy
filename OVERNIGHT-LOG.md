# Study Buddy — overnight work log

**Good morning, Chris!** Overnight I shipped **v0.3.3 → v0.3.12** (10 updates), all auto-released so your app updates itself. Highlights: smooth antenna-free slime head, **bouncy-hop movement** (feet only while climbing), **parachute** on high falls, **heart-eyes / dizzy / cursor-glance** reactions, **cookie-drop feeding**, idle bounces, richer speech, and **active-window perching + hopping along the window edge** (experimental — please confirm it works live). Deferred on purpose for your input: **fullscreen-hide** (needs live testing so it never hides the blob wrongly) and the **cat with multiple views** (after you OK the blob).

Per-version detail below (newest first).

## 2026-10-28
- **v0.3.12** — When perched on the active window's edge, the blob now **hops ALONG that edge** (keeps to the window) instead of wandering off it.
- **v0.3.11** — More speech variety (study-motivation flavoured lines).
- **v0.3.10** — Ambient little **in-place bounces** when idle (springy slime life).
- **v0.3.9** — **Food drop on feed**: feeding drops a cookie from above into the blob's open mouth; it catches, chews, hearts + sparkle.
- **v0.3.8** — Occasional **glance toward your cursor** while idle (feels aware of you).
- **v0.3.7** — **Reactions**: heart-eyes when you pat it, dizzy swirl-eyes when thrown hard. (More expression variety.)
- **v0.3.6** — **Window awareness (experimental)**: the blob can now land & perch on the ACTIVE window's top edge (drop it onto a window and it sits on the title bar; it stays on the desktop otherwise). Main polls the foreground window rect on Windows; fails safe to normal behaviour. Needs live confirmation on Chris's PC.
- **v0.3.5** — **Parachute**: when dropped/thrown from a height, the slime SOMETIMES (~40%) pops a cute red-white parachute and floats down gently, releasing near the ground.
- **v0.3.4** — Slime mechanics overhaul: **bouncy-hop locomotion** (slimes hop in little arcs instead of walking), **feet removed** from normal states and shown **only while climbing** (back turned), on the new **smooth antenna-less dome body**. Face/blush retuned onto the wide dome.
- **v0.3.3** — Smooth slime head (removed antenna/orb), small default size (85), and CI now publishes a Release on every push so the installed app auto-updates.
