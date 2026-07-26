/* ============================================================
   car.js — the battle-car: model, and the physics that makes it
   feel like Rocket League (wall driving, flips, aerials, demos).
   ============================================================ */
(function (global) {
  'use strict';
  var RL = global.RL, T = global.THREE, M = RL.M, C = RL.CAR, A = RL.ARENA;

  /* ---------------- body shapes ----------------
     Each one is a real handling trade-off, not just a repaint. */
  var BODIES = RL.BODIES = [
    { name: 'Turbo', desc: 'All-rounder', L: 2.30, W: 1.50, H: 0.68, nose: 0.80, roof: 0.62, wing: 0.55, speed: 1.00, turn: 1.00, power: 1.00 },
    { name: 'Dart', desc: 'Fast + nimble', L: 2.45, W: 1.36, H: 0.56, nose: 0.66, roof: 0.50, wing: 0.75, speed: 1.06, turn: 1.10, power: 0.90 },
    { name: 'Tank', desc: 'Heavy hitter', L: 2.20, W: 1.72, H: 0.86, nose: 0.92, roof: 0.80, wing: 0.35, speed: 0.94, turn: 0.90, power: 1.16 },
    { name: 'Wedge', desc: 'Grippy sniper', L: 2.55, W: 1.44, H: 0.50, nose: 0.55, roof: 0.44, wing: 0.95, speed: 1.02, turn: 1.06, power: 0.96 }
  ];

  RL.ACCENTS = [
    { name: 'Inferno', c: 0xff6a1a }, { name: 'Electric', c: 0x2ee6ff },
    { name: 'Venom', c: 0x8cff3a }, { name: 'Royal', c: 0xa259ff },
    { name: 'Gold', c: 0xffc93c }, { name: 'Hot Pink', c: 0xff3d9a },
    { name: 'Arctic', c: 0xeaf6ff }, { name: 'Crimson', c: 0xff2b4a }
  ];

  /* ---------------- mesh ---------------- */

  function shapeChassis(B) {
    var g = new T.BoxGeometry(B.W, B.H, B.L, 3, 3, 6);
    var p = g.attributes.position;
    var hw = B.W / 2, hh = B.H / 2, hl = B.L / 2;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      var tz = z / hl;                       // -1 tail .. +1 nose
      var ty = (y + hh) / B.H;               // 0 floor .. 1 roof

      // narrow the nose and pinch the tail slightly
      var wScale = 1 - 0.20 * Math.max(0, tz) * Math.max(0, tz) - 0.07 * Math.max(0, -tz);
      // the roof slopes down over the nose; the underside stays flat
      var topDrop = Math.max(0, tz) * (1 - B.nose) * B.H * 0.95;
      // shoulders get rounded off so it doesn't read as a shoebox
      var round = ty * ty * 0.16 * Math.abs(x) / hw;

      x *= wScale * (1 - round);
      if (y > 0) y -= topDrop * ty;
      // tuck the very bottom edge in for a chamfer
      if (ty < 0.2) x *= 0.90;
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return g;
  }

  function buildCarMesh(bodyIdx, teamColor, accentColor, quality) {
    var B = BODIES[bodyIdx % BODIES.length];
    var root = new T.Group();
    var refs = { wheels: [], flames: [], B: B };

    var bodyMat = new T.MeshPhongMaterial({
      color: teamColor, shininess: 78, specular: 0x9fb4d0, flatShading: false
    });
    var accentMat = new T.MeshPhongMaterial({ color: accentColor, shininess: 96, specular: 0xffffff });
    var darkMat = new T.MeshPhongMaterial({ color: 0x14161f, shininess: 30 });
    var glassMat = new T.MeshPhongMaterial({
      color: 0x0d1420, shininess: 160, specular: 0xbfe4ff,
      transparent: true, opacity: 0.72
    });
    refs.mats = [bodyMat, accentMat, darkMat, glassMat];

    var chassis = new T.Mesh(shapeChassis(B), bodyMat);
    chassis.castShadow = true;
    root.add(chassis);
    refs.chassis = chassis;

    // canopy
    var canopy = new T.Mesh(new T.BoxGeometry(B.W * 0.62, B.H * 0.52, B.L * 0.40, 1, 1, 1), glassMat);
    canopy.position.set(0, B.H * 0.44, -B.L * 0.02);
    canopy.scale.z = 1;
    root.add(canopy);

    // racing stripes down the spine
    var stripe = new T.Mesh(new T.BoxGeometry(B.W * 0.16, 0.02, B.L * 0.94), accentMat);
    stripe.position.set(0, B.H * 0.5 + 0.01, 0);
    root.add(stripe);

    // front splitter
    var splitter = new T.Mesh(new T.BoxGeometry(B.W * 0.96, 0.07, 0.28), accentMat);
    splitter.position.set(0, -B.H * 0.36, B.L * 0.48);
    root.add(splitter);

    // rear wing
    if (B.wing > 0.4) {
      var wing = new T.Mesh(new T.BoxGeometry(B.W * 0.92, 0.06, 0.34), accentMat);
      wing.position.set(0, B.H * 0.42 + B.wing * 0.22, -B.L * 0.46);
      wing.rotation.x = -0.16;
      root.add(wing);
      [-1, 1].forEach(function (s) {
        var strut = new T.Mesh(new T.BoxGeometry(0.07, B.wing * 0.30, 0.16), darkMat);
        strut.position.set(s * B.W * 0.34, B.H * 0.36 + B.wing * 0.10, -B.L * 0.45);
        root.add(strut);
      });
    }

    // headlights + tail lights
    var hlMat = new T.MeshBasicMaterial({ color: 0xfff3d0 });
    var tlMat = new T.MeshBasicMaterial({ color: 0xff2a2a });
    [-1, 1].forEach(function (s) {
      var hl = new T.Mesh(new T.BoxGeometry(0.24, 0.09, 0.05), hlMat);
      hl.position.set(s * B.W * 0.28, B.H * 0.02, B.L * 0.5);
      root.add(hl);
      var tl = new T.Mesh(new T.BoxGeometry(0.20, 0.08, 0.04), tlMat);
      tl.position.set(s * B.W * 0.26, B.H * 0.10, -B.L * 0.5);
      root.add(tl);
    });

    // wheels
    var wr = C.wheelR * (B.H / 0.68) * 0.94;
    var wheelGeo = new T.CylinderGeometry(wr, wr, 0.24, quality === 'low' ? 8 : 14);
    wheelGeo.rotateZ(Math.PI / 2);
    var rimGeo = new T.CylinderGeometry(wr * 0.55, wr * 0.55, 0.27, quality === 'low' ? 6 : 10);
    rimGeo.rotateZ(Math.PI / 2);
    var tyreMat = new T.MeshPhongMaterial({ color: 0x101116, shininess: 12 });
    var rimMat = new T.MeshPhongMaterial({ color: accentColor, shininess: 130, specular: 0xffffff });
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (q) {
      var w = new T.Group();
      var tyre = new T.Mesh(wheelGeo, tyreMat);
      var rim = new T.Mesh(rimGeo, rimMat);
      w.add(tyre, rim);
      w.position.set(q[0] * B.W * 0.50, -B.H * 0.20, q[1] * B.L * 0.33);
      w.userData.steers = q[1] > 0;
      root.add(w);
      refs.wheels.push(w);
    });
    refs.wheelGeo = [wheelGeo, rimGeo];
    refs.mats.push(tyreMat, rimMat, hlMat, tlMat);

    // boost nozzles + flames
    var nozMat = new T.MeshPhongMaterial({ color: 0x2a2f3d, shininess: 60 });
    [-1, 1].forEach(function (s) {
      var noz = new T.Mesh(new T.CylinderGeometry(0.11, 0.14, 0.18, 8), nozMat);
      noz.rotation.x = Math.PI / 2;
      noz.position.set(s * B.W * 0.24, -B.H * 0.02, -B.L * 0.52);
      root.add(noz);

      var flame = new T.Mesh(
        new T.ConeGeometry(0.17, 1.5, 9, 1, true),
        new T.MeshBasicMaterial({
          color: 0xffb43c, transparent: true, opacity: 0.9,
          blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
        })
      );
      flame.rotation.x = Math.PI / 2;
      flame.position.set(s * B.W * 0.24, -B.H * 0.02, -B.L * 0.52 - 0.75);
      flame.visible = false;
      root.add(flame);
      refs.flames.push(flame);
      refs.mats.push(flame.material);
    });
    refs.mats.push(nozMat);

    // supersonic / boost glow halo
    var halo = new T.Sprite(new T.SpriteMaterial({
      map: RL.blobTex(), color: 0x9fe8ff, transparent: true, opacity: 0,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    halo.scale.setScalar(4.2);
    root.add(halo);
    refs.halo = halo;

    return { root: root, refs: refs, B: B };
  }
  RL.buildCarMesh = buildCarMesh;

  /* ---------------- Car ---------------- */

  var _v1 = new T.Vector3(), _v2 = new T.Vector3(), _v3 = new T.Vector3(),
    _n = new T.Vector3(), _q = new T.Quaternion(), _m = new T.Matrix4(),
    _fwd = new T.Vector3(), _up = new T.Vector3(), _rgt = new T.Vector3(),
    _corner = new T.Vector3();

  function Car(game, opts) {
    this.game = game;
    this.team = opts.team;            // 0 = blue (defends -Z), 1 = orange (defends +Z)
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name || 'BOT';
    this.bodyIdx = opts.bodyIdx || 0;

    var built = buildCarMesh(this.bodyIdx, opts.teamColor, opts.accentColor, game.quality);
    this.mesh = built.root;
    this.refs = built.refs;
    this.B = built.B;
    this.teamColor = opts.teamColor;
    this.accentColor = opts.accentColor;

    this.pos = new T.Vector3();
    this.vel = new T.Vector3();
    this.quat = new T.Quaternion();
    this.ang = new T.Vector3();
    this.groundN = new T.Vector3(0, 1, 0);

    this.onGround = false;
    this.groundLock = 0;
    this.boost = 34;
    this.speed = 0;
    this.supersonic = false;

    this.jumpHeld = false;
    this.jumpTimer = 0;       // how long the first jump has been held
    this.hasFlip = false;
    this.flipWindow = 0;
    this.flipTimer = 0;
    this.flipAxis = new T.Vector3();
    this.airTime = 0;
    this.demoed = 0;
    this.lastTouch = 0;
    this.boosting = false;
    this.wheelSpin = 0;
    this.driftHeat = 0;

    this.input = {
      throttle: 0, steer: 0, jump: false, boost: false, drift: false,
      pitch: 0, yaw: 0, roll: 0, airRoll: false
    };
    this.prevJump = false;

    game.scene.add(this.mesh);
  }

  Car.prototype.basis = function () {
    _rgt.set(1, 0, 0).applyQuaternion(this.quat);
    _up.set(0, 1, 0).applyQuaternion(this.quat);
    _fwd.set(0, 0, 1).applyQuaternion(this.quat);
  };
  Car.prototype.forward = function (out) { return out.set(0, 0, 1).applyQuaternion(this.quat); };
  Car.prototype.upVec = function (out) { return out.set(0, 1, 0).applyQuaternion(this.quat); };

  Car.prototype.reset = function (x, y, z, heading) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.ang.set(0, 0, 0);
    this.quat.setFromAxisAngle(_v1.set(0, 1, 0), heading);
    this.onGround = true; this.groundLock = 0;
    this.groundN.set(0, 1, 0);
    this.hasFlip = false; this.flipTimer = 0; this.flipWindow = 0;
    this.jumpTimer = 0; this.jumpHeld = false;
    this.airTime = 0; this.demoed = 0;
    this.mesh.visible = true;
    this.sync();
  };

  Car.prototype.demolish = function () {
    if (this.demoed > 0) return false;
    this.demoed = C.respawn;
    this.mesh.visible = false;
    this.vel.set(0, 0, 0);
    return true;
  };

  /* ---------- the main step ---------- */

  Car.prototype.update = function (dt, world) {
    if (this.demoed > 0) {
      this.demoed -= dt;
      if (this.demoed <= 0) {
        var s = this.team === 0 ? -1 : 1;
        this.reset(0, C.ride, s * (A.hz - 6), s > 0 ? Math.PI : 0);
        this.boost = Math.max(this.boost, 34);
      }
      return;
    }

    var inp = this.input;
    var B = this.B;
    this.basis();

    /* ---- ground probe ---- */
    var d = RL.surfaceDist(this.pos);
    RL.surfaceNormal(this.pos, _n);
    var alignment = _n.dot(_up);
    this.groundLock = Math.max(0, this.groundLock - dt);

    var wantGround = d <= C.ride + C.stick && alignment > 0.35 && this.groundLock <= 0
      && this.flipTimer <= 0;
    // Speed is the only thing holding you onto a wall or the ceiling.
    // Without this you can crawl up the corner fillet at walking pace and
    // drive around the roof, which is neither fun nor Rocket League.
    if (wantGround && _n.y < 0.62 && this.speed < C.wallStickSpeed) wantGround = false;

    var justLanded = wantGround && !this.onGround;
    this.onGround = wantGround;

    if (this.onGround) {
      this.groundN.copy(_n);
      this.airTime = 0;
      this.hasFlip = false;
      this.flipWindow = 0;

      if (justLanded) {
        var impact = Math.abs(this.vel.dot(_n));
        if (impact > 3) {
          RL.Audio.sfxLand(impact);
          if (this.game.fx) this.game.fx.dust(this.pos, _n, Math.min(1, impact / 18));
        }
        // landing hard scrubs a little speed
        this.vel.addScaledVector(_n, -this.vel.dot(_n) * 1.0);
      }

      /* keep the wheels on the deck */
      var err = C.ride - d;
      this.pos.addScaledVector(_n, err * Math.min(1, dt * 32));
      var vn = this.vel.dot(_n);
      if (vn < 0) this.vel.addScaledVector(_n, -vn);
      this.vel.addScaledVector(_n, -C.stickForce * 0.10 * dt);   // gentle downforce

      /* orient: up = surface normal, keep the current heading */
      _v1.copy(_fwd).addScaledVector(_n, -_fwd.dot(_n));
      if (_v1.lengthSq() < 1e-5) _v1.copy(_rgt).cross(_n);
      _v1.normalize();
      _v2.copy(_n).cross(_v1).normalize();       // right = up x forward
      _m.makeBasis(_v2, _n, _v1);
      _q.setFromRotationMatrix(_m);
      this.quat.slerp(_q, 1 - Math.exp(-22 * dt));
      this.ang.set(0, 0, 0);
      this.basis();

      this.driveGround(dt, inp, B, world);
    } else {
      this.airTime += dt;
      this.vel.y -= C.gravity * world.gravity * dt;
      this.driveAir(dt, inp, B);
    }

    /* ---- boost (works on the ground and in the air) ---- */
    this.boosting = false;
    if (inp.boost && this.boost > 0 && this.flipTimer <= 0) {
      this.boost = Math.max(0, this.boost - C.boostUse * dt);
      this.vel.addScaledVector(_fwd, C.boostAccel * dt);
      this.boosting = true;
    }

    /* ---- jump / flip ---- */
    this.handleJump(dt, inp);

    /* ---- speed limits ---- */
    var sp = this.vel.length();
    var cap = C.maxSpeed;
    if (sp > cap) this.vel.multiplyScalar(cap / sp);
    this.speed = Math.min(sp, cap);
    this.supersonic = this.speed >= C.supersonic;

    /* ---- integrate ---- */
    this.pos.addScaledVector(this.vel, dt);

    if (!this.onGround) {
      var aLen = this.ang.length();
      if (aLen > 1e-5) {
        _q.setFromAxisAngle(_v1.copy(this.ang).multiplyScalar(1 / aLen), aLen * dt);
        this.quat.premultiply(_q);
        this.quat.normalize();
      }
    }

    /* ---- body vs arena (nose-first wall smacks) ---- */
    this.resolveBody(dt);

    /* ---- boost pads ---- */
    this.collectPads(dt);

    this.sync(dt);
  };

  Car.prototype.driveGround = function (dt, inp, B, world) {
    var fwdSpeed = this.vel.dot(_fwd);
    var latSpeed = this.vel.dot(_rgt);
    var absF = Math.abs(fwdSpeed);

    /* throttle: strong off the line, tapering to nothing at top speed */
    var th = inp.throttle;
    if (th > 0.02) {
      var head = M.clamp(1 - fwdSpeed / (C.maxDrive * B.speed), 0, 1);
      var acc = C.accel * B.speed * head * th;
      if (fwdSpeed < 0) acc = C.brake * th;                 // throttle while rolling back = brake
      this.vel.addScaledVector(_fwd, acc * dt);
    } else if (th < -0.02) {
      if (fwdSpeed > 0.4) {
        // braking: never let one frame yank us into reverse
        var stop = Math.min(fwdSpeed, C.brake * -th * dt);
        this.vel.addScaledVector(_fwd, -stop);
      } else {
        var rh = M.clamp(1 + fwdSpeed / C.reverseMax, 0, 1);
        this.vel.addScaledVector(_fwd, C.accel * 0.55 * th * rh * dt);
      }
    } else {
      // coasting drag
      var dec = Math.min(absF, C.coast * dt);
      this.vel.addScaledVector(_fwd, -M.sign(fwdSpeed) * dec);
    }

    /* steering — tighter at low speed, and it needs grip to bite */
    var speedT = M.clamp(absF / (C.maxDrive * B.speed), 0, 1);
    var turnRate = C.turn * B.turn * (1 - C.turnFalloff * speedT * speedT);
    var driftK = inp.drift ? 1.34 : 1.0;
    if (absF > 0.35) {
      var dirSign = fwdSpeed < 0 ? -1 : 1;
      var yaw = inp.steer * turnRate * driftK * dirSign * Math.min(1, absF / 5) * dt;
      // +yaw about the surface normal turns the car toward its own +X (right),
      // which is what steer = +1 means.
      _q.setFromAxisAngle(this.groundN, yaw);
      this.quat.premultiply(_q);
      this.quat.normalize();
      this.basis();
    }

    /* lateral grip: powerslide trades it away for a slide.
       `world.grip` is how the ice rink gets slippery. */
    var grip = (inp.drift ? C.gripDrift : C.gripLat) * (world ? world.grip : 1);
    this.driftHeat = M.damp(this.driftHeat, (inp.drift && absF > 8) ? 1 : 0, 5, dt);
    var corr = Math.min(Math.abs(latSpeed), grip * dt);
    this.vel.addScaledVector(_rgt, -M.sign(latSpeed) * corr);

    /* keep velocity in the surface plane */
    var vn2 = this.vel.dot(this.groundN);
    if (vn2 > 0) this.vel.addScaledVector(this.groundN, -vn2);

    this.wheelSpin += fwdSpeed * dt * 2.4;
  };

  Car.prototype.driveAir = function (dt, inp, B) {
    var s = RL.save.airSens;
    if (this.flipTimer <= 0) {
      this.ang.addScaledVector(_rgt, inp.pitch * C.airPitch * s * dt);
      // about up: +turns right.  about forward: -rolls right.
      if (inp.airRoll) {
        this.ang.addScaledVector(_fwd, -inp.yaw * C.airRoll * s * dt);
      } else {
        this.ang.addScaledVector(_up, inp.yaw * C.airYaw * s * dt);
        this.ang.addScaledVector(_fwd, -inp.roll * C.airRoll * s * dt);
      }
      // damp toward rest so it doesn't spin forever
      var damp = Math.exp(-C.airDamp * 0.42 * dt);
      this.ang.multiplyScalar(damp);
    }
    // a whisper of air drag so aerials arc naturally
    this.vel.multiplyScalar(Math.exp(-0.055 * dt));
  };

  Car.prototype.handleJump = function (dt, inp) {
    var pressed = inp.jump && !this.prevJump;
    this.prevJump = inp.jump;
    this.flipWindow = Math.max(0, this.flipWindow - dt);

    if (this.flipTimer > 0) {
      this.flipTimer -= dt;
      // spin through the flip
      var t = this.flipTimer / C.flipTime;
      _q.setFromAxisAngle(this.flipAxis, (Math.PI * 2.05) * dt / C.flipTime);
      this.quat.premultiply(_q);
      this.quat.normalize();
      if (this.flipTimer <= 0) this.ang.set(0, 0, 0);
      return;
    }

    if (pressed) {
      if (this.onGround) {
        this.vel.addScaledVector(this.groundN, C.jump);
        this.onGround = false;
        this.groundLock = 0.14;
        this.hasFlip = true;
        this.flipWindow = C.flipWindow;
        this.jumpTimer = C.jumpHoldTime;
        this.airTime = 0.001;
        RL.Audio.sfxJump();
      } else if (this.hasFlip && this.flipWindow > 0) {
        var dx = inp.steer, dz = inp.pitch;
        // the stick is the flip direction; nothing held = a plain second jump
        // (pushing forward pitches the nose down AND front-flips — same stick)
        if (Math.abs(dx) > 0.28 || Math.abs(dz) > 0.28) {
          this.doFlip(dx, dz);
        } else {
          this.vel.addScaledVector(_up, C.doubleJump);
          RL.Audio.sfxJump();
        }
        this.hasFlip = false;
        this.flipWindow = 0;
      }
    }

    // holding jump right after take-off gets you a bit more height
    if (inp.jump && this.jumpTimer > 0 && !this.onGround) {
      this.jumpTimer -= dt;
      this.vel.addScaledVector(_up, C.jumpHold * dt);
    } else if (!inp.jump) this.jumpTimer = 0;
  };

  /* dx: -1 left .. 1 right,  dz: -1 back .. 1 forward (car space) */
  Car.prototype.doFlip = function (dx, dz) {
    var len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    _v1.copy(_fwd).multiplyScalar(dz).addScaledVector(_rgt, dx).normalize();

    // a forward flip converts into real speed; sideways/back ones don't
    var fwdness = Math.max(0, dz);
    this.vel.addScaledVector(_v1, C.flipImpulse);
    this.vel.addScaledVector(_fwd, C.flipForwardBonus * fwdness);
    if (dz < -0.3) this.vel.addScaledVector(_up, 2.6);     // back-flip pops up

    // spin axis is perpendicular to the flip direction, in the car's plane
    this.flipAxis.copy(_up).cross(_v1).normalize();
    this.flipTimer = C.flipTime;
    this.ang.set(0, 0, 0);
    RL.Audio.sfxFlip();
    if (this.game.fx) this.game.fx.flipRing(this.pos, this.quat);
  };

  /* the chassis itself smacking into geometry while airborne */
  var CORNERS = [
    [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1],
    [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1]
  ];
  var _bestN = new T.Vector3();
  Car.prototype.resolveBody = function (dt) {
    var B = this.B;
    var deepest = 0, hit = false;
    for (var i = 0; i < 8; i++) {
      _corner.set(CORNERS[i][0] * B.W * 0.48, CORNERS[i][1] * B.H * 0.48, CORNERS[i][2] * B.L * 0.48);
      _corner.applyQuaternion(this.quat).add(this.pos);
      var d = RL.surfaceDist(_corner);      // < 0 means that corner is through the wall
      if (d < deepest) {
        deepest = d;
        RL.surfaceNormal(_corner, _bestN);
        hit = true;
      }
    }
    if (!hit) return;
    var bestN = _bestN;
    this.pos.addScaledVector(bestN, -deepest + 0.02);
    var vn = this.vel.dot(bestN);
    if (vn >= 0) return;

    this.vel.addScaledVector(bestN, -vn * 1.35);            // 0.35 restitution

    // Only a genuine impact scrubs speed and rattles the car.  Doing this on
    // every frame of resting contact glues you to whatever you're leaning on,
    // which wedges cars into the corner fillets forever.
    if (-vn <= 2.5) return;

    _v1.copy(this.vel).addScaledVector(bestN, -this.vel.dot(bestN));
    this.vel.addScaledVector(_v1, -0.12);
    if (-vn > 7) {
      RL.Audio.sfxWall(-vn);
      if (this.game.fx) this.game.fx.sparks(this.pos, bestN, Math.min(1, -vn / 26));
    }
    if (!this.onGround) {
      this.ang.addScaledVector(
        _v1.set(Math.random() - .5, Math.random() - .5, Math.random() - .5),
        Math.min(3, -vn * 0.12));
    }
  };

  Car.prototype.collectPads = function (dt) {
    if (this.pos.y > 2.6) return;                 // pads only work on the deck
    var pads = this.game.arena.pads;
    for (var i = 0; i < pads.length; i++) {
      var p = pads[i];
      if (p.timer > 0) continue;
      var dx = this.pos.x - p.x, dz = this.pos.z - p.z;
      if (dx * dx + dz * dz < (p.r + 0.9) * (p.r + 0.9)) {
        if (this.boost >= C.boostMax && !p.big) continue;
        this.boost = Math.min(C.boostMax, this.boost + p.amount);
        p.timer = p.cool;
        RL.Audio.sfxPad(p.big);
        if (this.game.fx) this.game.fx.padBurst(p.x, p.z, p.big);
      }
    }
  };

  /* push visual state onto the mesh */
  Car.prototype.sync = function (dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
    if (this.demoed > 0) return;

    var r = this.refs;
    dt = dt || 0.016;

    // wheels: spin + steer + a little suspension squat
    for (var i = 0; i < r.wheels.length; i++) {
      var w = r.wheels[i];
      w.rotation.x = this.wheelSpin;
      if (w.userData.steers) w.rotation.y = M.damp(w.rotation.y, this.input.steer * -0.42, 14, dt);
    }

    // boost flames
    var on = this.boosting;
    for (var f = 0; f < r.flames.length; f++) {
      var fl = r.flames[f];
      fl.visible = on;
      if (on) {
        var s = 0.75 + Math.random() * 0.55;
        fl.scale.set(0.85 + Math.random() * 0.3, s, 0.85 + Math.random() * 0.3);
        fl.material.opacity = 0.6 + Math.random() * 0.4;
        fl.material.color.setHSL(0.09 + Math.random() * 0.05, 1, 0.6);
      }
    }

    // halo brightens with boost / supersonic
    var haloT = (on ? 0.36 : 0) + (this.supersonic ? 0.34 : 0);
    r.halo.material.opacity = M.damp(r.halo.material.opacity, haloT, 9, dt);
    r.halo.scale.setScalar(3.6 + (this.supersonic ? 1.4 : 0));
    if (this.supersonic) r.halo.material.color.setHex(0x9fd8ff);
    else r.halo.material.color.setHex(0xffb43c);
  };

  Car.prototype.dispose = function () {
    this.game.scene.remove(this.mesh);
    var r = this.refs;
    this.mesh.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    r.mats.forEach(function (m) { m.dispose(); });
  };

  RL.Car = Car;

})(window);
