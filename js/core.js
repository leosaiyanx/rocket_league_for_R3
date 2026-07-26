/* ============================================================
   ROCKET RUMBLE — R3's Turbo League
   core.js — namespace, tuning constants, math, arena SDF, save data
   ============================================================ */
(function (global) {
  'use strict';

  var RL = global.RL = global.RL || {};
  RL.VERSION = '1.0.0';

  /* ---------------- tuning ---------------- */

  var ARENA = RL.ARENA = {
    hx: 40,        // half width   (X: -40 .. 40)
    hz: 50,        // half length  (Z: -50 .. 50)
    h: 20,         // ceiling height (Y: 0 .. 20)
    r: 6.0,        // corner fillet radius — the curved bits you can drive up
    goalW: 9.6,    // goal mouth half width
    goalH: 7.2,    // goal mouth height
    goalD: 8.0,    // how far the net reaches behind the goal line
    goalR: 0.8
  };
  /* The net box has to start at the foot of the floor-wall fillet, not at the
     goal line — otherwise the fillet curves up across the mouth and walls the
     goal off.  Cutting it back to hz - r carves a flat channel through the
     corner, which is exactly how the real arenas are shaped. */
  ARENA.goalFront = ARENA.hz - ARENA.r;             // 44
  ARENA.goalBack = ARENA.hz + ARENA.goalD;          // 58
  ARENA.goalCz = (ARENA.goalFront + ARENA.goalBack) * 0.5;
  ARENA.goalHz = (ARENA.goalBack - ARENA.goalFront) * 0.5;

  var BALL = RL.BALL = {
    radius: 1.35,
    gravity: 18.0,               // must match CAR.gravity
    drag: 0.030,        // per second
    restitution: 0.62,
    surfFriction: 0.32, // tangential scrub on bounce
    spinFromBounce: 0.55,
    spinDrag: 0.35,
    maxSpin: 14,
    magnus: 0.16,       // curve force coefficient
    maxSpeed: 75
  };

  var CAR = RL.CAR = {
    L: 2.30, W: 1.50, H: 0.68,   // full dimensions
    ride: 0.50,                  // wheel contact -> body centre height
    wheelR: 0.42,
    stick: 0.44,                 // extra reach that still counts as "on a surface"
    wallStickSpeed: 7.5,         // below this you slide off a vertical wall

    maxDrive: 30,                // top speed with throttle only
    maxSpeed: 42,                // top speed with boost
    supersonic: 39,

    accel: 46,                   // throttle accel at a standstill
    brake: 62,
    coast: 12,                   // engine braking when off throttle
    reverseMax: 15,

    boostAccel: 41,
    boostMax: 100,
    boostUse: 30,                // units per second
    boostMin: 0.20,              // minimum burn on a tap

    gripLat: 44,                 // sideways grip (units/s^2 of correction)
    gripDrift: 9.0,
    turn: 4.0,                   // base yaw rate rad/s
    turnFalloff: 0.40,           // how much the turn opens out at high speed

    /* Gravity is deliberately much stronger than a real-world scaling would
       give.  At 13 a single jump hung in the air for ~2s, which made every
       car feel like a balloon; 18 lands you in ~1.1s and keeps play snappy.
       BALL.gravity is kept identical so aerials read correctly. */
    gravity: 18.0,
    stickForce: 26,              // pull toward the surface (wall + ceiling driving)

    jump: 10.0,
    jumpHold: 15,                // extra accel while the jump button is held
    jumpHoldTime: 0.20,
    doubleJump: 8.0,
    flipImpulse: 17.5,
    flipForwardBonus: 6.0,
    flipTime: 0.62,              // how long the flip animation locks rotation
    flipWindow: 1.30,            // grace period for the second press

    airPitch: 9.0,
    airYaw: 7.5,
    airRoll: 11.0,
    airDamp: 5.6,                // higher = the car stops tumbling sooner
    airControlDrag: 0.55,
    levelAssist: 4.2,            // strength of the auto-level-in-the-air help

    demoSpeed: 39,               // must be supersonic to demolish
    demoRadius: 2.25,
    respawn: 3.0,

    mass: 180,
    ballMass: 30
  };

  var PADS = RL.PADS = {
    smallAmt: 12, bigAmt: 100, smallCool: 4.0, bigCool: 10.0,
    r: 1.15, bigR: 1.75      // visual radius; pickup adds a forgiving margin
  };

  /* ---------------- math ---------------- */

  var M = RL.M = {
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    sign: function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); },
    /* frame-rate independent exponential approach */
    damp: function (a, b, lambda, dt) { return b + (a - b) * Math.exp(-lambda * dt); },
    smooth: function (t) { return t * t * (3 - 2 * t); },
    /* shortest signed angle a->b */
    angleDelta: function (a, b) {
      var d = (b - a) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      return d;
    },
    /* apply a deadzone then rescale so the stick still reaches 1.0 */
    dead: function (v, dz) {
      var a = Math.abs(v);
      if (a < dz) return 0;
      return M.sign(v) * (a - dz) / (1 - dz);
    }
  };

  /* mulberry32 — small, fast, seedable */
  RL.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };

  /* ---------------- arena signed distance field ----------------
     The playable volume is the union of the main rounded box and the two
     goal boxes.  Union of solids = min() of their signed distances, which
     means walls, the curved corners and the insides of both nets all fall
     out of one function.  Negative = inside, and -sd is the distance to
     the nearest surface.                                                */

  function sdRoundBox(px, py, pz, hx, hy, hz, r) {
    var qx = Math.abs(px) - (hx - r),
      qy = Math.abs(py) - (hy - r),
      qz = Math.abs(pz) - (hz - r);
    var ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
    var outer = Math.sqrt(ox * ox + oy * oy + oz * oz);
    var m = qx > qy ? qx : qy; if (qz > m) m = qz;
    return outer + (m < 0 ? m : 0) - r;
  }

  /* signed distance to the arena shell; < 0 inside the playable volume */
  function arenaSD(x, y, z) {
    var A = ARENA;
    var d = sdRoundBox(x, y - A.h * 0.5, z, A.hx, A.h * 0.5, A.hz, A.r);
    // net boxes, punched through each end wall and into the corner fillet
    var g1 = sdRoundBox(x, y - A.goalH * 0.5, z - A.goalCz,
      A.goalW, A.goalH * 0.5, A.goalHz, A.goalR);
    if (g1 < d) d = g1;
    var g2 = sdRoundBox(x, y - A.goalH * 0.5, z + A.goalCz,
      A.goalW, A.goalH * 0.5, A.goalHz, A.goalR);
    if (g2 < d) d = g2;
    return d;
  }
  RL.arenaSD = arenaSD;

  /* distance from an interior point to the nearest surface (>= 0 inside) */
  RL.surfaceDist = function (p) { return -arenaSD(p.x, p.y, p.z); };

  /* inward-facing surface normal at p, via central differences */
  var _e = 0.05;
  RL.surfaceNormal = function (p, out) {
    var x = p.x, y = p.y, z = p.z;
    var nx = arenaSD(x + _e, y, z) - arenaSD(x - _e, y, z);
    var ny = arenaSD(x, y + _e, z) - arenaSD(x, y - _e, z);
    var nz = arenaSD(x, y, z + _e) - arenaSD(x, y, z - _e);
    var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    // gradient points outward (toward increasing sd) -> negate for inward
    out.set(-nx / len, -ny / len, -nz / len);
    return out;
  };

  /* is this point inside a scoring net? returns 0 / +1 (z+ net) / -1 (z- net) */
  RL.inNet = function (p) {
    var A = ARENA;
    if (Math.abs(p.x) > A.goalW || p.y > A.goalH) return 0;
    if (p.z > A.hz) return 1;
    if (p.z < -A.hz) return -1;
    return 0;
  };

  /* ---------------- persistent settings + progress ---------------- */

  var KEY = 'rocketRumbleR3';

  var DEFAULT_KEYS = {
    throttle: ['KeyW', 'ArrowUp'],
    reverse: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    jump: ['Space'],
    boost: ['ShiftLeft', 'KeyL'],
    drift: ['KeyK', 'ControlLeft'],
    airRoll: ['KeyJ', 'AltLeft'],
    ballCam: ['KeyC'],
    reset: ['KeyR'],
    pause: ['Escape', 'KeyP']
  };
  RL.DEFAULT_KEYS = DEFAULT_KEYS;

  RL.ACTION_LABELS = [
    ['throttle', 'Accelerate'],
    ['reverse', 'Reverse / Brake'],
    ['left', 'Steer Left'],
    ['right', 'Steer Right'],
    ['jump', 'Jump / Flip'],
    ['boost', 'Boost'],
    ['drift', 'Powerslide'],
    ['airRoll', 'Air Roll (hold)'],
    ['ballCam', 'Ball Camera'],
    ['reset', 'Reset Car'],
    ['pause', 'Pause']
  ];

  function defaults() {
    return {
      keys: JSON.parse(JSON.stringify(DEFAULT_KEYS)),
      quality: 'auto',        // auto | high | medium | low
      difficulty: 'pro',      // rookie | pro | allstar | legend
      ballCam: true,
      camDist: 9.0,
      camHeight: 3.1,
      camFov: 82,
      shake: 1.0,
      invertPitch: false,
      deadzone: 0.16,
      steerSens: 1.0,
      airSens: 1.0,
      smoothSteer: true,      // ease keyboard steering in instead of full lock
      assistLevel: true,      // auto-level in the air so you land on your wheels
      sfxVol: 0.85,
      musicVol: 0.45,
      touchLayout: 'left',    // which side the virtual stick sits on
      touchScale: 1.0,
      carColor: 0,
      carBody: 0,
      unlocked: 1,            // highest level unlocked (1-based)
      stars: {},              // levelId -> 0..3
      bestGoals: {},
      totalGoals: 0,
      totalWins: 0,
      seenTutorial: false
    };
  }
  RL.defaults = defaults;

  var save = defaults();
  try {
    var raw = global.localStorage && global.localStorage.getItem(KEY);
    if (raw) {
      var loaded = JSON.parse(raw);
      for (var k in loaded) if (Object.prototype.hasOwnProperty.call(save, k)) save[k] = loaded[k];
      // make sure a newly added action never ends up unbound
      for (var a in DEFAULT_KEYS) if (!save.keys[a]) save.keys[a] = DEFAULT_KEYS[a].slice();
    }
  } catch (e) { /* private browsing — run on defaults */ }

  RL.save = save;
  var saveTimer = null;
  RL.persist = function () {
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      try { global.localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { }
    }, 250);
  };
  RL.resetSave = function () {
    var d = defaults();
    for (var k in d) save[k] = d[k];
    try { global.localStorage.removeItem(KEY); } catch (e) { }
  };

  /* ---------------- device sniffing ---------------- */

  var ua = global.navigator ? global.navigator.userAgent : '';
  RL.isTouch = ('ontouchstart' in global) ||
    (global.navigator && global.navigator.maxTouchPoints > 0);
  RL.isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (/Mac/.test(ua) && global.navigator && global.navigator.maxTouchPoints > 1);
  RL.isMobile = RL.isTouch && Math.min(global.innerWidth, global.innerHeight) < 900;

  RL.autoQuality = function () {
    var q = RL.save.quality;
    if (q !== 'auto') return q;
    var dpr = global.devicePixelRatio || 1;
    var px = global.innerWidth * global.innerHeight * dpr * dpr;
    if (RL.isMobile) return px > 3.2e6 ? 'medium' : 'medium';
    return px > 6e6 ? 'high' : 'high';
  };

})(window);
