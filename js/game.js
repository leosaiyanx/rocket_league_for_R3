/* ============================================================
   game.js — renderer, camera, match flow and the main loop.
   ============================================================ */
(function (global) {
  'use strict';
  var RL = global.RL, T = global.THREE, M = RL.M, A = RL.ARENA, C = RL.CAR, BL = RL.BALL;

  var TEAM_COLORS = [0x3da5ff, 0xff6b3d];         // 0 = blue (player), 1 = orange
  var TEAM_NAMES = ['BLUE', 'ORANGE'];
  var BOT_NAMES = [
    'RIPTIDE', 'VOLT', 'HAVOC', 'NITRO', 'BLITZ', 'RECOIL',
    'ONYX', 'JETSTREAM', 'MAVERICK', 'CINDER', 'ZEPHYR', 'TORQUE'
  ];

  var G = RL.Game = {
    scene: null, camera: null, renderer: null, canvas: null,
    arena: null, ball: null, fx: null,
    cars: [], bots: [], player: null,
    level: null, world: { gravity: 1, grip: 1 },
    state: 'menu',       // menu | countdown | play | goal | over | paused
    score: [0, 0], clock: 0, overtime: false,
    quality: 'high',
    running: false, _last: 0, _raf: 0, _watchdog: 0,
    pred: null, predN: 120, predDt: 1 / 30,
    stats: null,
    timeScale: 1
  };

  /* ---------------- boot ---------------- */

  G.init = function (canvas) {
    G.canvas = canvas;
    G.quality = RL.autoQuality();

    var r = new T.WebGLRenderer({
      canvas: canvas, antialias: G.quality === 'high',
      powerPreference: 'high-performance', alpha: false, stencil: false
    });
    r.setClearColor(0x05070f, 1);
    // NOTE: outputEncoding is deliberately left alone — every colour in this
    // project is authored linear, and switching it doubles the brightness.
    G.renderer = r;

    G.scene = new T.Scene();
    G.camera = new T.PerspectiveCamera(RL.save.camFov, 1, 0.25, 420);
    G.camera.position.set(0, 12, -46);

    G.pred = new Float32Array(G.predN * 3);
    G.resize();
    global.addEventListener('resize', G.resize);
    if (global.screen && global.screen.orientation) {
      global.screen.orientation.addEventListener('change', function () {
        setTimeout(G.resize, 120);
      });
    }
  };

  G.resize = function () {
    if (!G.renderer) return;
    var w = global.innerWidth, h = global.innerHeight;
    var dpr = global.devicePixelRatio || 1;
    var cap = G.quality === 'high' ? 2 : (G.quality === 'medium' ? 1.5 : 1);
    G.renderer.setPixelRatio(Math.min(dpr, cap));
    G.renderer.setSize(w, h, false);
    G.camera.aspect = w / Math.max(1, h);
    // a narrow phone in portrait needs a wider FOV to see anything useful
    var fov = RL.save.camFov;
    if (G.camera.aspect < 1) fov = Math.min(105, fov + 16);
    G.camera.fov = fov;
    G.camera.updateProjectionMatrix();
  };

  /* ---------------- match setup ---------------- */

  /* Kickoff spots, as [xOffset, fractionOfHalfLength].  Team 1 mirrors x.
     Nobody starts dead on the centre line: a car at x=0 driving straight at
     the ball sends it straight down the middle into the other net, which made
     every kickoff a free goal.  Offsetting them turns the kickoff into a
     diagonal 50/50 — a clean first touch now runs wide of the post. */
  function kickoffSpots(n) {
    if (n <= 1) return [[-8.5, 0.60]];
    if (n === 2) return [[-12, 0.56], [12, 0.56]];
    return [[-6.5, 0.62], [-19, 0.48], [19, 0.48]];
  }

  G.start = function (level) {
    G.teardown();
    G.level = level;
    G.quality = RL.autoQuality();
    G.world.gravity = level.gravity;
    G.world.grip = level.grip;
    G.score = [0, 0];
    G.clock = level.time;
    G.overtime = false;
    G.pendingEnd = false;
    G.timeScale = 1;
    G.stats = { goals: 0, saves: 0, demos: 0, assists: 0, topSpeed: 0, boostUsed: 0, shots: 0 };

    G.arena = new RL.Arena(G.scene, level.theme, G.quality);
    G.fx = new RL.FX(G.scene, G.quality);
    G.ball = new RL.Ball(G);

    var n = level.teamSize;
    var accent = RL.ACCENTS[RL.save.carColor % RL.ACCENTS.length].c;
    var skill = RL.skillFor(level);

    G.cars = []; G.bots = [];

    // player
    var p = new RL.Car(G, {
      team: 0, isPlayer: true, name: 'R3', bodyIdx: RL.save.carBody,
      teamColor: TEAM_COLORS[0], accentColor: accent
    });
    G.cars.push(p);
    G.player = p;

    if (!level.freePlay) {
      var namePool = BOT_NAMES.slice();
      var pickName = function (rnd) {
        var i = Math.floor(rnd * namePool.length) % namePool.length;
        return namePool.splice(i, 1)[0] || 'BOT';
      };
      var rng = RL.rng(level.id * 7919 + 13);
      // team-mates
      for (var i = 1; i < n; i++) {
        var mate = new RL.Car(G, {
          team: 0, name: pickName(rng()), bodyIdx: Math.floor(rng() * RL.BODIES.length),
          teamColor: TEAM_COLORS[0], accentColor: RL.ACCENTS[Math.floor(rng() * RL.ACCENTS.length)].c
        });
        G.cars.push(mate);
        G.bots.push(new RL.Bot(G, mate, skill, (level.id * 131 + i * 17) | 0));
      }
      // opponents
      for (var j = 0; j < n; j++) {
        var foe = new RL.Car(G, {
          team: 1, name: pickName(rng()), bodyIdx: Math.floor(rng() * RL.BODIES.length),
          teamColor: TEAM_COLORS[1], accentColor: RL.ACCENTS[Math.floor(rng() * RL.ACCENTS.length)].c
        });
        G.cars.push(foe);
        G.bots.push(new RL.Bot(G, foe, skill, (level.id * 977 + j * 29) | 0));
      }
    }

    G.kickoff(true);
    G.state = 'countdown';
    G.countdown = 3.2;
    G.lastCount = 4;
    RL.Audio.startEngine();
    RL.Audio.playMusic(level.freePlay ? 'menu' : 'match');
    RL.UI.showHUD(true);
    G.run();
  };

  G.kickoff = function (first) {
    var lvl = G.level;
    var perTeam = [[], []];
    for (var i = 0; i < G.cars.length; i++) perTeam[G.cars[i].team].push(G.cars[i]);

    for (var team = 0; team < 2; team++) {
      var list = perTeam[team];
      var spots = kickoffSpots(list.length);
      var sign = team === 0 ? -1 : 1;             // team 0 lives on -Z
      for (var k = 0; k < list.length; k++) {
        var s = spots[k % spots.length];
        var x = s[0] * (team === 0 ? 1 : -1);
        var z = sign * A.hz * s[1];
        list[k].reset(x, C.ride, z, team === 0 ? 0 : Math.PI);
        list[k].boost = lvl.startBoost;
        list[k].role = 'attack';
      }
    }
    G.ball.reset(0, BL.radius + 0.02, 0, 0, 0, 0);
    G.ball.frozen = true;

    // pads all come back
    if (G.arena) for (var q = 0; q < G.arena.pads.length; q++) G.arena.pads[q].timer = 0;

    if (!first) { G.state = 'countdown'; G.countdown = 2.6; G.lastCount = 3; }
    G.kickoffTimer = 3.0;      // how long the bots run their kickoff routine
    G.camSnap = true;
  };

  G.teardown = function () {
    for (var i = 0; i < G.cars.length; i++) G.cars[i].dispose();
    G.cars = []; G.bots = []; G.player = null;
    if (G.ball) { G.ball.dispose(); G.ball = null; }
    if (G.fx) { G.fx.dispose(); G.fx = null; }
    if (G.arena) { G.arena.dispose(); G.arena = null; }
  };

  G.quit = function () {
    G.running = false;
    if (G._raf) cancelAnimationFrame(G._raf);
    if (G._watchdog) { clearInterval(G._watchdog); G._watchdog = 0; }
    G.teardown();
    G.state = 'menu';
    RL.Audio.stopEngine();
    RL.Audio.playMusic('menu');
    RL.UI.showHUD(false);
    G.renderer.clear();
  };

  /* ---------------- loop ---------------- */

  G.run = function () {
    if (G.running) return;
    G.running = true;
    G._last = (global.performance || Date).now();
    G._raf = requestAnimationFrame(G._tick);
    // rAF gets throttled hard in background tabs and some embedded views;
    // this keeps the sim honest without ever double-stepping.
    if (!G._watchdog) {
      G._watchdog = setInterval(function () {
        if (!G.running) return;
        var now = (global.performance || Date).now();
        if (now - G._last > 250) G._tick(now);
      }, 250);
    }
  };

  G.pause = function () {
    if (G.state === 'paused' || G.state === 'menu') return;
    G.prevState = G.state;
    G.state = 'paused';
    RL.Audio.engine(0, 0, false, false);
    RL.UI.openPause();
  };

  G.resume = function () {
    if (G.state !== 'paused') return;
    G.state = G.prevState || 'play';
    G._last = (global.performance || Date).now();
    RL.UI.closePause();
  };

  G._tick = function (ts) {
    if (!G.running) return;
    G._raf = requestAnimationFrame(G._tick);

    var dt = (ts - G._last) / 1000;
    G._last = ts;
    // negative or huge dt (tab wake, clock skew) blows up every damper we own
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.05) dt = 0.05;

    try {
      G.step(dt);
    } catch (e) {
      if (!G._errored) { G._errored = true; console.error('game step failed', e); }
    }
    G.renderer.render(G.scene, G.camera);
  };

  /* ---------------- simulation ---------------- */

  var _v = new T.Vector3(), _v2 = new T.Vector3(), _camDir = new T.Vector3(0, 0, 1),
    _camWant = new T.Vector3(), _look = new T.Vector3(), _lookNow = new T.Vector3();

  G.step = function (dt) {
    var paused = G.state === 'paused';
    if (paused) { RL.UI.tickHUD(0); return; }

    var sim = dt * G.timeScale;

    /* --- countdown --- */
    if (G.state === 'countdown') {
      G.countdown -= dt;
      var c = Math.ceil(G.countdown);
      if (c < G.lastCount) {
        G.lastCount = c;
        if (c >= 0) { RL.Audio.sfxCount(c); RL.UI.bigText(c > 0 ? String(c) : 'GO!', c > 0 ? 0.6 : 0.9); }
      }
      if (G.countdown <= 0) { G.state = 'play'; G.ball.frozen = false; }
    }

    /* --- goal celebration --- */
    if (G.state === 'goal') {
      G.goalTimer -= dt;
      if (G.goalTimer <= 0) {
        if (G.checkMatchEnd()) return;
        G.kickoff(false);
      }
    }

    /* --- clock ---
       When it hits zero the whistle waits for the ball to come down,
       exactly like the real thing: a shot in flight still counts. */
    if (G.state === 'play' && G.level.time > 0 && !G.overtime) {
      if (!G.pendingEnd) {
        G.clock -= dt;
        if (G.clock <= 0) { G.clock = 0; G.pendingEnd = true; }
      }
      if (G.pendingEnd) {
        var settled = RL.surfaceDist(G.ball.pos) <= BL.radius + 0.35;
        if (settled) {
          G.pendingEnd = false;
          if (G.score[0] === G.score[1]) G.startOvertime();
          else { G.finish(); return; }
        }
      }
    }

    /* --- prediction, shared by every bot and the landing marker --- */
    RL.predictBall(G.ball, G.world, G.predN, G.predDt, G.pred);

    /* --- roles --- */
    G.roleTimer = (G.roleTimer || 0) - dt;
    if (G.roleTimer <= 0) { G.roleTimer = 0.25; RL.assignRoles(G); }

    /* --- player input --- */
    if (G.player) {
      if (G.state === 'play' || G.state === 'countdown') {
        RL.Input.poll(G.player.input, dt);
        if (G.state === 'countdown') {
          // let them rev and steer, but the ball is frozen anyway
          G.player.input.boost = G.player.input.boost && G.countdown < 0.6;
        }
      } else {
        var pi = G.player.input;
        pi.throttle = 0; pi.steer = 0; pi.jump = false; pi.boost = false;
        pi.drift = false; pi.pitch = 0; pi.yaw = 0; pi.roll = 0;
      }
    }

    if (RL.Input.pressed('ballCam')) {
      RL.save.ballCam = !RL.save.ballCam; RL.persist(); RL.Audio.sfxUI();
    }
    if (RL.Input.pressed('pause')) {
      if (G.state === 'paused') G.resume(); else G.pause();
    }
    if (RL.Input.pressed('reset') && G.player && G.state === 'play') {
      // drop back onto your own half, wheels down, facing the ball
      var rz = M.clamp(G.player.pos.z, -A.hz + 8, -6);
      var head = Math.atan2(G.ball.pos.x - G.player.pos.x * 0.6, G.ball.pos.z - rz);
      G.player.reset(M.clamp(G.player.pos.x, -A.hx + 6, A.hx - 6), C.ride, rz, head);
      G.player.boost = Math.max(G.player.boost, 12);
    }

    /* --- bots + cars ---
       Everyone is frozen on the line through the countdown, same as the
       real game: nobody gets a rolling start and nobody can reach the
       (non-collidable) frozen ball early. */
    var live = G.state !== 'countdown';
    // the kickoff routine budget only burns once the whistle has gone
    if (live) G.kickoffTimer = Math.max(0, (G.kickoffTimer || 0) - dt);

    for (var b = 0; b < G.bots.length; b++) {
      if (live) G.bots[b].update(sim);
      else {
        var bi = G.bots[b].car.input;
        bi.throttle = 0; bi.steer = 0; bi.jump = false; bi.boost = false;
        bi.drift = false; bi.pitch = 0; bi.yaw = 0; bi.roll = 0;
      }
    }
    if (!live) { G.finishFrame(dt); return; }

    for (var i = 0; i < G.cars.length; i++) {
      var car = G.cars[i];
      car.update(sim, G.world);
      if (G.fx) { G.fx.boostTrail(car, sim); G.fx.driftSmoke(car, sim); }
      if (car === G.player) {
        if (car.speed > G.stats.topSpeed) G.stats.topSpeed = car.speed;
      }
    }

    /* --- ball --- */
    var ballWasHeadingHome = threatToPlayer();
    G.ball.update(sim, G.world);
    for (var j = 0; j < G.cars.length; j++) {
      var hit = G.ball.collideCar(G.cars[j], sim);
      if (hit > 1.0 && G.cars[j] === G.player) {
        if (ballWasHeadingHome && !threatToPlayer()) {
          G.stats.saves++;
          RL.Audio.sfxSave();
          RL.UI.toast('SAVE!');
          if (G.arena) G.arena.cheer(0.6);
        }
      }
    }

    /* --- demolitions --- */
    G.checkDemos();

    /* --- goals --- */
    if (G.state === 'play' && !G.ball.frozen) {
      var net = RL.inNet(G.ball.pos);
      if (net !== 0) G.scoreGoal(net > 0 ? 0 : 1);
    }

    /* --- world --- */
    G.finishFrame(dt);
  };

  /* everything that runs whether or not the sim is live */
  G.finishFrame = function (dt) {
    if (G.arena) G.arena.update(dt, G.camera);
    if (G.fx) G.fx.update(dt);
    G.updateMarker();
    G.updateCamera(dt);
    G.updateAudio();
    RL.UI.tickHUD(dt);
  };

  function threatToPlayer() {
    // is the ball currently on a path into the player's own net?
    var b = G.ball;
    if (b.vel.z > -6) return false;              // team 0 defends -Z
    var t = (-A.hz - b.pos.z) / b.vel.z;
    if (t < 0 || t > 2.2) return false;
    var x = b.pos.x + b.vel.x * t;
    var y = b.pos.y + b.vel.y * t - 0.5 * BL.gravity * G.world.gravity * t * t;
    return Math.abs(x) < A.goalW + 1.2 && y > 0 && y < A.goalH + 1;
  }

  G.checkDemos = function () {
    for (var i = 0; i < G.cars.length; i++) {
      var a = G.cars[i];
      if (a.demoed > 0 || !a.supersonic) continue;
      for (var j = 0; j < G.cars.length; j++) {
        var b = G.cars[j];
        if (b === a || b.team === a.team || b.demoed > 0) continue;
        if (a.pos.distanceToSquared(b.pos) < C.demoRadius * C.demoRadius) {
          // the faster car wins the exchange
          if (b.supersonic && b.speed > a.speed) continue;
          if (b.demolish()) {
            RL.Audio.sfxDemo();
            if (G.fx) G.fx.demoBurst(b.pos, b.teamColor);
            if (a === G.player) { G.stats.demos++; RL.UI.toast('DEMOLISHED!'); }
            else if (b === G.player) RL.UI.toast('WRECKED!');
          }
        }
      }
    }
  };

  G.scoreGoal = function (team) {
    G.score[team]++;
    G.state = 'goal';
    G.goalTimer = 3.4;
    G.ball.frozen = true;
    G.ball.vel.set(0, 0, 0);

    var color = TEAM_COLORS[team];
    if (G.fx) G.fx.goalExplosion(G.ball.pos, color);
    if (G.arena) { G.arena.flashGoal(team === 0 ? 1 : -1); G.arena.cheer(1.0); }
    RL.Audio.sfxGoal(team === 0);

    var scorer = G.ball.lastToucher;
    var byPlayer = scorer === G.player;
    if (byPlayer) { G.stats.goals++; RL.save.totalGoals++; RL.persist(); }

    var ownGoal = scorer && scorer.team !== team;
    RL.UI.goalBanner(
      TEAM_NAMES[team],
      color,
      ownGoal ? 'OWN GOAL' : (scorer ? scorer.name : ''),
      byPlayer
    );
    RL.UI.flash(color);
    G.ball.mesh.visible = false;
    G.ball.glow.visible = false;
    setTimeout(function () {
      if (G.ball) { G.ball.mesh.visible = true; G.ball.glow.visible = true; }
    }, 1400);
  };

  G.startOvertime = function () {
    if (G.overtime) return;
    G.overtime = true;
    G.clock = 0;
    RL.UI.bigText('OVERTIME', 1.6);
    RL.Audio.sfxWhistle();
    RL.Audio.playMusic('tense');
  };

  G.checkMatchEnd = function () {
    if (G.overtime) { G.finish(); return true; }
    if (G.level.time > 0 && G.clock <= 0) {
      if (G.score[0] === G.score[1]) { G.startOvertime(); return false; }
      G.finish(); return true;
    }
    return false;
  };

  G.finish = function () {
    G.state = 'over';
    G.ball.frozen = true;
    RL.Audio.sfxWhistle();
    var won = G.score[0] > G.score[1];
    var lvl = G.level;

    if (won) {
      RL.Audio.sfxWin();
      if (G.fx) G.fx.confetti([0x3da5ff, 0xffffff, 0xffd24a, 0x6effc4]);
      if (G.arena) G.arena.cheer(1.0);
      RL.save.totalWins++;
    } else RL.Audio.sfxLose();

    var stars = 0;
    if (!lvl.freePlay && !lvl.exhibition) {
      stars = RL.starsFor(G.score[0], G.score[1]);
      var key = 'L' + lvl.id;
      if ((RL.save.stars[key] || 0) < stars) RL.save.stars[key] = stars;
      if (won && RL.save.unlocked < lvl.id + 1 && lvl.id < RL.LEVELS.length) {
        RL.save.unlocked = lvl.id + 1;
      }
    }
    RL.persist();
    RL.Audio.stopMusic();
    RL.UI.matchOver(won, G.score.slice(), stars, G.stats, lvl);
  };

  /* ---------------- landing marker ---------------- */

  G.updateMarker = function () {
    var b = G.ball, m = b.marker;
    if (!m) return;
    if (b.frozen || b.pos.y < BL.radius + 0.6) { m.material.opacity = 0; return; }
    var found = -1;
    for (var i = 2; i < G.predN; i++) {
      if (G.pred[i * 3 + 1] <= BL.radius + 0.25) { found = i; break; }
    }
    if (found < 0) { m.material.opacity = 0; return; }
    var t = found * G.predDt;
    m.position.set(G.pred[found * 3], 0.08, G.pred[found * 3 + 2]);
    var s = BL.radius * 3.4;
    m.scale.set(s, s, 1);
    m.material.opacity = M.clamp(0.75 - t * 0.16, 0.08, 0.75);
    m.material.color.setHSL(0.55 - M.clamp(1 - t / 3, 0, 1) * 0.5, 1, 0.6);
  };

  /* ---------------- camera ---------------- */

  G.updateCamera = function (dt) {
    var cam = G.camera;
    var car = G.player;
    if (!car) return;

    /* Goal replay cam: pull back and frame the net. Keeping the chase cam
       glued to the car during a celebration buries it in the end wall. */
    if (G.state === 'goal' && G.ball) {
      var gside = M.sign(G.ball.pos.z) || 1;
      _camWant.set(G.ball.pos.x * 0.45, 9.0, G.ball.pos.z - gside * 24);
      var gsd = RL.surfaceDist(_camWant);
      if (gsd < 2.4) { RL.surfaceNormal(_camWant, _v2); _camWant.addScaledVector(_v2, 2.4 - gsd); }
      cam.position.lerp(_camWant, 1 - Math.exp(-4.5 * dt));
      _look.copy(G.ball.pos); _look.y += 1.0;
      _lookNow.lerp(_look, 1 - Math.exp(-6 * dt));
      if (G.fx && G.fx.shake > 0.001) {
        var gs = G.fx.shake * G.fx.shake * 0.9;
        cam.position.x += (Math.random() - 0.5) * gs;
        cam.position.y += (Math.random() - 0.5) * gs;
      }
      cam.lookAt(_lookNow);
      G.camSnap = true;      // snap back cleanly when play resumes
      return;
    }

    var ballCam = RL.save.ballCam;
    var dist = RL.save.camDist, height = RL.save.camHeight;

    // which way should we be looking?
    if (ballCam && G.ball) {
      _v.copy(G.ball.pos).sub(car.pos);
      _v.y = 0;
      if (_v.lengthSq() < 4) car.forward(_v).setY(0);
    } else {
      car.forward(_v); _v.y = 0;
      if (_v.lengthSq() < 0.01) _v.set(0, 0, 1);
    }
    if (_v.lengthSq() < 1e-4) _v.set(0, 0, 1);
    _v.normalize();

    var snap = G.camSnap ? 1 : (1 - Math.exp(-(ballCam ? 6.5 : 9.0) * dt));
    _camDir.lerp(_v, snap).normalize();

    // pull back and up from the car
    var speedT = M.clamp(car.speed / C.maxSpeed, 0, 1);
    var d = dist + speedT * 1.9;
    var h = height + speedT * 0.5;
    _camWant.copy(car.pos).addScaledVector(_camDir, -d);
    _camWant.y += h;
    // when the car is on a wall or ceiling, lift the camera off that surface too
    car.upVec(_v2);
    if (_v2.y < 0.75) _camWant.addScaledVector(_v2, h * 0.55);

    // keep well clear of the walls — get too close and the crowd band and
    // panelling alias into a moiré mess
    var sd = RL.surfaceDist(_camWant);
    if (sd < 2.4) {
      RL.surfaceNormal(_camWant, _v2);
      _camWant.addScaledVector(_v2, 2.4 - sd);
    }

    if (G.camSnap) cam.position.copy(_camWant);
    else cam.position.lerp(_camWant, 1 - Math.exp(-11 * dt));

    // look at a point between the car and the ball
    if (ballCam && G.ball) {
      _look.copy(car.pos).lerp(G.ball.pos, 0.42);
      _look.y += 1.1;
    } else {
      _look.copy(car.pos).addScaledVector(_camDir, 9);
      _look.y += 1.6;
    }
    if (G.camSnap) _lookNow.copy(_look);
    else _lookNow.lerp(_look, 1 - Math.exp(-13 * dt));

    // shake
    if (G.fx && G.fx.shake > 0.001) {
      var s = G.fx.shake * G.fx.shake * 0.9;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.lookAt(_lookNow);

    // FOV kick with speed
    var baseFov = RL.save.camFov + (cam.aspect < 1 ? 16 : 0);
    var wantFov = baseFov + speedT * 7 + (car.supersonic ? 4 : 0);
    if (Math.abs(cam.fov - wantFov) > 0.05) {
      cam.fov = M.damp(cam.fov, wantFov, 6, dt);
      cam.updateProjectionMatrix();
    }
    G.camSnap = false;
  };

  /* ---------------- audio glue ---------------- */

  G.updateAudio = function () {
    var car = G.player;
    if (!car) return;
    RL.Audio.engine(
      M.clamp(car.speed / C.maxSpeed, 0, 1),
      Math.abs(car.input.throttle),
      car.boosting,
      !car.onGround
    );
  };

  /* ---------------- helpers used by the UI ---------------- */

  G.teamColor = function (t) { return TEAM_COLORS[t]; };
  G.teamName = function (t) { return TEAM_NAMES[t]; };

})(window);
