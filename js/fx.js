/* ============================================================
   fx.js — particles and impact flourishes.

   Everything lives in two pooled Points clouds plus a small ring pool,
   so the whole effects layer costs about three draw calls no matter
   how much is going on.  Additive blending means "fade to black"
   is the same thing as "fade out".
   ============================================================ */
(function (global) {
  'use strict';
  var RL = global.RL, T = global.THREE, M = RL.M;

  function Pool(scene, count, size, texture, gravity) {
    this.n = count;
    this.gravity = gravity;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.decay = new Float32Array(count);
    this.base = new Float32Array(count * 3);
    this.drag = new Float32Array(count);
    this.cursor = 0;

    for (var i = 0; i < count; i++) this.pos[i * 3 + 1] = -999;

    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(this.col, 3));
    var mat = new T.PointsMaterial({
      size: size, map: texture, vertexColors: true, transparent: true,
      blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      opacity: 1
    });
    this.points = new T.Points(geo, mat);
    this.points.frustumCulled = false;
    this.geo = geo; this.mat = mat;
    scene.add(this.points);
  }

  Pool.prototype.spawn = function (x, y, z, vx, vy, vz, r, g, b, life, drag) {
    var i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    var i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.base[i3] = r; this.base[i3 + 1] = g; this.base[i3 + 2] = b;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.life[i] = 1;
    this.decay[i] = 1 / Math.max(0.05, life);
    this.drag[i] = drag === undefined ? 1.6 : drag;
  };

  Pool.prototype.update = function (dt) {
    var any = false;
    for (var i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      var i3 = i * 3;
      this.life[i] -= this.decay[i] * dt;
      if (this.life[i] <= 0) {
        this.col[i3] = this.col[i3 + 1] = this.col[i3 + 2] = 0;
        this.pos[i3 + 1] = -999;
        continue;
      }
      var d = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 1] *= d; this.vel[i3 + 2] *= d;
      if (this.gravity) this.vel[i3 + 1] -= this.gravity * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.05) { this.pos[i3 + 1] = 0.05; this.vel[i3 + 1] *= -0.35; }
      var f = this.life[i];
      f = f * f;                                   // fade out fast, look punchy
      this.col[i3] = this.base[i3] * f;
      this.col[i3 + 1] = this.base[i3 + 1] * f;
      this.col[i3 + 2] = this.base[i3 + 2] * f;
    }
    if (any) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
  };

  Pool.prototype.dispose = function (scene) {
    scene.remove(this.points);
    this.geo.dispose(); this.mat.dispose();
  };

  /* ---------------- rings ---------------- */

  function RingPool(scene, count) {
    this.items = [];
    for (var i = 0; i < count; i++) {
      var m = new T.Mesh(
        new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({
          map: RL.ringTex(), transparent: true, opacity: 0, color: 0xffffff,
          blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
        })
      );
      m.visible = false;
      scene.add(m);
      this.items.push({ m: m, life: 0, rate: 1, from: 1, to: 4, spin: 0 });
    }
    this.cursor = 0;
  }
  RingPool.prototype.fire = function (pos, quat, color, from, to, dur) {
    var it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    it.m.position.copy(pos);
    if (quat) it.m.quaternion.copy(quat); else it.m.rotation.set(-Math.PI / 2, 0, 0);
    it.m.material.color.set(color);
    it.life = 1; it.rate = 1 / dur; it.from = from; it.to = to;
    it.spin = (Math.random() - 0.5) * 3;
    it.m.visible = true;
    return it;
  };
  RingPool.prototype.update = function (dt) {
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.life <= 0) continue;
      it.life -= it.rate * dt;
      if (it.life <= 0) { it.m.visible = false; continue; }
      var t = 1 - it.life;
      var s = M.lerp(it.from, it.to, M.smooth(t));
      it.m.scale.set(s, s, 1);
      it.m.material.opacity = it.life * it.life * 0.9;
      it.m.rotation.z += it.spin * dt;
    }
  };
  RingPool.prototype.dispose = function (scene) {
    for (var i = 0; i < this.items.length; i++) {
      scene.remove(this.items[i].m);
      this.items[i].m.geometry.dispose();
      this.items[i].m.material.dispose();
    }
    this.items.length = 0;
  };

  /* ---------------- FX front end ---------------- */

  function FX(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    var big = quality === 'low' ? 0.4 : 1;
    this.sparkP = new Pool(scene, Math.round(500 * big), 0.42, RL.starTex(), 9);
    this.puffP = new Pool(scene, Math.round(260 * big), 1.5, RL.blobTex(), 1.2);
    this.rings = new RingPool(scene, quality === 'low' ? 5 : 12);
    this.shake = 0;
  }

  FX.prototype.update = function (dt) {
    this.sparkP.update(dt);
    this.puffP.update(dt);
    this.rings.update(dt);
    this.shake = Math.max(0, this.shake - dt * 2.6);
  };

  FX.prototype.addShake = function (amount) {
    this.shake = Math.min(1.6, this.shake + amount * RL.save.shake);
  };

  var _v = new T.Vector3();

  /* ball / car contact */
  FX.prototype.impact = function (pos, normal, strength) {
    var n = Math.round(6 + strength * 22) * (this.quality === 'low' ? 0.4 : 1);
    for (var i = 0; i < n; i++) {
      var sx = (Math.random() - 0.5) * 2, sy = (Math.random() - 0.5) * 2, sz = (Math.random() - 0.5) * 2;
      var sp = 4 + Math.random() * 16 * strength;
      this.sparkP.spawn(
        pos.x, pos.y, pos.z,
        normal.x * sp * 0.6 + sx * sp, normal.y * sp * 0.6 + sy * sp, normal.z * sp * 0.6 + sz * sp,
        1.6, 1.2 + strength * 0.5, 0.6 + strength,
        0.20 + Math.random() * 0.3, 2.4);
    }
    if (strength > 0.34) {
      _v.copy(pos).addScaledVector(normal, 0.2);
      this.rings.fire(_v, null, 0x9fd8ff, 0.4, 3.0 + strength * 6, 0.36);
      this.addShake(strength * 0.28);
    }
  };

  FX.prototype.sparks = function (pos, normal, strength) {
    var n = Math.round(3 + strength * 12) * (this.quality === 'low' ? 0.4 : 1);
    for (var i = 0; i < n; i++) {
      var sp = 3 + Math.random() * 12 * strength;
      this.sparkP.spawn(pos.x, pos.y, pos.z,
        normal.x * sp + (Math.random() - .5) * sp, normal.y * sp + (Math.random() - .5) * sp,
        normal.z * sp + (Math.random() - .5) * sp,
        1.7, 1.0, 0.35, 0.16 + Math.random() * 0.2, 3.0);
    }
    this.addShake(strength * 0.12);
  };

  FX.prototype.dust = function (pos, normal, strength) {
    var n = Math.round(4 + strength * 10) * (this.quality === 'low' ? 0.4 : 1);
    for (var i = 0; i < n; i++) {
      this.puffP.spawn(
        pos.x + (Math.random() - .5) * 1.4, pos.y - 0.2, pos.z + (Math.random() - .5) * 1.4,
        (Math.random() - .5) * 4, Math.random() * 2.4, (Math.random() - .5) * 4,
        0.30, 0.32, 0.38, 0.42 + Math.random() * 0.3, 2.4);
    }
  };

  FX.prototype.flipRing = function (pos, quat) {
    this.rings.fire(pos, quat, 0xbfe4ff, 0.6, 4.2, 0.32);
  };

  FX.prototype.padBurst = function (x, z, big) {
    var n = big ? 26 : 10;
    if (this.quality === 'low') n = Math.round(n * 0.5);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, r = Math.random() * (big ? 2.4 : 1.4);
      this.sparkP.spawn(x + Math.cos(a) * r, 0.2, z + Math.sin(a) * r,
        Math.cos(a) * 3, 5 + Math.random() * (big ? 14 : 7), Math.sin(a) * 3,
        1.8, 1.35, 0.3, 0.4 + Math.random() * 0.4, 1.6);
    }
    _v.set(x, 0.12, z);
    this.rings.fire(_v, null, 0xffd24a, big ? 1.5 : 0.9, big ? 9 : 5, 0.45);
  };

  FX.prototype.demoBurst = function (pos, color) {
    var n = this.quality === 'low' ? 30 : 80;
    var c = new T.Color(color);
    for (var i = 0; i < n; i++) {
      var sp = 6 + Math.random() * 26;
      var a = Math.random() * 6.283, b = Math.acos(Math.random() * 2 - 1);
      this.sparkP.spawn(pos.x, pos.y, pos.z,
        Math.sin(b) * Math.cos(a) * sp, Math.cos(b) * sp * 0.8 + 4, Math.sin(b) * Math.sin(a) * sp,
        1.9, 0.9 + c.g * 0.6, 0.35 + c.b * 0.5,
        0.45 + Math.random() * 0.5, 1.4);
    }
    this.rings.fire(pos, null, 0xffa040, 0.8, 12, 0.5);
    this.addShake(0.7);
  };

  FX.prototype.goalExplosion = function (pos, color) {
    var c = new T.Color(color);
    var n = this.quality === 'low' ? 70 : 220;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, b = Math.acos(Math.random() * 2 - 1);
      var sp = 8 + Math.random() * 40;
      this.sparkP.spawn(pos.x, pos.y, pos.z,
        Math.sin(b) * Math.cos(a) * sp, Math.cos(b) * sp + 6, Math.sin(b) * Math.sin(a) * sp,
        c.r * 2.0 + 0.4, c.g * 2.0 + 0.3, c.b * 2.0 + 0.3,
        0.7 + Math.random() * 0.9, 0.9);
    }
    for (var j = 0; j < (this.quality === 'low' ? 20 : 60); j++) {
      var a2 = Math.random() * 6.283;
      this.puffP.spawn(pos.x, pos.y, pos.z,
        Math.cos(a2) * (5 + Math.random() * 20), Math.random() * 14, Math.sin(a2) * (5 + Math.random() * 20),
        c.r * 1.4, c.g * 1.4, c.b * 1.4, 0.8 + Math.random() * 0.7, 1.1);
    }
    this.rings.fire(pos, null, color, 1, 34, 0.75);
    this.rings.fire(pos, null, 0xffffff, 1, 22, 0.5);
    this.addShake(1.4);
  };

  FX.prototype.confetti = function (colors) {
    var A = RL.ARENA;
    var n = this.quality === 'low' ? 60 : 200;
    for (var i = 0; i < n; i++) {
      var c = new T.Color(colors[(Math.random() * colors.length) | 0]);
      this.puffP.spawn(
        (Math.random() * 2 - 1) * (A.hx - 6), A.h - 1, (Math.random() * 2 - 1) * (A.hz - 6),
        (Math.random() - .5) * 5, -2 - Math.random() * 3, (Math.random() - .5) * 5,
        c.r * 1.5, c.g * 1.5, c.b * 1.5, 2.4 + Math.random() * 1.6, 0.35);
    }
  };

  /* continuous boost plume behind a car */
  var _bp = new T.Vector3(), _bf = new T.Vector3();
  FX.prototype.boostTrail = function (car, dt) {
    if (!car.boosting || car.demoed > 0) return;
    var rate = this.quality === 'low' ? 40 : 110;
    var count = Math.max(1, Math.round(rate * dt));
    car.forward(_bf);
    for (var i = 0; i < count; i++) {
      _bp.copy(car.pos).addScaledVector(_bf, -car.B.L * 0.55);
      _bp.x += (Math.random() - .5) * 0.4;
      _bp.y += (Math.random() - .5) * 0.3;
      _bp.z += (Math.random() - .5) * 0.4;
      var back = 6 + Math.random() * 9;
      this.sparkP.spawn(_bp.x, _bp.y, _bp.z,
        -_bf.x * back + car.vel.x * 0.30 + (Math.random() - .5) * 3,
        -_bf.y * back + car.vel.y * 0.30 + (Math.random() - .5) * 3,
        -_bf.z * back + car.vel.z * 0.30 + (Math.random() - .5) * 3,
        1.9, 0.85 + Math.random() * 0.4, 0.25,
        0.16 + Math.random() * 0.18, 2.6);
    }
  };

  /* tyre smoke while powersliding */
  FX.prototype.driftSmoke = function (car, dt) {
    if (car.driftHeat < 0.25 || !car.onGround || car.speed < 9) return;
    if (Math.random() > car.driftHeat * (this.quality === 'low' ? 0.3 : 0.75)) return;
    this.puffP.spawn(
      car.pos.x + (Math.random() - .5) * 1.6, car.pos.y - 0.3, car.pos.z + (Math.random() - .5) * 1.6,
      (Math.random() - .5) * 3, 1 + Math.random() * 2, (Math.random() - .5) * 3,
      0.34, 0.36, 0.42, 0.5 + Math.random() * 0.4, 1.8);
  };

  FX.prototype.dispose = function () {
    this.sparkP.dispose(this.scene);
    this.puffP.dispose(this.scene);
    this.rings.dispose(this.scene);
  };

  RL.FX = FX;

})(window);
