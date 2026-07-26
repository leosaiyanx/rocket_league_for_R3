/* ============================================================
   ai.js — the opponents.

   Bots drive through the exact same physics and the exact same input
   struct as the player: no cheating, no teleporting, no infinite boost.
   They get good by reading the shared ball prediction, solving for an
   intercept, and aiming the ball rather than just chasing it.
   ============================================================ */
(function (global) {
  'use strict';
  var RL = global.RL, T = global.THREE, M = RL.M, C = RL.CAR, A = RL.ARENA, BL = RL.BALL;

  /* ---------------- difficulty profiles ---------------- */

  var SKILLS = RL.SKILLS = {
    rookie: {
      label: 'Rookie', react: 0.30, aimErr: 0.30, predErr: 3.4, throttleCap: 0.80,
      boostSkill: 0.25, aerial: 0.0, aggression: 0.45, flip: 0.20, demo: 0.0,
      recover: 0.35, speedCtl: 0.35, savvy: 0.25, kickoffLag: 0.85
    },
    pro: {
      label: 'Pro', react: 0.17, aimErr: 0.15, predErr: 1.6, throttleCap: 1.0,
      boostSkill: 0.6, aerial: 0.35, aggression: 0.68, flip: 0.6, demo: 0.1,
      recover: 0.7, speedCtl: 0.7, savvy: 0.6, kickoffLag: 0.45
    },
    allstar: {
      label: 'All-Star', react: 0.10, aimErr: 0.075, predErr: 0.7, throttleCap: 1.0,
      boostSkill: 0.85, aerial: 0.75, aggression: 0.85, flip: 0.85, demo: 0.30,
      recover: 0.9, speedCtl: 0.9, savvy: 0.85, kickoffLag: 0.18
    },
    legend: {
      label: 'Legend', react: 0.055, aimErr: 0.032, predErr: 0.25, throttleCap: 1.0,
      boostSkill: 1.0, aerial: 0.95, aggression: 1.0, flip: 1.0, demo: 0.45,
      recover: 1.0, speedCtl: 1.0, savvy: 1.0, kickoffLag: 0
    }
  };
  RL.SKILL_ORDER = ['rookie', 'pro', 'allstar', 'legend'];

  /* ---------------- helpers ---------------- */

  /* how long to cover `d` starting at `v0`, accelerating at `a`, capped at vmax */
  function travelTime(d, v0, vmax, a) {
    if (d <= 0) return 0;
    if (v0 < 0) v0 = 0;
    if (v0 >= vmax) return d / vmax;
    var tAcc = (vmax - v0) / a;
    var dAcc = v0 * tAcc + 0.5 * a * tAcc * tAcc;
    if (dAcc >= d) return (-v0 + Math.sqrt(v0 * v0 + 2 * a * d)) / a;
    return tAcc + (d - dAcc) / vmax;
  }

  /* orientation PD controller -> pitch/yaw/roll inputs */
  var _du = new T.Vector3(), _df = new T.Vector3(), _dr = new T.Vector3(),
    _dm = new T.Matrix4(), _dq = new T.Quaternion(), _eq = new T.Quaternion(),
    _ax = new T.Vector3(), _iq = new T.Quaternion(), _lw = new T.Vector3();

  function orientTo(car, upX, upY, upZ, fwX, fwY, fwZ, out, gain) {
    _du.set(upX, upY, upZ).normalize();
    _df.set(fwX, fwY, fwZ);
    _df.addScaledVector(_du, -_df.dot(_du));
    if (_df.lengthSq() < 1e-6) _df.set(0, 0, 1).addScaledVector(_du, -_du.z);
    _df.normalize();
    _dr.copy(_du).cross(_df).normalize();          // right = up x forward
    _dm.makeBasis(_dr, _du, _df);
    _dq.setFromRotationMatrix(_dm);

    _iq.copy(car.quat).invert();
    _eq.copy(_dq).premultiply(_iq);                // error, in car-local space
    _eq.normalize();
    // q and -q are the same rotation; pick the one that gives the short way round
    if (_eq.w < 0) { _eq.x = -_eq.x; _eq.y = -_eq.y; _eq.z = -_eq.z; _eq.w = -_eq.w; }
    var w = M.clamp(_eq.w, -1, 1);
    var angle = 2 * Math.acos(w);                  // now always in [0, PI]
    var s = Math.sqrt(1 - w * w);
    if (s < 1e-5) _ax.set(0, 0, 0);
    else _ax.set(_eq.x / s, _eq.y / s, _eq.z / s).multiplyScalar(angle);

    // current angular velocity in car-local space, for the damping term
    _lw.copy(car.ang).applyQuaternion(_iq);

    // driveAir builds local angular velocity as
    //   (pitch*airPitch, yaw*airYaw, -roll*airRoll)
    // so invert that mapping to turn a wanted rotation into stick inputs.
    var P = 5.0 * (gain === undefined ? 1 : gain), D = 0.62;
    out.pitch = M.clamp((_ax.x * P - _lw.x * D * P * 0.34) / C.airPitch, -1, 1);
    out.yaw = M.clamp((_ax.y * P - _lw.y * D * P * 0.34) / C.airYaw, -1, 1);
    out.roll = M.clamp(-(_ax.z * P - _lw.z * D * P * 0.34) / C.airRoll, -1, 1);
  }

  /* ---------------- Bot ---------------- */

  var _t = new T.Vector3(), _t2 = new T.Vector3(), _t3 = new T.Vector3(),
    _fw = new T.Vector3(), _up = new T.Vector3(), _acc = new T.Vector3(),
    _bp = new T.Vector3();

  function Bot(game, car, skillKey, seed) {
    this.game = game;
    this.car = car;
    this.S = SKILLS[skillKey] || SKILLS.pro;
    this.rnd = RL.rng(seed || ((Math.random() * 1e9) | 0));
    this.timer = 0;
    this.mode = 'chase';         // chase | defend | boost | aerial | demo | kickoff | recover
    this.target = new T.Vector3();
    this.targetT = 0;            // seconds until we want to be there
    this.eta = 99;
    this.aerialTime = 0;
    this.aerialTarget = new T.Vector3();
    this.flipSeq = 0;            // running a press-release-press dodge
    this.hopSeq = 0;             // running a single hop
    this.hopCool = 0;
    this.flipCool = 0;
    this.aerialCool = 0;
    this.wiggle = this.rnd() * 6.28;
    this.orient = { pitch: 0, yaw: 0, roll: 0 };
    this.stuck = 0;
    car.role = 'attack';
  }

  /* A dodge needs jump, release, jump-with-direction. Firing `jump = true`
     on a single frame only ever produces a plain hop, so both moves are
     driven as timed sequences with their own cooldowns — otherwise a
     per-frame random check machine-guns the jump button. */
  Bot.prototype.startFlip = function () {
    if (this.flipCool > 0 || this.flipSeq > 0 || !this.car.onGround) return;
    this.flipCool = 1.3;
    this.flipSeq = 0.155;
  };
  Bot.prototype.startHop = function () {
    if (this.hopCool > 0 || this.hopSeq > 0 || this.flipSeq > 0 || !this.car.onGround) return;
    this.hopCool = 1.4;
    this.hopSeq = 0.065;
  };

  Bot.prototype.myGoalZ = function () { return this.car.team === 0 ? -A.hz : A.hz; };
  Bot.prototype.theirGoalZ = function () { return this.car.team === 0 ? A.hz : -A.hz; };

  /* read a sample out of the shared prediction buffer */
  Bot.prototype.pred = function (i, out) {
    var p = this.game.pred, n = this.game.predN;
    if (i >= n) i = n - 1;
    if (i < 0) i = 0;
    return out.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  };

  /* earliest prediction sample this car could plausibly reach */
  Bot.prototype.solveIntercept = function () {
    var car = this.car, S = this.S;
    var vmax = car.boost > 12 ? C.maxSpeed : C.maxDrive;
    var accel = C.accel * 0.62 + (car.boost > 12 ? C.boostAccel * 0.55 : 0);
    var speed = car.speed;
    var dtP = this.game.predDt;
    // Only consider intercepts a driving car could actually reach. Letting
    // this run up to aerial height makes the bot position under balls it
    // can't touch; genuine aerials are chosen separately in decide().
    var maxAir = 2.4 + S.aerial * 4.5;

    var best = -1, bestT = 0;
    var step = this.game.predN > 90 ? 2 : 1;
    for (var i = 1; i < this.game.predN; i += step) {
      this.pred(i, _bp);
      if (_bp.y > maxAir) continue;
      var t = i * dtP;
      var dx = _bp.x - car.pos.x, dy = _bp.y - car.pos.y, dz = _bp.z - car.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      // rough turning cost
      car.forward(_fw);
      var ang = Math.abs(Math.atan2(dx * _fw.z - dz * _fw.x, dx * _fw.x + dz * _fw.z));
      var tt = travelTime(d, speed, vmax, accel) + ang * 0.22;
      if (_bp.y > 2.4) tt += (_bp.y - 2.4) * 0.10;      // getting up there costs time
      if (tt <= t) { best = i; bestT = t; break; }
    }
    if (best < 0) { best = this.game.predN - 1; bestT = best * dtP; }
    this.eta = bestT;
    return best;
  };

  /* where in the opponent's net should we aim? away from whoever is home. */
  Bot.prototype.aimPoint = function (from, out) {
    var gz = this.theirGoalZ();
    var keeper = null, kd = 1e9;
    var cars = this.game.cars;
    for (var i = 0; i < cars.length; i++) {
      var o = cars[i];
      if (o.team === this.car.team || o.demoed > 0) continue;
      var d = Math.abs(o.pos.z - gz) + Math.abs(o.pos.x) * 0.35;
      if (d < kd) { kd = d; keeper = o; }
    }
    var x = 0;
    if (keeper && kd < 30) {
      // shoot at the open side
      x = keeper.pos.x > 0 ? -A.goalW * 0.62 : A.goalW * 0.62;
    } else {
      x = (this.rnd() - 0.5) * A.goalW * 0.9;
    }
    // never aim so wide we clip the post
    x = M.clamp(x, -A.goalW * 0.72, A.goalW * 0.72);
    return out.set(x, A.goalH * 0.34, gz + M.sign(gz) * 1.2);
  };

  /* ---------------- the plan ---------------- */

  Bot.prototype.decide = function () {
    var car = this.car, S = this.S, game = this.game;
    var ball = game.ball;
    var myZ = this.myGoalZ(), theirZ = this.theirGoalZ();
    var toOwn = M.sign(myZ);

    // straight after a kickoff everyone runs the rush-and-flip routine
    if (game.kickoffTimer > 0) { this.mode = 'kickoff'; return; }

    var idx = this.solveIntercept();
    this.pred(idx, _bp);
    this.targetT = idx * game.predDt;

    // --- how dangerous is this for us? ---
    var threat = 0;
    for (var i = 0; i < game.predN; i += 3) {
      this.pred(i, _t);
      if (Math.abs(_t.z - myZ) < 34 && Math.abs(_t.x) < 26) {
        threat = Math.max(threat, 1 - i / game.predN);
      }
    }
    var ballTowardUs = (ball.vel.z * toOwn) > 4;

    // --- demolition run? ---
    if (S.demo > 0.2 && car.supersonic && car.boost > 20) {
      var victim = this.findDemoTarget();
      if (victim && this.rnd() < S.demo) {
        this.mode = 'demo'; this.victim = victim; return;
      }
    }

    // --- low on boost and nothing urgent? go shopping ---
    var urgent = threat > 0.55 || this.eta < 1.1;
    if (car.boost < 22 * S.boostSkill + 8 && !urgent && S.boostSkill > 0.2) {
      var pad = this.findPad();
      if (pad) { this.mode = 'boost'; this.target.set(pad.x, 0, pad.z); return; }
    }

    // --- defend ---
    if (car.role === 'defend' || (threat > 0.62 && ballTowardUs && this.eta > 0.9)) {
      this.mode = 'defend';
      // is the ball close enough that we should just smash it clear?
      var distBall = car.pos.distanceTo(ball.pos);
      if (distBall < 22 && Math.abs(ball.pos.z - myZ) < 40) {
        this.mode = 'clear';
      }
      return;
    }

    // --- aerial? only from a side that sends the ball the right way ---
    if (_bp.y > 3.6 && S.aerial > 0.25 && car.boost > 34 && car.onGround &&
      this.aerialCool <= 0) {
      var flat = Math.hypot(_bp.x - car.pos.x, _bp.z - car.pos.z);
      var climbTime = this.targetT;
      // are we on the correct side of the ball to send it upfield?
      var goodSide = (_bp.z - car.pos.z) * M.sign(theirZ) > -6;
      if (goodSide && climbTime > 0.5 && climbTime < 2.3 && flat < 28 &&
        _bp.y < 3.0 + S.aerial * 12 && this.rnd() < 0.25 + S.aerial * 0.5) {
        this.mode = 'aerial';
        this.aerialCool = 2.5;
        this.aerialTarget.copy(_bp);
        this.aerialTime = climbTime;
        return;
      }
    }

    this.mode = 'chase';
  };

  Bot.prototype.findDemoTarget = function () {
    var car = this.car, cars = this.game.cars;
    car.forward(_fw);
    var best = null, bd = 1e9;
    for (var i = 0; i < cars.length; i++) {
      var o = cars[i];
      if (o.team === car.team || o.demoed > 0) continue;
      _t.copy(o.pos).sub(car.pos);
      var d = _t.length();
      if (d > 34 || d < 3) continue;
      _t.multiplyScalar(1 / d);
      if (_t.dot(_fw) < 0.86) continue;
      // not worth it if the ball needs us
      if (this.game.ball.pos.distanceTo(car.pos) < 18) continue;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  };

  Bot.prototype.findPad = function () {
    var car = this.car, pads = this.game.arena.pads;
    car.forward(_fw);
    var best = null, bs = -1e9;
    for (var i = 0; i < pads.length; i++) {
      var p = pads[i];
      if (p.timer > 0) continue;
      var dx = p.x - car.pos.x, dz = p.z - car.pos.z;
      var d = Math.hypot(dx, dz);
      if (d < 2 || d > 56) continue;
      var ang = (dx * _fw.x + dz * _fw.z) / d;          // 1 = straight ahead
      var score = (p.big ? 34 : 10) - d * 0.55 + ang * 12;
      // prefer pads on our own side when we're defending
      if (car.role !== 'attack' && M.sign(p.z) !== M.sign(this.myGoalZ())) score -= 14;
      if (score > bs) { bs = score; best = p; }
    }
    return best;
  };

  /* ---------------- execution ---------------- */

  Bot.prototype.update = function (dt) {
    var car = this.car, S = this.S, game = this.game, inp = car.input;
    if (car.demoed > 0) {
      inp.throttle = 0; inp.steer = 0; inp.jump = false; inp.boost = false;
      inp.pitch = 0; inp.yaw = 0; inp.roll = 0; inp.drift = false;
      return;
    }

    this.timer -= dt;
    this.flipCool = Math.max(0, this.flipCool - dt);
    this.hopCool = Math.max(0, this.hopCool - dt);
    this.aerialCool = Math.max(0, this.aerialCool - dt);
    if (this.timer <= 0) {
      this.timer = S.react * (0.75 + this.rnd() * 0.5);
      this.decide();
    }

    // reset input each frame
    inp.throttle = 0; inp.steer = 0; inp.jump = false; inp.boost = false;
    inp.drift = false; inp.pitch = 0; inp.yaw = 0; inp.roll = 0; inp.airRoll = false;

    if (this.mode === 'aerial' && !car.onGround) { this.flyAerial(dt); return; }
    if (!car.onGround && car.airTime > 0.12) { this.recover(dt); }

    switch (this.mode) {
      case 'kickoff': this.doKickoff(dt); break;
      case 'demo': this.doDemo(dt); break;
      case 'boost': this.driveTo(this.target, dt, 1.0, true); break;
      case 'defend': this.doDefend(dt); break;
      case 'clear': this.doStrike(dt, true); break;
      case 'aerial': this.doAerialLaunch(dt); break;
      default: this.doStrike(dt, false); break;
    }

    // --- jump sequencing, applied last so it always wins ---
    if (this.flipSeq > 0) {
      this.flipSeq -= dt;
      if (this.flipSeq > 0.100) { inp.jump = true; inp.pitch = 0; }
      else if (this.flipSeq > 0.055) { inp.jump = false; }
      else { inp.jump = true; inp.pitch = 1; inp.steer = 0; }   // front dodge
    } else if (this.hopSeq > 0) {
      this.hopSeq -= dt;
      inp.jump = this.hopSeq > 0.025;
      inp.pitch = 0;
    }

    // never leave the throttle pinned past what this tier is allowed
    inp.throttle = M.clamp(inp.throttle, -1, S.throttleCap);
  };

  /* --- steer/throttle toward a world point --- */
  Bot.prototype.driveTo = function (target, dt, speedWant, allowBoost, arriveIn) {
    var car = this.car, S = this.S, inp = car.input;
    _t.copy(target).sub(car.pos);
    var dist = _t.length();
    if (dist < 0.001) return;

    car.forward(_fw);
    car.upVec(_up);
    // work in the car's own surface plane so wall driving steers correctly
    _t.addScaledVector(_up, -_t.dot(_up));
    var flat = _t.length();
    if (flat < 0.001) { inp.throttle = 1; return; }
    _t.multiplyScalar(1 / flat);

    _t2.copy(_up).cross(_fw);                       // right
    var fwdDot = _t.dot(_fw), rightDot = _t.dot(_t2);
    var ang = Math.atan2(rightDot, fwdDot);

    var steer = M.clamp(ang * 2.7, -1, 1);
    var absAng = Math.abs(ang);

    // stuck against a wall or spinning in place? back out
    if (car.speed < 2.2 && car.onGround) this.stuck += dt; else this.stuck = 0;
    if (this.stuck > 0.7) {
      inp.throttle = -1;
      inp.steer = -M.sign(steer) || 1;
      if (this.stuck > 1.9) this.stuck = 0;
      return;
    }

    if (absAng > 2.05 && dist < 11) {
      // it's behind us and close: reverse into position
      inp.throttle = -0.85;
      inp.steer = -steer;
      return;
    }

    inp.steer = steer;
    inp.drift = absAng > 0.95 && car.speed > 13 && S.savvy > 0.3;

    // speed control: don't arrive early and overshoot the ball
    var want = 1;
    if (arriveIn !== undefined && arriveIn > 0.05 && S.speedCtl > 0.2) {
      var needV = dist / arriveIn;
      if (car.speed > needV * 1.22) want = -0.35 * S.speedCtl;
      else if (car.speed > needV * 1.03) want = 0.08;
    }

    // Corner speed. The turn radius at 40 u/s is about 24 units, so a bot at
    // full tilt physically cannot come back to a ball off to one side — it
    // just orbits. Trade speed for the turn instead.
    var cornerCap = C.maxDrive * M.clamp(1.05 - absAng * 0.62, 0.26, 1);
    var tooFast = car.speed > cornerCap;
    if (tooFast && S.speedCtl > 0.2) want = Math.min(want, -0.55 * S.speedCtl);

    inp.throttle = want * (speedWant === undefined ? 1 : speedWant);
    if (inp.throttle > 0 && absAng > 1.45) inp.throttle *= 0.55;

    // boost when it's pointing where we want to go and we actually need speed
    var keep = (1 - S.boostSkill) * 18;
    if (allowBoost && !tooFast && car.boost > keep && absAng < 0.30 && want > 0.4 &&
      (arriveIn === undefined || dist / Math.max(1, car.speed) > arriveIn * 0.85) &&
      car.speed < C.maxSpeed - 1) {
      inp.boost = true;
    }

    // speed flip on long straights, when boost isn't an option
    if (S.flip > 0.4 && car.onGround && absAng < 0.16 &&
      dist > 26 && car.speed > 17 && car.speed < C.maxDrive * 0.98 && car.boost < 12) {
      this.startFlip();
    }
  };

  /* --- attack: hit the ball toward their net --- */
  Bot.prototype.doStrike = function (dt, clearing) {
    var car = this.car, S = this.S, game = this.game, inp = car.input;
    var idx = this.solveIntercept();
    this.pred(idx, _bp);
    var tAvail = idx * game.predDt;

    // where do we want the ball to end up?
    if (clearing) {
      // upfield and wide — never back through our own net
      var side = car.pos.x >= 0 ? 1 : -1;
      _t2.set(side * (A.hx - 6), 2.0, M.sign(this.theirGoalZ()) * 12);
    } else {
      this.aimPoint(_bp, _t2);
    }

    // approach vector: line up behind the ball, opposite the aim direction
    _t.copy(_t2).sub(_bp);
    _t.y *= 0.35;
    if (_t.lengthSq() < 1e-6) _t.set(0, 0, M.sign(this.theirGoalZ()));
    _t.normalize();

    // aim error, scaled by difficulty
    var e = S.aimErr;
    if (e > 0.001) {
      var a = (this.rnd() - 0.5) * e * 2;
      var cx = Math.cos(a), sx = Math.sin(a);
      var nx = _t.x * cx - _t.z * sx, nz = _t.x * sx + _t.z * cx;
      _t.x = nx; _t.z = nz;
    }

    // Are we behind the ball on the shot line AND pointed at it?  Only then
    // do we drive clean through it.  Committing on proximity alone makes the
    // car charge past a ball that's sitting off to one side.
    _t3.set(_bp.x - car.pos.x, 0, _bp.z - car.pos.z);
    var toBall = _t3.length();
    if (toBall > 0.001) _t3.multiplyScalar(1 / toBall);
    car.forward(_fw);
    var lined = _t3.x * _t.x + _t3.z * _t.z;
    var facing = _t3.x * _fw.x + _t3.z * _fw.z;
    var committed = lined > 0.62 && facing > 0.50;

    // give ourselves a longer run-up the faster we're going
    var off = BL.radius + car.B.L * 0.5 + 0.12 + M.clamp(car.speed * 0.22, 0, 6);
    if (committed) _bp.addScaledVector(_t, 2.0);      // aim past it
    else _bp.addScaledVector(_t, -off);               // swing in behind it

    // prediction error: worse bots misjudge where the ball will be
    if (S.predErr > 0.01) {
      _bp.x += (this.rnd() - 0.5) * S.predErr;
      _bp.z += (this.rnd() - 0.5) * S.predErr;
    }
    _bp.y = Math.max(C.ride, _bp.y);
    this.target.copy(_bp);

    // no arrival braking once we've committed — we want speed at contact
    this.driveTo(this.target, dt, 1.0, true, committed ? undefined : tAvail);

    // close the deal: flip into the ball for a power shot
    var d = car.pos.distanceTo(game.ball.pos);
    if (S.flip > 0.25 && car.onGround && d < 5.4 && d > 2.3 &&
      car.speed > 11 && game.ball.pos.y < 3.4) {
      car.forward(_fw);
      _t.copy(game.ball.pos).sub(car.pos).normalize();
      if (_t.dot(_fw) > 0.86 && this.rnd() < S.flip) this.startFlip();
    }

    // small hop to nudge a ball sitting just above bonnet height — but only
    // when we're actually pointed at it, or we just bunny-hop on the spot
    if (car.onGround && game.ball.pos.y > 2.0 && game.ball.pos.y < 4.4 && d < 4.2 &&
      S.savvy > 0.4) {
      car.forward(_fw);
      _t.copy(game.ball.pos).sub(car.pos).normalize();
      if (_t.dot(_fw) > 0.72) this.startHop();
    }
  };

  /* --- defend: hold the goal mouth, intercept anything on target --- */
  Bot.prototype.doDefend = function (dt) {
    var car = this.car, game = this.game, ball = game.ball;
    var gz = this.myGoalZ(), toOwn = M.sign(gz);

    // find the first predicted point that reaches our defensive third
    var px = ball.pos.x, pz = ball.pos.z, tt = 0.6;
    for (var i = 1; i < game.predN; i += 2) {
      this.pred(i, _t);
      if ((_t.z - gz) * toOwn > -18) { px = _t.x; pz = _t.z; tt = i * game.predDt; break; }
      px = _t.x; pz = _t.z; tt = i * game.predDt;
    }

    // sit on the line between that point and the middle of our net,
    // a few units off the goal so we can still challenge
    var standoff = 9.5;
    var tx = M.clamp(px * 0.55, -A.goalW - 3.5, A.goalW + 3.5);
    var tz = gz + (-toOwn) * standoff;

    // if it's coming in hot and close, step up and meet it
    if (ball.pos.y < 5 && Math.abs(ball.pos.z - gz) < 26) {
      tx = M.clamp(ball.pos.x * 0.8, -A.goalW - 6, A.goalW + 6);
      tz = gz + (-toOwn) * Math.min(16, Math.abs(ball.pos.z - gz) * 0.55);
    }

    this.target.set(tx, C.ride, tz);
    this.driveTo(this.target, dt, 1.0, this.S.boostSkill > 0.4, tt);

    // face the play once we're parked
    if (car.pos.distanceTo(this.target) < 3.5) {
      _t.copy(ball.pos).sub(car.pos);
      car.forward(_fw); car.upVec(_up);
      _t2.copy(_up).cross(_fw);
      var ang = Math.atan2(_t.dot(_t2), _t.dot(_fw));
      car.input.steer = M.clamp(ang * 2.2, -1, 1);
      car.input.throttle = Math.abs(ang) > 0.25 ? 0.42 : 0;
    }

    // a save: if it's about to arrive above bonnet height, jump at it
    var d = car.pos.distanceTo(ball.pos);
    if (d < 6.5 && ball.pos.y > 1.9 && ball.pos.y < 6 && car.onGround &&
      this.S.savvy > 0.35) {
      this.startHop();
    }
  };

  /* --- kickoff --- */
  Bot.prototype.doKickoff = function (dt) {
    var car = this.car, inp = car.input, game = this.game, S = this.S;

    // A beat of reaction time off the line, so a player still finding the
    // accelerate key isn't punished before they've moved. Legend gets none.
    var lag = S.kickoffLag || 0;
    if (game.kickoffTimer > 3.0 - lag) {
      inp.throttle = 0; inp.steer = 0; inp.boost = false;
      return;
    }

    _t.set(0, C.ride, 0);
    // the closest car goes straight in; the others cheat toward their side
    var mine = car.pos.length(), iAmFirst = true;
    for (var i = 0; i < game.cars.length; i++) {
      var o = game.cars[i];
      if (o.team !== car.team || o === car) continue;
      if (o.pos.length() < mine - 0.01) iAmFirst = false;
    }
    if (!iAmFirst) {
      _t.set(M.sign(car.pos.x || 1) * 12, C.ride, this.myGoalZ() * 0.42);
      this.driveTo(_t, dt, 1.0, false);
      return;
    }

    this.driveTo(_t, dt, 1.0, true);
    inp.boost = car.boost > 0;
    var d2 = car.pos.length();
    if (d2 < 11.5 && car.onGround && car.speed > 14) this.startFlip();
  };

  /* --- demo run --- */
  Bot.prototype.doDemo = function (dt) {
    var v = this.victim;
    if (!v || v.demoed > 0) { this.mode = 'chase'; return; }
    // lead the target a little
    _t.copy(v.pos).addScaledVector(v.vel, 0.22);
    this.driveTo(_t, dt, 1.0, true);
    this.car.input.boost = this.car.boost > 0;
  };

  /* --- aerial: launch --- */
  Bot.prototype.doAerialLaunch = function (dt) {
    var car = this.car, inp = car.input;
    // get roughly under the target first, then jump
    _t.set(this.aerialTarget.x, C.ride, this.aerialTarget.z);
    var flat = Math.hypot(this.aerialTarget.x - car.pos.x, this.aerialTarget.z - car.pos.z);
    car.forward(_fw);
    _t2.copy(this.aerialTarget).sub(car.pos); _t2.y = 0;
    var aligned = _t2.lengthSq() > 1e-6 ? _t2.normalize().dot(_fw) : 1;

    this.driveTo(_t, dt, 1.0, false, this.aerialTime);
    if (car.onGround && aligned > 0.90 && flat < this.aerialTime * 24 + 3) {
      this.startHop();
    }
    this.aerialTime -= dt;
    if (this.aerialTime < -0.5) this.mode = 'chase';
  };

  /* --- aerial: in the air, steer with boost --- */
  Bot.prototype.flyAerial = function (dt) {
    var car = this.car, inp = car.input, S = this.S;
    this.aerialTime -= dt;
    var t = Math.max(0.10, this.aerialTime);

    // keep the aerial target fresh against the live prediction
    var idx = Math.min(this.game.predN - 1, Math.round(t / this.game.predDt));
    this.pred(idx, _bp);
    if (_bp.distanceTo(this.aerialTarget) < 22) this.aerialTarget.copy(_bp);

    // Aim the aerial the same way a ground shot is aimed: meet the ball on
    // the far side from the goal we're shooting at.  Flying straight at the
    // ball and boosting is how a bot scores spectacular own goals.
    this.aimPoint(this.aerialTarget, _t2);
    _t.copy(_t2).sub(this.aerialTarget);
    _t.y *= 0.35;
    if (_t.lengthSq() < 1e-6) _t.set(0, 0, M.sign(this.theirGoalZ()));
    _t.normalize();
    _t3.copy(this.aerialTarget).addScaledVector(_t, -(BL.radius + car.B.L * 0.45));

    // classic aerial solve: what constant acceleration lands us on target?
    _acc.copy(_t3).sub(car.pos).addScaledVector(car.vel, -t)
      .multiplyScalar(2 / (t * t));
    _acc.y += C.gravity * this.game.world.gravity;

    var need = _acc.length();
    car.forward(_fw);
    // point the nose along the acceleration we need, and boost once lined up
    orientToward(car, _acc, this.orient);
    inp.pitch = this.orient.pitch; inp.yaw = this.orient.yaw; inp.roll = this.orient.roll;

    var align = need > 0.01 ? _fw.dot(_acc) / need : 0;
    inp.boost = align > 0.80 && need > C.gravity * 0.55 && car.boost > 0;

    // second jump for the last bit of height
    if (car.hasFlip && car.airTime > 0.14 && car.airTime < 0.34 && this.aerialTarget.y > 7 &&
      S.aerial > 0.6) {
      inp.jump = true;
    }

    if (this.aerialTime < -0.35 || car.boost <= 0 && align < 0.4) {
      this.mode = 'chase';
    }
  };

  /* point the car's nose at a direction, keeping roll sane */
  function orientToward(car, dir, out) {
    _du.set(0, 1, 0);
    // build an up vector perpendicular to dir that keeps the car upright-ish
    _dr.copy(dir).normalize();
    _du.addScaledVector(_dr, -_du.dot(_dr));
    if (_du.lengthSq() < 1e-4) _du.set(0, 0, 1).addScaledVector(_dr, -_dr.z);
    _du.normalize();
    orientTo(car, _du.x, _du.y, _du.z, _dr.x, _dr.y, _dr.z, out, 1.2);
  }

  /* --- airborne recovery: get the wheels pointing down --- */
  Bot.prototype.recover = function (dt) {
    var car = this.car, inp = car.input, S = this.S;
    if (S.recover < 0.1) return;

    // which way is "down" where we're going to land?
    _t.copy(car.pos).addScaledVector(car.vel, 0.35);
    RL.surfaceNormal(_t, _t2);
    // aim the nose along our travel direction
    _fw.copy(car.vel);
    _fw.addScaledVector(_t2, -_fw.dot(_t2));
    if (_fw.lengthSq() < 0.5) car.forward(_fw);
    _fw.normalize();

    orientTo(car, _t2.x, _t2.y, _t2.z, _fw.x, _fw.y, _fw.z, this.orient, 0.5 + S.recover * 0.9);
    inp.pitch = this.orient.pitch * S.recover;
    inp.yaw = this.orient.yaw * S.recover;
    inp.roll = this.orient.roll * S.recover;
    inp.airRoll = false;
  };

  /* ---------------- team coordination ----------------
     Called once per tick for the whole match, so roles are consistent
     and two bots never both abandon the net.                         */

  RL.assignRoles = function (game) {
    for (var team = 0; team < 2; team++) {
      var mates = [];
      for (var i = 0; i < game.cars.length; i++) {
        if (game.cars[i].team === team) mates.push(game.cars[i]);
      }
      if (!mates.length) continue;
      var gz = team === 0 ? -A.hz : A.hz;

      if (mates.length === 1) { mates[0].role = 'attack'; continue; }

      // closest to the ball attacks; furthest back defends; rest support
      mates.sort(function (a, b) {
        var da = a.pos.distanceTo(game.ball.pos) + (a.demoed > 0 ? 200 : 0);
        var db = b.pos.distanceTo(game.ball.pos) + (b.demoed > 0 ? 200 : 0);
        return da - db;
      });
      mates[0].role = 'attack';
      // the one nearest our own goal (excluding the attacker) holds the back
      var backIdx = 1, bestD = 1e9;
      for (var k = 1; k < mates.length; k++) {
        var d = Math.abs(mates[k].pos.z - gz);
        if (d < bestD) { bestD = d; backIdx = k; }
      }
      for (var j = 1; j < mates.length; j++) {
        mates[j].role = (j === backIdx) ? 'defend' : 'support';
      }
      // a support player behaves like a second attacker, held back a bit
      for (var s = 1; s < mates.length; s++) {
        if (mates[s].role === 'support' && mates[s].pos.distanceTo(game.ball.pos) < 16) {
          mates[s].role = 'attack';
        }
      }
    }
  };

  RL.Bot = Bot;
  RL.orientTo = orientTo;

})(window);
