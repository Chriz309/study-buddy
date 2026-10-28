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

## 2026-10-28 (morning, Chris awake)
- **v0.3.19** — Pre-public polish: (1) the update prompt is now an **on-screen popup** (bottom-right toast, always-on-top) that shows even when only the sprite is visible — no need to open Settings. (2) **Crank price raised to 300,000⚡** (was 500) — roughly a week of normal running at base rate, rewarded faster by feeding; tune the single `GUMBALL_COST` constant. (3) Save-migration no longer tops Sparks up to the crank price. (4) About reads **"current version X"**.
- **v0.3.16 / v0.3.18** — The auto-update draft-release fix, the gumball machine, and visible feed/crank costs (earlier today).
- **v0.3.17** — **Auto-update now installs itself.** The download worked but nothing applied it on restart. Now, the moment an update finishes downloading, a dialog pops up — **"Restart & update now"** — that quits, swaps in the new version silently (no installer wizard) and reopens. No more hunting in the About tab. The About tab also gets a matching **"Restart & update now"** button when an update is waiting, and the app installs a pending update on a normal quit too. (Note: the very first hop onto a self-installing version needs one manual nudge — see today's message.)
- **v0.3.15** — **New character: Boo the ghost** 👻 — the first roster-mate since the art pivot. He **floats** (no gravity, gentle bob), his **bottom edge swirls constantly** (traveling wave through the tails), and he can **phase in and out** (fades to a faint shimmer and back) as his signature ability. Animated vector face rides the wavy body just like the blob's. Switch between Blob and Boo from the tray/settings; both share the same soft-body + expression engine. Owned by default in this test build so you can try him right away.
- **v0.3.14** — **Fullscreen-hide**: the overlay now hides itself on any monitor running a fullscreen app (game/Netflix/video), per monitor, and comes back when you exit. (Please confirm live.)
- **v0.3.13** — The blob now **decides to climb up to the active window on its own** (hops to the window's edge, scales it, and perches on top) instead of only landing there when dropped.
- **v0.3.14** — **Fullscreen hide**: when a fullscreen app (game/video) covers a monitor, the blob's overlay on that monitor hides (desktop shell excluded so it does not hide on the desktop). Experimental — please confirm with a fullscreen game/video.
