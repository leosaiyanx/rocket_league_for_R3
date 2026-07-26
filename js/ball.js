/* ============================================================
   ball.js — the ball, its physics, and the trajectory predictor
   that both the AI and the on-screen landing marker read from.
   ============================================================ */
(function (global) {
  'use strict';
  var RL = global.RL, T = global.THREE, M = RL.M, BL = RL.BALL, C = RL.CAR;

  function makeBallTex() {
    var S = 512, c = document.createElement('canvas');
    c.width = c.height = S;
    var g = c.getContext('2d');
    g.fillStyle = '#eef3fb'; g.fillRect(0, 0, S, S);

    // hex/pent panel look, drawn in equirect space
    g.strokeStyle = '#20283a'; g.lineWidth = 7; g.lineJoin = 'round';
    var rows = 5, cols = 10;
    for (var r = 0; r < rows; r++) {
      for (var i = 0; i < cols; i++) {
        var w = S / cols, h = S / rows;
        var x = i * w + (r % 2 ? w / 2 : 0), y = r * h;
        g.beginPath();
        for (var k = 0; k < 6; k++) {
          var a = Math.PI / 6 + k * Math.PI / 3;
          var px = x + w / 2 + Math.cos(a) * w * 0.48;
          var py = y + h / 2 + Math.sin(a) * h * 0.52;
          if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath();
        g.fillStyle = ((r + i) % 3 === 0) ? '#232b3d' : '#f4f8ff';
        g.fill(); g.stroke();
      }
    }
    // glowing seam accents
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(90,200,255,0.30)'; g.lineWidth = 3;
    for (var q = 0; q < rows; q++) {
      g.beginPath(); g.moveTo(0, q * S / rows); g.lineTo(S, q * S / rows); g.stroke();
    }
    var t = new T.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  function Ball(game) {
    this.game = game;
    this.pos = new T.Vector3(0, BL.radius, 0);
    this.vel = new T.Vector3();
    this.spin = new T.Vector3();
    this.quat = new T.Quaternion();
    this.frozen = false;
    this.lastToucher = null;
    this.lastTouchTeam = -1;
    this.hitCool = 0;

    var geo = new T.SphereGeometry(BL.radius, game.quality === 'low' ? 20 : 32,
      game.quality === 'low' ? 14 : 22);
    var mat = new T.MeshPhongMaterial({
      map: makeBallTex(), shininess: 62, specular: 0xbfd8ff,
      emissive: 0x000000
    });
    this.mesh = new T.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mat = mat; this.geo = geo;
    game.scene.add(this.mesh);

    // glow that swells as it gets fast
    this.glow = new T.Sprite(new T.SpriteMaterial({
      map: RL.blobTex(), color: 0x8fd8ff, transparent: true, opacity: 0,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    this.glow.scale.setScalar(BL.radius * 6);
    game.scene.add(this.glow);

    // landing marker on the deck
    this.marker = new T.Mesh(
      new T.PlaneGeometry(1, 1),
      new T.MeshBasicMaterial({
        map: RL.ringTex(), color: 0xffffff, transparent: true, opacity: 0.0,
        blending: T.AdditiveBlending, depthWrite: false
      })
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.07;
    game.scene.add(this.marker);

    // blob shadow
    this.shadow = new T.Mesh(
      new T.PlaneGeometry(1, 1),
      new T.MeshBasicMaterial({
        map: RL.blobTex(), color: 0x000000, transparent: true,
        opacity: 0.4, depthWrite: false
      })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    game.scene.add(this.shadow);

    this.trail = [];
    if (game.quality !== 'low') {
      for (var i = 0; i < 14; i++) {
        var s = new T.Sprite(new T.SpriteMaterial({
          map: RL.blobTex(), color: 0x7fd0ff, transparent: true, opacity: 0,
          blending: T.AdditiveBlending, depthWrite: false
        }));
        s.scale.setScalar(BL.radius * 2);
        game.scene.add(s);
        this.trail.push({ sp: s, life: 0, x: 0, y: 0, z: 0 });
      }
    }
    this.trailTick = 0;
  }

  Ball.prototype.reset = function (x, y, z, vx, vy, vz) {
    this.pos.set(x, y, z);
    this.vel.set(vx || 0, vy || 0, vz || 0);
    this.spin.set(0, 0, 0);
    this.quat.identity();
    this.frozen = false;
    this.lastToucher = null;
    this.lastTouchTeam = -1;
    for (var i = 0; i < this.trail.length; i++) this.trail[i].life = 0;
    this.mesh.position.copy(this.pos);
  };

  /* ---------- pure physics step, reused by the predictor ---------- */
  /* s = {px,py,pz, vx,vy,vz, sx,sy,sz} mutated in place            */
  var _p = new T.Vector3(), _n = new T.Vector3();

  function stepState(s, dt, world, doSpin) {
    var g = BL.gravity * world.gravity;
    // gravity + drag
    s.vy -= g * dt;
    var dragF = Math.exp(-BL.drag * dt);
    s.vx *= dragF; s.vy *= dragF; s.vz *= dragF;

    // Magnus: spin x velocity gives you bending shots
    if (doSpin) {
      var mx = s.sy * s.vz - s.sz * s.vy;
      var my = s.sz * s.vx - s.sx * s.vz;
      var mz = s.sx * s.vy - s.sy * s.vx;
      var k = BL.magnus * dt * 0.02;
      s.vx += mx * k; s.vy += my * k; s.vz += mz * k;
      var sd = Math.exp(-BL.spinDrag * dt);
      s.sx *= sd; s.sy *= sd; s.sz *= sd;
    }

    // speed cap
    var sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
    if (sp > BL.maxSpeed) {
      var f = BL.maxSpeed / sp;
      s.vx *= f; s.vy *= f; s.vz *= f;
    }

    s.px += s.vx * dt; s.py += s.vy * dt; s.pz += s.vz * dt;

    // arena
    var d = -RL.arenaSD(s.px, s.py, s.pz);
    if (d < BL.radius) {
      _p.set(s.px, s.py, s.pz);
      RL.surfaceNormal(_p, _n);
      var push = BL.radius - d;
      s.px += _n.x * push; s.py += _n.y * push; s.pz += _n.z * push;

      var vn = s.vx * _n.x + s.vy * _n.y + s.vz * _n.z;
      if (vn < 0) {
        // split into normal / tangential
        var tx = s.vx - _n.x * vn, ty = s.vy - _n.y * vn, tz = s.vz - _n.z * vn;
        var e = BL.restitution;
        var nx = -vn * e;
        var f2 = 1 - BL.surfFriction * 0.5;
        s.vx = tx * f2 + _n.x * nx;
        s.vy = ty * f2 + _n.y * nx;
        s.vz = tz * f2 + _n.z * nx;
        if (doSpin) {
          // scrubbing the surface trades tangential speed for spin
          var k2 = BL.spinFromBounce / BL.radius;
          s.sx += (_n.y * tz - _n.z * ty) * k2;
          s.sy += (_n.z * tx - _n.x * tz) * k2;
          s.sz += (_n.x * ty - _n.y * tx) * k2;
          var sl = Math.sqrt(s.sx * s.sx + s.sy * s.sy + s.sz * s.sz);
          if (sl > BL.maxSpin) { var sf = BL.maxSpin / sl; s.sx *= sf; s.sy *= sf; s.sz *= sf; }
        }
        return -vn;   // impact strength, for sfx
      }
    }
    return 0;
  }

  /* Predict the flight path.  Returns a flat Float32Array of xyz samples
     plus the time step, shared by the AI and the landing marker. */
  var _ps = { px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, sz: 0 };
  RL.predictBall = function (ball, world, steps, dt, out) {
    var s = _ps;
    s.px = ball.pos.x; s.py = ball.pos.y; s.pz = ball.pos.z;
    s.vx = ball.vel.x; s.vy = ball.vel.y; s.vz = ball.vel.z;
    s.sx = ball.spin.x; s.sy = ball.spin.y; s.sz = ball.spin.z;
    for (var i = 0; i < steps; i++) {
      stepState(s, dt, world, true);
      out[i * 3] = s.px; out[i * 3 + 1] = s.py; out[i * 3 + 2] = s.pz;
      // stop predicting once it's in the net
      if (Math.abs(s.pz) > RL.ARENA.hz + 0.5) {
        for (var j = i + 1; j < steps; j++) {
          out[j * 3] = s.px; out[j * 3 + 1] = s.py; out[j * 3 + 2] = s.pz;
        }
        return i;
      }
    }
    return steps;
  };

  /* ---------- live update ---------- */

  var _rq = new T.Quaternion(), _axis = new T.Vector3(), _cross = new T.Vector3();

  Ball.prototype.update = function (dt, world) {
    if (this.frozen) { this.syncMesh(dt); return; }
    this.hitCool = Math.max(0, this.hitCool - dt);

    var s = _ps;
    s.px = this.pos.x; s.py = this.pos.y; s.pz = this.pos.z;
    s.vx = this.vel.x; s.vy = this.vel.y; s.vz = this.vel.z;
    s.sx = this.spin.x; s.sy = this.spin.y; s.sz = this.spin.z;

    var impact = stepState(s, dt, world, true);

    this.pos.set(s.px, s.py, s.pz);
    this.vel.set(s.vx, s.vy, s.vz);
    this.spin.set(s.sx, s.sy, s.sz);

    if (impact > 2.4) {
      RL.Audio.sfxWall(impact);
      if (this.game.fx) {
        RL.surfaceNormal(this.pos, _n);
        this.game.fx.sparks(this.pos, _n, Math.min(1, impact / 30));
      }
    }

    // roll: spin the mesh
    var sl = this.spin.length();
    if (sl > 1e-4) {
      _rq.setFromAxisAngle(_axis.copy(this.spin).multiplyScalar(1 / sl), sl * dt);
      this.quat.premultiply(_rq);
    }
    // also roll from travel across a surface, so it looks right on the ground
    var speed = this.vel.length();
    if (speed > 0.05) {
      var d = RL.surfaceDist(this.pos);
      if (d < BL.radius + 0.12) {
        RL.surfaceNormal(this.pos, _n);
        _axis.crossVectors(_n, this.vel);
        var al = _axis.length();
        if (al > 1e-4) {
          _axis.multiplyScalar(1 / al);
          _rq.setFromAxisAngle(_axis, (speed / BL.radius) * dt * 0.55);
          this.quat.premultiply(_rq);
        }
      }
    }

    this.syncMesh(dt);
  };

  Ball.prototype.syncMesh = function (dt) {
    dt = dt || 0.016;
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);

    var speed = this.vel.length();
    var hot = M.clamp((speed - 26) / 34, 0, 1);

    // glow + emissive ramp when it's flying
    this.glow.position.copy(this.pos);
    this.glow.material.opacity = 0.10 + hot * 0.60;
    this.glow.material.color.setHSL(0.58 - hot * 0.55, 1.0, 0.55 + hot * 0.15);
    this.glow.scale.setScalar(BL.radius * (4.4 + hot * 4.0));
    this.mat.emissive.setHSL(0.58 - hot * 0.55, 1.0, hot * 0.30);

    // shadow directly beneath
    var h = M.clamp(this.pos.y, 0, 24);
    this.shadow.position.set(this.pos.x, 0.045, this.pos.z);
    var sc = BL.radius * (2.6 + h * 0.10);
    this.shadow.scale.set(sc, sc, 1);
    this.shadow.material.opacity = 0.42 * (1 - M.clamp(h / 22, 0, 0.86));
    this.shadow.visible = this.pos.y < 21 && Math.abs(this.pos.z) < RL.ARENA.hz;

    // trail
    if (this.trail.length) {
      this.trailTick += dt;
      if (this.trailTick > 0.026 && speed > 9) {
        this.trailTick = 0;
        var oldest = this.trail[0], oi = 0;
        for (var i = 1; i < this.trail.length; i++) {
          if (this.trail[i].life < oldest.life) { oldest = this.trail[i]; oi = i; }
        }
        oldest.life = 1;
        oldest.x = this.pos.x; oldest.y = this.pos.y; oldest.z = this.pos.z;
      }
      for (var j = 0; j < this.trail.length; j++) {
        var t2 = this.trail[j];
        if (t2.life <= 0) { t2.sp.visible = false; continue; }
        t2.life -= dt * 2.6;
        t2.sp.visible = true;
        t2.sp.position.set(t2.x, t2.y, t2.z);
        t2.sp.material.opacity = Math.max(0, t2.life) * 0.42 * (0.25 + hot);
        t2.sp.material.color.setHSL(0.58 - hot * 0.55, 1, 0.6);
        t2.sp.scale.setScalar(BL.radius * (0.9 + (1 - t2.life) * 1.9));
      }
    }
  };

  /* ---------- car -> ball ---------- */

  var _loc = new T.Vector3(), _cl = new T.Vector3(), _del = new T.Vector3(),
    _iq = new T.Quaternion(), _cf = new T.Vector3(), _rel = new T.Vector3(),
    _tan = new T.Vector3();

  Ball.prototype.collideCar = function (car, dt) {
    if (this.frozen || car.demoed > 0) return 0;
    var B = car.B;
    var hw = B.W * 0.5 + 0.02, hh = B.H * 0.5 + 0.02, hl = B.L * 0.5 + 0.02;

    _iq.copy(car.quat).invert();
    _loc.copy(this.pos).sub(car.pos).applyQuaternion(_iq);
    _cl.set(M.clamp(_loc.x, -hw, hw), M.clamp(_loc.y, -hh, hh), M.clamp(_loc.z, -hl, hl));
    _del.copy(_loc).sub(_cl);
    var dist = _del.length();

    if (dist >= BL.radius) return 0;

    if (dist < 1e-4) {
      // ball centre is inside the box — eject along the shallowest axis
      var px = hw - Math.abs(_loc.x), py = hh - Math.abs(_loc.y), pz = hl - Math.abs(_loc.z);
      if (px < py && px < pz) _del.set(M.sign(_loc.x) || 1, 0, 0);
      else if (py < pz) _del.set(0, M.sign(_loc.y) || 1, 0);
      else _del.set(0, 0, M.sign(_loc.z) || 1);
      dist = 0.0001;
    } else _del.multiplyScalar(1 / dist);

    // contact normal, back into world space
    _del.applyQuaternion(car.quat).normalize();

    // separate
    var overlap = BL.radius - dist;
    this.pos.addScaledVector(_del, overlap + 0.005);

    // relative approach speed along the normal
    _rel.copy(car.vel).sub(this.vel);
    var vn = _rel.dot(_del);

    car.forward(_cf);
    var carSpeed = car.vel.length();
    var power = B.power * (car.boosting ? 1.14 : 1.0);

    if (vn > 0) {
      var e = 0.55, share = 0.72;
      _tan.copy(_rel).addScaledVector(_del, -vn);

      // base normal impulse
      this.vel.addScaledVector(_del, vn * (1 + e) * share * power);

      // the Psyonix kick: hitting square with the nose sends it
      var fwdness = M.clamp(_cf.dot(_del), 0, 1);
      this.vel.addScaledVector(_cf, carSpeed * fwdness * 0.36 * power);

      // scrub gives the ball spin -> curve
      this.spin.addScaledVector(
        _cross.crossVectors(_del, _tan), 0.30 / BL.radius);
      var sl = this.spin.length();
      if (sl > BL.maxSpin) this.spin.multiplyScalar(BL.maxSpin / sl);

      // and the car feels it, a bit
      var mr = C.ballMass / (C.mass + C.ballMass);
      car.vel.addScaledVector(_del, -vn * mr * 1.4);
      if (!car.onGround) car.ang.addScaledVector(_tan, 0.06);

      var sp2 = this.vel.length();
      if (sp2 > BL.maxSpeed) this.vel.multiplyScalar(BL.maxSpeed / sp2);

      this.lastToucher = car;
      this.lastTouchTeam = car.team;

      if (this.hitCool <= 0 && vn > 1.2) {
        this.hitCool = 0.05;
        RL.Audio.sfxBall(vn + carSpeed * 0.45);
        if (this.game.fx) this.game.fx.impact(this.pos, _del, M.clamp((vn + carSpeed * 0.4) / 40, 0.15, 1));
      }
      return vn;
    } else {
      // resting contact — let it sit on the roof so dribbling works
      this.lastToucher = car;
      this.lastTouchTeam = car.team;
    }
    return 0;
  };

  Ball.prototype.dispose = function () {
    var g = this.game.scene;
    g.remove(this.mesh); g.remove(this.glow); g.remove(this.shadow); g.remove(this.marker);
    this.geo.dispose(); this.mat.dispose();
    if (this.mat.map) this.mat.map.dispose();
    this.glow.material.dispose(); this.shadow.material.dispose();
    this.shadow.geometry.dispose(); this.marker.geometry.dispose();
    this.marker.material.dispose();
    for (var i = 0; i < this.trail.length; i++) {
      g.remove(this.trail[i].sp);
      this.trail[i].sp.material.dispose();
    }
    this.trail.length = 0;
  };

  RL.Ball = Ball;

})(window);
