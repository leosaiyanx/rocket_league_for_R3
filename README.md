# 🚀 Rocket Rumble — R3's Turbo League

A 3D rocket-powered car-football game, built for **Roland N. Emokpae III**.

Drive a rocket car, smash a giant ball into the other team's net, boost up the
walls, flip, and pull off aerials. Seven arenas, four difficulty levels, and
opponents that actually defend, rotate and shoot.

It runs in any modern browser — phone, tablet, laptop — with **no install and no
internet required** once it's loaded.

---

## ▶️ Three ways to play

### 1. Just tap the link (easiest)
**https://leosaiyanx.github.io/rocket_league_for_R3/**

Works on any phone, tablet or computer. Nothing to download, nothing to install.
Scan the QR code in [`qr/qr-play.png`](qr/qr-play.png), or print
[`PRINT_ME.html`](PRINT_ME.html) and stick it on the fridge.

### 2. Install it like a real app
Open the link above, then:

- **iPhone / iPad (Safari)** — tap the Share button → **Add to Home Screen**
- **Android (Chrome)** — tap the ⋮ menu → **Install app** / **Add to Home screen**
- **Windows / Mac (Chrome or Edge)** — click the ⊕ install icon in the address bar

You get a real app icon, fullscreen, no browser bars, and it works on a plane.

### 3. One file, forever offline
Download **[`dist/RocketRumble-standalone.html`](dist/RocketRumble-standalone.html)**
(about 0.8 MB). The whole game — 3D engine, arenas, sounds, everything — is inside
that single file.

Double-click it and it plays. Email it, AirDrop it, put it on a USB stick. It will
still work in ten years with no internet.

---

## 🎮 Controls

### Keyboard (all rebindable in **Controls**)

| Action | Key |
| --- | --- |
| Accelerate | `W` / `↑` |
| Reverse / brake | `S` / `↓` |
| Steer | `A` `D` / `←` `→` |
| Jump & flip | `Space` |
| Boost | `Shift` / `L` |
| Powerslide | `K` / `Ctrl` |
| Air roll (hold) | `J` / `Alt` |
| Ball camera | `C` |
| Camera view | `V` |
| Reset car | `R` |
| Pause | `Esc` / `P` |

### Camera views (`V`, or the ▣ button)

- **Chase** — classic third-person. The default, and the easiest to steer with.
- **Hood** — mounted on the bonnet, rolls with the car.
- **Cockpit** — driver's eye view, your own car hidden.

**Ball cam** (`C`, or ◎) is separate and **off by default**. It swings the view
toward the ball, which is great for aiming but strips out the cue that tells you
which way you just turned — the classic reason a new player says the steering
feels inverted. Turn it on when you're ready, and use **Ball cam strength** in
Settings to dial in how hard it tracks.

When the ball is off-screen, a gold arrow points at it.

### Controller
Plug in any gamepad — it's detected automatically.
Right trigger accelerates, left trigger reverses, **A** jumps, **X** boosts,
**B** powerslides and air-rolls, **Y** switches camera, **Start** pauses.

### Phone / tablet
The car drives itself forward. Steer with the left stick; **BOOST**, **JUMP**,
**BRAKE**, **SLIDE** and **ROLL** are on the right. Auto-accelerate, stick side,
and everything else can be changed in **Settings**.

### Driving help (Settings → Driving help)
Both are **on** by default and can be switched off once you don't need them:

- **Smooth steering** — eases the car into a turn instead of snapping to full
  lock the instant you press a key. This is what makes a keyboard feel like a
  proper controller.
- **Auto-level in the air** — rolls you back onto your wheels while you're
  airborne and not steering, so you stop landing upside down. It cuts out the
  moment you touch an air control, so it never fights a deliberate aerial.

A car that ends up stuck on its roof rights itself after about a second
regardless, and **R** resets you to your own half at any time.

---

## 🏆 The season

| # | Arena | Format | Twist |
| --- | --- | --- | --- |
| 1 | Rookie Dome | 1 v 1 | Learn to drive, boost and score |
| 2 | Neon Nights | 1 v 1 | A sharper opponent |
| 3 | Sunset Speedway | 2 v 2 | You get a team-mate |
| 4 | Frostbite Rink | 2 v 2 | Almost no grip |
| 5 | Volcano Pit | 3 v 3 | Heavy gravity, crowded pitch |
| 6 | Zero-G Station | 3 v 3 | Low gravity — aerials win it |
| 7 | Champion's Colosseum | 3 v 3 | The title match |

Win a match to unlock the next. Stars: **1** for the win, **2** if you keep them
to two goals, **3** for a three-goal margin.

Difficulty is **Rookie → Pro → All-Star → Legend**, and later arenas bump the
opponents up a tier on top of whatever you pick — so level 7 on Rookie is still a
real fight.

**Quick Match** lets you pick any arena, team size, gravity and grip.
**Free Play** is an empty pitch to mess about on.

---

## 🔧 How it's built

Plain JavaScript and [Three.js](https://threejs.org/). No build step, no bundler,
no npm install, no external assets. Every texture is painted into a `<canvas>` at
load time and every sound is synthesised with the Web Audio API, which is why the
whole thing works offline and fits in one file.

```
index.html          markup + HUD
css/style.css       menus, HUD, touch controls
js/core.js          tuning constants, maths, the arena signed-distance field
js/audio.js         Web Audio synth: engine, impacts, crowd, music sequencer
js/arena.js         stadium geometry + all seven themes
js/car.js           car model and physics
js/ball.js          ball physics + trajectory prediction
js/ai.js            the opponents
js/fx.js            pooled particles
js/levels.js        the season ladder
js/input.js         keyboard / gamepad / touch + rebinding
js/ui.js            menus, HUD, settings
js/game.js          renderer, camera, match flow, main loop
```

### A couple of things worth knowing

**The arena is a signed-distance field.** `RL.arenaSD()` is the union of a rounded
box and two goal boxes. Collision, the ground probe, the camera's wall clearance
and the visible mesh all read from that one function — the shell is literally
ray-marched against it at load time, so what you see and what you hit can't drift
apart. The net boxes deliberately start at the foot of the corner fillet, because
otherwise the fillet curves up across the goal mouth and walls the goal off.

**The bots are not cheating.** They fill in the same input struct the player does
(throttle, steer, jump, boost, pitch/yaw/roll) and run through identical physics.
They get good by predicting the ball's flight, solving for the earliest intercept
they can actually reach, and aiming *through* the ball at a spot in your net —
then managing their speed, because a car at 40 u/s has a 24-unit turning circle
and physically cannot come back for a ball off to one side.

Difficulty changes reaction time, aim error, how badly they misjudge the
prediction, boost discipline, and whether they attempt aerials and demos.

---

## 🛠 Developing

```bash
python3 tools/serve.py          # http://localhost:8933, and on your Wi-Fi
```

| Script | What it does |
| --- | --- |
| `tools/serve.py` | Local + LAN dev server |
| `tools/bundle.py` | Builds `dist/RocketRumble-standalone.html` |
| `tools/make_icons.py` | Draws the app icons (needs Pillow) |
| `tools/make_qr.py` | Makes the QR codes (needs `segno`) |

Handy deep links: `?level=5` jumps straight into a level, `?arena=neon` starts
free play in an arena, and `?demo=1` hands your car to a bot so you can just watch.

After changing anything, **bump `CACHE` in `sw.js`** or installed copies will keep
serving the old build.

---

Built with ❤️ for R3.
