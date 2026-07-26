/* ============================================================
   arena.js — stadium construction.  Every texture is painted into a
   <canvas> at load time, so the game ships with no image files.
   The shell is ray-marched against RL.arenaSD, which means the mesh
   you see and the surface you collide with are the same surface.
   ============================================================ */
(function (global) {
  'use strict';
  var RL = global.RL, T = global.THREE, M = RL.M, A = RL.ARENA;

  /* ---------------- themes ---------------- */

  var THEMES = RL.THEMES = {
    dome: {
      name: 'Rookie Dome',
      turf: ['#123c2a', '#0f3324'], turfLine: '#7fe9b4', grid: '#1d5f42',
      wall: '#152238', wallPanel: '#1e3355', wallEdge: '#2f5f96',
      trim: 0x35d6ff, trim2: 0x6effc4,
      crowd: ['#ff5d73', '#ffd166', '#4cc9f0', '#f7f7ff', '#8affc1'],
      fog: 0x081426, ambient: 0x4a6a95, sun: 0xffffff, sunI: 0.72, hemi: 0.52,
      sky: 0x0a1830, stars: false
    },
    neon: {
      name: 'Neon Nights',
      turf: ['#12102b', '#0d0b22'], turfLine: '#ff4ff0', grid: '#2b1a6b',
      wall: '#0b0820', wallPanel: '#181043', wallEdge: '#7a2ff2',
      trim: 0xff3df0, trim2: 0x22e0ff,
      crowd: ['#ff2fd0', '#22e0ff', '#ffe14d', '#a06bff', '#ffffff'],
      fog: 0x06031a, ambient: 0x3b2a6e, sun: 0xd9c8ff, sunI: 0.55, hemi: 0.45,
      sky: 0x090422, stars: true
    },
    sunset: {
      name: 'Sunset Speedway',
      turf: ['#3a1f2e', '#2e1826'], turfLine: '#ffd9a0', grid: '#6b3040',
      wall: '#2a1330', wallPanel: '#46203f', wallEdge: '#ff8a4c',
      trim: 0xff9a3c, trim2: 0xff4d8d,
      crowd: ['#ffd166', '#ff7b54', '#ffe8c9', '#ff4d8d', '#c86dd7'],
      fog: 0x2a0f22, ambient: 0x7a4a5a, sun: 0xffc48a, sunI: 0.85, hemi: 0.6,
      sky: 0x3a1430, stars: false
    },
    frost: {
      name: 'Frostbite Rink',
      turf: ['#cfe9ff', '#bcdcf7'], turfLine: '#2b6ea8', grid: '#9ec8e8',
      wall: '#18314a', wallPanel: '#23486b', wallEdge: '#8fd8ff',
      trim: 0x9ff0ff, trim2: 0xffffff,
      crowd: ['#ffffff', '#a8e6ff', '#d5f3ff', '#7fbfe0', '#ffe6a8'],
      fog: 0x0d2436, ambient: 0x7c9fbd, sun: 0xe8f6ff, sunI: 0.95, hemi: 0.72,
      sky: 0x14304a, stars: false,
      icy: true
    },
    volcano: {
      name: 'Volcano Pit',
      turf: ['#2a1512', '#1e0f0c'], turfLine: '#ffb03a', grid: '#5e2410',
      wall: '#180a08', wallPanel: '#2e120c', wallEdge: '#ff5a1e',
      trim: 0xff5a1e, trim2: 0xffc247,
      crowd: ['#ff7b2e', '#ffc247', '#ff3b1e', '#ffe9c4', '#8a2b12'],
      fog: 0x150604, ambient: 0x6b3320, sun: 0xffb27a, sunI: 0.7, hemi: 0.5,
      sky: 0x1c0705, stars: false, embers: true
    },
    space: {
      name: 'Zero-G Station',
      turf: ['#101a34', '#0b1329'], turfLine: '#7fd4ff', grid: '#1e3a6e',
      wall: '#070a18', wallPanel: '#101b39', wallEdge: '#4d7dff',
      trim: 0x4d7dff, trim2: 0x9fffe0,
      crowd: ['#9fffe0', '#4d7dff', '#ffffff', '#c98cff', '#ffe27a'],
      fog: 0x03050f, ambient: 0x2c3f6b, sun: 0xcddcff, sunI: 0.6, hemi: 0.4,
      sky: 0x03050f, stars: true
    },
    colosseum: {
      name: "Champion's Colosseum",
      turf: ['#241c0d', '#1a1409'], turfLine: '#ffe08a', grid: '#5c4718',
      wall: '#141008', wallPanel: '#2b2110', wallEdge: '#ffcc4d',
      trim: 0xffcc4d, trim2: 0xff6b3d,
      crowd: ['#ffd700', '#fff3c4', '#ff6b3d', '#ffffff', '#c9a227'],
      fog: 0x0c0904, ambient: 0x6e5a2c, sun: 0xfff0c4, sunI: 0.9, hemi: 0.6,
      sky: 0x120d05, stars: true
    }
  };

  /* ---------------- canvas texture helpers ---------------- */

  function cv(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function tex(canvas, rx, ry) {
    var t = new T.CanvasTexture(canvas);
    if (rx || ry) {
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(rx || 1, ry || 1);
    }
    t.anisotropy = 8;
    return t;
  }

  /* the pitch: mowed stripes, grid, and all the markings baked in */
  function makePitch(th) {
    var W = 1020, H = 1320;              // 15 px per world unit-ish
    var c = cv(W, H), g = c.getContext('2d');
    g.fillStyle = th.turf[0]; g.fillRect(0, 0, W, H);

    // mowed stripes down the length
    var stripes = 16;
    for (var i = 0; i < stripes; i++) {
      if (i % 2) continue;
      g.fillStyle = th.turf[1];
      g.fillRect(0, (i / stripes) * H, W, H / stripes);
    }
    // faint tech grid
    g.strokeStyle = th.grid; g.lineWidth = 1.5; g.globalAlpha = 0.5;
    for (var x = 0; x <= W; x += W / 20) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (var y = 0; y <= H; y += H / 26) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.globalAlpha = 1;

    // speckle
    for (var s = 0; s < 2600; s++) {
      g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.035) + ')';
      var sx = Math.random() * W, sy = Math.random() * H, ss = 1 + Math.random() * 3;
      g.fillRect(sx, sy, ss, ss);
    }

    // markings
    g.strokeStyle = th.turfLine; g.lineWidth = 5; g.globalAlpha = 0.85;
    g.strokeRect(8, 8, W - 16, H - 16);
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    g.beginPath(); g.arc(W / 2, H / 2, W * 0.16, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(W / 2, H / 2, W * 0.032, 0, Math.PI * 2);
    g.fillStyle = th.turfLine; g.fill();

    // goal creases + corner arcs
    var gw = W * 0.30, gd = H * 0.085;
    g.lineWidth = 4;
    [0, 1].forEach(function (end) {
      var yy = end ? H - gd : 0;
      g.strokeRect(W / 2 - gw / 2, yy, gw, gd);
      g.beginPath();
      g.arc(W / 2, end ? H : 0, W * 0.115, end ? Math.PI : 0, end ? Math.PI * 2 : Math.PI);
      g.stroke();
    });
    for (var k = 0; k < 4; k++) {
      var cx = (k & 1) ? W - 8 : 8, cy = (k & 2) ? H - 8 : 8;
      g.beginPath();
      g.arc(cx, cy, W * 0.055, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;

    // R3 monogram at centre
    g.save();
    g.translate(W / 2, H / 2);
    g.globalAlpha = 0.22;
    g.fillStyle = th.turfLine;
    g.font = 'bold ' + Math.floor(W * 0.115) + 'px Arial Black, Impact, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('R3', 0, 2);
    g.restore();

    return tex(c);
  }

  /* wall panelling — tiled */
  function makeWall(th) {
    var S = 512, c = cv(S, S), g = c.getContext('2d');
    g.fillStyle = th.wall; g.fillRect(0, 0, S, S);
    var n = 4, cell = S / n;
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
      var pad = 7;
      g.fillStyle = ((i + j) % 2) ? th.wallPanel : th.wall;
      g.fillRect(i * cell + pad, j * cell + pad, cell - pad * 2, cell - pad * 2);
      g.strokeStyle = th.wallEdge; g.globalAlpha = 0.28; g.lineWidth = 2;
      g.strokeRect(i * cell + pad, j * cell + pad, cell - pad * 2, cell - pad * 2);
      g.globalAlpha = 1;
      // rivets
      g.fillStyle = th.wallEdge; g.globalAlpha = 0.4;
      [[pad + 8, pad + 8], [cell - pad - 8, pad + 8], [pad + 8, cell - pad - 8], [cell - pad - 8, cell - pad - 8]]
        .forEach(function (p) {
          g.beginPath(); g.arc(i * cell + p[0], j * cell + p[1], 2.6, 0, 7); g.fill();
        });
      g.globalAlpha = 1;
    }
    // scuffs
    for (var s = 0; s < 400; s++) {
      g.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.16) + ')';
      g.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 22, 1 + Math.random() * 3);
    }
    return tex(c, 1, 1);
  }

  /* a wall of tiny people */
  function makeCrowd(th) {
    var W = 1024, H = 256, c = cv(W, H), g = c.getContext('2d');
    g.fillStyle = '#05060c'; g.fillRect(0, 0, W, H);
    var rows = 7;
    for (var r = 0; r < rows; r++) {
      var y = H - 16 - r * (H / rows) * 0.94;
      var sz = 8.0 + r * 0.7;
      for (var x = -6; x < W + 6; x += sz * 2.0) {
        if (Math.random() < 0.12) continue;
        g.fillStyle = th.crowd[(Math.random() * th.crowd.length) | 0];
        g.globalAlpha = 0.55 + Math.random() * 0.45;
        var jx = x + (Math.random() - 0.5) * sz, jy = y + (Math.random() - 0.5) * sz * 0.8;
        g.beginPath(); g.arc(jx, jy, sz * 0.5, 0, 7); g.fill();          // head
        g.fillRect(jx - sz * 0.42, jy + sz * 0.35, sz * 0.84, sz * 1.0); // body
      }
    }
    g.globalAlpha = 1;
    // dark band along the bottom rail
    var grad = g.createLinearGradient(0, H - 30, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.9)');
    g.fillStyle = grad; g.fillRect(0, H - 30, W, 30);
    return tex(c, 5, 1);
  }

  /* goal netting — transparent grid */
  function makeNet() {
    var S = 128, c = cv(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(235,245,255,0.62)'; g.lineWidth = 2.0;
    for (var i = 0; i <= 8; i++) {
      var p = i * S / 8;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
    }
    return tex(c, 6, 3);
  }

  /* soft radial blob — shadows, glows, sparks */
  var _blob = null, _ring = null, _star = null;
  function blobTex() {
    if (_blob) return _blob;
    var S = 128, c = cv(S, S), g = c.getContext('2d');
    var gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    _blob = tex(c); return _blob;
  }
  function ringTex() {
    if (_ring) return _ring;
    var S = 256, c = cv(S, S), g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 16; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 20, 0, 7); g.stroke();
    g.lineWidth = 5; g.globalAlpha = 0.5;
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 48, 0, 7); g.stroke();
    _ring = tex(c); return _ring;
  }
  function starTex() {
    if (_star) return _star;
    var S = 128, c = cv(S, S), g = c.getContext('2d');
    var gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    // cross flare
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(S / 2 - 1.5, 6, 3, S - 12);
    g.fillRect(6, S / 2 - 1.5, S - 12, 3);
    _star = tex(c); return _star;
  }
  RL.blobTex = blobTex; RL.ringTex = ringTex; RL.starTex = starTex;

  /* ---------------- rounded-rectangle helper ----------------
     Walks the perimeter of a rounded rect in XZ — this is the arena's
     horizontal cross-section anywhere along the vertical wall band. */
  function roundRect(hx, hz, r, steps) {
    var pts = [], i, a;
    var q = Math.max(2, Math.round(steps / 4));
    // +X +Z corner  -> angles 0..90 measured from +X axis
    var cs = [[hx - r, hz - r, 0], [-(hx - r), hz - r, Math.PI * 0.5],
    [-(hx - r), -(hz - r), Math.PI], [hx - r, -(hz - r), Math.PI * 1.5]];
    for (var c = 0; c < 4; c++) {
      for (i = 0; i < q; i++) {
        a = cs[c][2] + (i / q) * Math.PI * 0.5;
        pts.push([cs[c][0] + Math.cos(a) * r, cs[c][1] + Math.sin(a) * r]);
      }
    }
    return pts;
  }
  RL.roundRect = roundRect;

  /* ---------------- the shell ----------------
     A sphere's worth of directions, each pushed out to the exact zero
     crossing of RL.arenaSD.  Mesh == collision surface, by construction. */

  function buildShell(quality, th) {
    var segW = quality === 'low' ? 48 : (quality === 'medium' ? 72 : 100);
    var segH = quality === 'low' ? 28 : (quality === 'medium' ? 40 : 56);
    // hue of the pitch, normalised so it tints the corner ramps rather than
    // just darkening them
    var turf = new T.Color(th.turf[0]);
    var mx = Math.max(turf.r, turf.g, turf.b) || 1;
    var tr = turf.r / mx, tg = turf.g / mx, tb = turf.b / mx;
    var geo = new T.SphereGeometry(1, segW, segH);
    var pos = geo.attributes.position;
    // Ray origin sits inside the goal mouth's height range so rays fired at
    // the nets pass cleanly through the opening and hit the back of the net.
    var cx = 0, cy = A.goalH * 0.48, cz = 0;
    var col = new Float32Array(pos.count * 3);
    var uv = geo.attributes.uv;
    var v = new T.Vector3();

    for (var i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      // bisect for the surface along this ray
      var lo = 0.1, hi = 130;
      if (RL.arenaSD(cx + v.x * hi, cy + v.y * hi, cz + v.z * hi) < 0) {
        // ray never leaves (shouldn't happen) — clamp
      }
      for (var it = 0; it < 26; it++) {
        var mid = (lo + hi) * 0.5;
        if (RL.arenaSD(cx + v.x * mid, cy + v.y * mid, cz + v.z * mid) < 0) lo = mid; else hi = mid;
      }
      var t = (lo + hi) * 0.5;
      var px = cx + v.x * t, py = cy + v.y * t, pz = cz + v.z * t;
      pos.setXYZ(i, px, py, pz);

      // planar UVs chosen by whichever axis the surface faces
      var ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
      var u0, v0;
      if (ay > ax && ay > az) { u0 = px / 11; v0 = pz / 11; }
      else if (ax > az) { u0 = pz / 11; v0 = py / 9; }
      else { u0 = px / 11; v0 = py / 9; }
      uv.setXY(i, u0, v0);

      // vertical shade ramp + a warm pool over each goal mouth
      var up = M.clamp(py / A.h, 0, 1);
      var shade = 1.05 - up * 0.55;
      var nearGoal = M.clamp(1 - (Math.abs(Math.abs(pz) - A.hz) / 26), 0, 1) *
        M.clamp(1 - Math.abs(px) / 30, 0, 1);
      // fade the corner ramps into the pitch colour, so the turf doesn't look
      // like a rug thrown down in the middle of a differently-coloured floor
      var low = M.clamp(1 - py / (A.r * 1.25), 0, 1) * 0.9;
      col[i * 3] = (shade + nearGoal * 0.22) * M.lerp(1, tr, low);
      col[i * 3 + 1] = (shade + nearGoal * 0.10) * M.lerp(1, tg, low);
      col[i * 3 + 2] = (shade + nearGoal * 0.26) * M.lerp(1, tb, low);
    }
    /* Drop every triangle that lies wholly in the floor / corner-ramp zone.
       Ray-projecting a sphere puts each vertex exactly on the surface, but
       the chords between them cut across — near the floor those rays fan out
       so fast that the mesh bulged up to 0.65 units above the pitch and hid
       half of it. buildFloorField() covers that zone exactly instead. */
    var idx = geo.index.array;
    var keep = [];
    for (var f = 0; f < idx.length; f += 3) {
      var a = idx[f], b = idx[f + 1], c = idx[f + 2];
      if (pos.getY(a) < A.r && pos.getY(b) < A.r && pos.getY(c) < A.r) continue;
      keep.push(a, b, c);
    }
    geo.setIndex(keep);

    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.attributes.position.needsUpdate = true;
    return geo;
  }

  /* The floor and the curved corner ramps, as a heightfield sampled straight
     off the SDF — one height per (x, z), so it is exact by construction. */
  function buildFloorField(th, quality) {
    var nx = quality === 'low' ? 44 : (quality === 'medium' ? 72 : 108);
    var nz = Math.round(nx * A.hz / A.hx);
    var geo = new T.PlaneGeometry(A.hx * 2 - 0.2, A.hz * 2 - 0.2, nx, nz);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position, uv = geo.attributes.uv;
    var col = new Float32Array(pos.count * 3);
    var fw = A.hx - A.r, fl = A.hz - A.r;

    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i), y = 0;
      if (RL.arenaSD(x, 0, z) >= 0) {           // outside at ground level: on a ramp
        var lo = 0, hi = A.r + 2.0;
        for (var it = 0; it < 24; it++) {
          var mid = (lo + hi) * 0.5;
          if (RL.arenaSD(x, mid, z) < 0) hi = mid; else lo = mid;
        }
        y = hi;
      }
      pos.setY(i, y);
      // the pitch texture spans the flat area and clamps up the ramps
      uv.setXY(i, x / (fw * 2) + 0.5, 0.5 - z / (fl * 2));
      // ...and the ramps darken into the wall tone as they climb
      var t = M.clamp(y / (A.r * 0.85), 0, 1);
      var k = 1 - t * 0.62;
      col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k * (1 + t * 0.28);
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  }

  /* ---------------- Arena class ---------------- */

  function Arena(scene, themeKey, quality) {
    this.scene = scene;
    this.theme = THEMES[themeKey] || THEMES.dome;
    this.quality = quality;
    this.group = new T.Group();
    this.disposables = [];
    this.pads = [];
    this.goalLights = [];
    this.crowdMats = [];
    this.embers = null;
    this.t = 0;
    scene.add(this.group);
    this.build();
  }

  Arena.prototype._track = function (o) { this.disposables.push(o); return o; };

  Arena.prototype.build = function () {
    var th = this.theme, self = this, i;

    /* --- shell --- */
    var shellGeo = this._track(buildShell(this.quality, th));
    var wallTex = this._track(makeWall(th));
    var shellMat = this._track(new T.MeshLambertMaterial({
      map: wallTex, side: T.BackSide, vertexColors: true
    }));
    var shell = new T.Mesh(shellGeo, shellMat);
    shell.name = 'shell';
    this.group.add(shell);

    /* --- pitch + corner ramps, as one exact heightfield --- */
    var pitchGeo = this._track(buildFloorField(th, this.quality));
    var pitchMat = this._track(new T.MeshLambertMaterial({
      map: this._track(makePitch(th)), vertexColors: true
    }));
    var pitch = new T.Mesh(pitchGeo, pitchMat);
    pitch.position.y = 0.012;
    pitch.receiveShadow = true;
    this.group.add(pitch);
    this.pitch = pitch;

    /* --- neon trim: a glowing rail where the wall meets the floor, and
           another at the top of the crowd --- */
    function trimRing(y, thick, color, inset) {
      var pts = roundRect(A.hx - inset, A.hz - inset, A.r, 96);
      var g = new T.BufferGeometry();
      var n = pts.length, arr = new Float32Array(n * 6 * 3), k = 0;
      for (var i2 = 0; i2 < n; i2++) {
        var p = pts[i2], q = pts[(i2 + 1) % n];
        var a = [p[0], y, p[1]], b = [q[0], y, q[1]],
          c = [q[0], y + thick, q[1]], d = [p[0], y + thick, p[1]];
        [a, b, c, a, c, d].forEach(function (vv) {
          arr[k++] = vv[0]; arr[k++] = vv[1]; arr[k++] = vv[2];
        });
      }
      g.setAttribute('position', new T.BufferAttribute(arr, 3));
      var m = new T.MeshBasicMaterial({
        color: color, side: T.DoubleSide, transparent: true, opacity: 0.95,
        blending: T.AdditiveBlending, depthWrite: false
      });
      self._track(g); self._track(m);
      return new T.Mesh(g, m);
    }
    this.group.add(trimRing(0.06, 0.30, th.trim, 0.10));
    this.group.add(trimRing(A.h - A.r - 0.6, 0.22, th.trim2, 0.10));
    this.group.add(trimRing(6.6, 0.14, th.trim2, 0.10));

    /* --- crowd band --- */
    (function () {
      var y0 = 7.2, y1 = 13.2, inset = 0.14;
      var pts = roundRect(A.hx - inset, A.hz - inset, A.r, 128);
      var n = pts.length;
      var g = new T.BufferGeometry();
      var arr = new Float32Array(n * 6 * 3), uvs = new Float32Array(n * 6 * 2);
      var k = 0, uk = 0, run = 0;
      for (var i2 = 0; i2 < n; i2++) {
        var p = pts[i2], q = pts[(i2 + 1) % n];
        var seg = Math.hypot(q[0] - p[0], q[1] - p[1]);
        var u0 = run / 14, u1 = (run + seg) / 14; run += seg;
        var quad = [[p, y0, u0, 0], [q, y0, u1, 0], [q, y1, u1, 1],
        [p, y0, u0, 0], [q, y1, u1, 1], [p, y1, u0, 1]];
        for (var z = 0; z < 6; z++) {
          arr[k++] = quad[z][0][0]; arr[k++] = quad[z][1]; arr[k++] = quad[z][0][1];
          uvs[uk++] = quad[z][2]; uvs[uk++] = quad[z][3];
        }
      }
      g.setAttribute('position', new T.BufferAttribute(arr, 3));
      g.setAttribute('uv', new T.BufferAttribute(uvs, 2));
      // DoubleSide: the strip's winding follows the perimeter, so which face
      // points into the arena flips at the corners
      var m = new T.MeshBasicMaterial({
        map: self._track(makeCrowd(th)), side: T.DoubleSide, color: 0xc2cbdd
      });
      self._track(g); self._track(m);
      self.crowdMats.push(m);
      self.group.add(new T.Mesh(g, m));
    })();

    /* --- goals --- */
    this.goals = [];
    [1, -1].forEach(function (side) {
      var teamColor = side > 0 ? 0xff6b3d : 0x3da5ff;   // +Z net is orange's, -Z is blue's
      var g = new T.Group();
      var z = side * A.hz;

      // frame
      var fm = self._track(new T.MeshBasicMaterial({ color: teamColor }));
      var bar = 0.42;
      var top = new T.Mesh(self._track(new T.BoxGeometry(A.goalW * 2 + bar * 2, bar, bar)), fm);
      top.position.set(0, A.goalH, z);
      var lp = new T.Mesh(self._track(new T.BoxGeometry(bar, A.goalH, bar)), fm);
      lp.position.set(-A.goalW - bar / 2, A.goalH / 2, z);
      var rp = lp.clone(); rp.position.x = A.goalW + bar / 2;
      g.add(top, lp, rp);

      // glowing mouth plane you can see from across the pitch
      var glowMat = self._track(new T.MeshBasicMaterial({
        color: teamColor, transparent: true, opacity: 0.20,
        blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
      }));
      var glow = new T.Mesh(self._track(new T.PlaneGeometry(A.goalW * 2, A.goalH)), glowMat);
      glow.position.set(0, A.goalH / 2, z - side * 0.05);
      g.add(glow);

      // netting on the three inner faces of the box
      var netMat = self._track(new T.MeshBasicMaterial({
        map: self._track(makeNet()), transparent: true, side: T.DoubleSide,
        color: teamColor, opacity: 0.85, depthWrite: false
      }));
      var D = A.goalD;
      var back = new T.Mesh(self._track(new T.PlaneGeometry(A.goalW * 2, A.goalH)), netMat);
      back.position.set(0, A.goalH / 2, z + side * D);
      g.add(back);
      [-1, 1].forEach(function (sx) {
        var sidep = new T.Mesh(self._track(new T.PlaneGeometry(D, A.goalH)), netMat);
        sidep.rotation.y = Math.PI / 2;
        sidep.position.set(sx * A.goalW, A.goalH / 2, z + side * D / 2);
        g.add(sidep);
      });
      var ceilp = new T.Mesh(self._track(new T.PlaneGeometry(A.goalW * 2, D)), netMat);
      ceilp.rotation.x = Math.PI / 2;
      ceilp.position.set(0, A.goalH, z + side * D / 2);
      g.add(ceilp);

      // point light that flares on a goal
      var light = new T.PointLight(teamColor, 0.0, 60, 2);
      light.position.set(0, A.goalH * 0.6, z - side * 3);
      g.add(light);
      self.goalLights.push(light);

      self.group.add(g);
      self.goals.push({ side: side, group: g, glow: glowMat, frame: fm, light: light, color: teamColor });
    });

    /* --- boost pads --- */
    this.buildPads();

    /* --- lights --- */
    var hemi = new T.HemisphereLight(0xffffff, th.fog, th.hemi);
    this.group.add(hemi);
    var amb = new T.AmbientLight(th.ambient, 0.42);
    this.group.add(amb);
    var sun = new T.DirectionalLight(th.sun, th.sunI);
    sun.position.set(28, 60, 18);
    this.group.add(sun);
    var sun2 = new T.DirectionalLight(th.sun, th.sunI * 0.34);
    sun2.position.set(-30, 42, -26);
    this.group.add(sun2);
    this.sun = sun;

    /* --- stars / ceiling sparkle --- */
    if (th.stars) {
      var count = this.quality === 'low' ? 220 : 520;
      var sg = new T.BufferGeometry(), sp = new Float32Array(count * 3);
      for (i = 0; i < count; i++) {
        var ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
        sp[i * 3] = Math.cos(ang) * rr * (A.hx - 2);
        sp[i * 3 + 1] = A.h - 0.3 - Math.random() * 2.4;
        sp[i * 3 + 2] = Math.sin(ang) * rr * (A.hz - 2);
      }
      sg.setAttribute('position', new T.BufferAttribute(sp, 3));
      var sm = new T.PointsMaterial({
        size: 0.75, map: starTex(), transparent: true, depthWrite: false,
        blending: T.AdditiveBlending, color: 0xffffff, sizeAttenuation: true
      });
      this._track(sg); this._track(sm);
      this.starField = new T.Points(sg, sm);
      this.group.add(this.starField);
    }

    /* --- volcano embers --- */
    if (th.embers && this.quality !== 'low') {
      var ec = 180, eg = new T.BufferGeometry(), ep = new Float32Array(ec * 3);
      this.emberVel = new Float32Array(ec);
      for (i = 0; i < ec; i++) {
        ep[i * 3] = (Math.random() * 2 - 1) * (A.hx - 4);
        ep[i * 3 + 1] = Math.random() * A.h;
        ep[i * 3 + 2] = (Math.random() * 2 - 1) * (A.hz - 4);
        this.emberVel[i] = 0.8 + Math.random() * 2.2;
      }
      eg.setAttribute('position', new T.BufferAttribute(ep, 3));
      var em = new T.PointsMaterial({
        size: 0.5, map: blobTex(), transparent: true, opacity: 0.85,
        depthWrite: false, blending: T.AdditiveBlending, color: 0xff7a2e
      });
      this._track(eg); this._track(em);
      this.embers = new T.Points(eg, em);
      this.group.add(this.embers);
    }

    this.scene.fog = new T.FogExp2(th.fog, 0.0042);
    this.scene.background = new T.Color(th.sky);
  };

  /* Rocket-League-style pad layout: 6 big corners/sides + a grid of smalls */
  Arena.prototype.buildPads = function () {
    var self = this, th = this.theme;
    var big = [
      [-(A.hx - 4.5), -(A.hz - 6.5)], [A.hx - 4.5, -(A.hz - 6.5)],
      [-(A.hx - 4.5), A.hz - 6.5], [A.hx - 4.5, A.hz - 6.5],
      [-(A.hx - 3.0), 0], [A.hx - 3.0, 0]
    ];
    var small = [
      [0, -34], [0, -17], [0, 0], [0, 17], [0, 34],
      [-17, -26], [17, -26], [-17, 26], [17, 26],
      [-25, -9], [25, -9], [-25, 9], [25, 9],
      [-9, -40], [9, -40], [-9, 40], [9, 40],
      [-30, -34], [30, -34], [-30, 34], [30, 34],
      [-17, 0], [17, 0], [-31, 0], [31, 0]
    ];

    var ringGeo = this._track(new T.PlaneGeometry(1, 1));

    function mk(x, z, isBig) {
      var color = isBig ? 0xffd24a : 0xffe98a;
      var r = isBig ? RL.PADS.bigR : RL.PADS.r;
      // soft radial falloff, so a pad reads as a pool of light rather than
      // a flat plate stuck to the pitch
      var mat = self._track(new T.MeshBasicMaterial({
        map: blobTex(), color: color, transparent: true, opacity: 0.55,
        blending: T.AdditiveBlending, depthWrite: false
      }));
      var disc = new T.Mesh(ringGeo, mat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, 0.06, z);
      disc.scale.setScalar(r * 2.4);
      self.group.add(disc);

      var ringMat = self._track(new T.MeshBasicMaterial({
        map: ringTex(), color: color, transparent: true, opacity: 0.9,
        blending: T.AdditiveBlending, depthWrite: false
      }));
      var ring = new T.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.09, z);
      ring.scale.setScalar(r * 2.1);
      self.group.add(ring);

      var pillar = null;
      if (isBig) {
        var pMat = self._track(new T.MeshBasicMaterial({
          map: blobTex(), color: color, transparent: true, opacity: 0.30,
          blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
        }));
        pillar = new T.Mesh(self._track(new T.PlaneGeometry(r * 2.0, 4.2)), pMat);
        pillar.position.set(x, 2.1, z);
        self.group.add(pillar);
      }

      self.pads.push({
        x: x, z: z, big: isBig, r: r,
        amount: isBig ? RL.PADS.bigAmt : RL.PADS.smallAmt,
        cool: isBig ? RL.PADS.bigCool : RL.PADS.smallCool,
        timer: 0, disc: disc, ring: ring, pillar: pillar,
        mat: mat, ringMat: ringMat
      });
    }
    big.forEach(function (p) { mk(p[0], p[1], true); });
    small.forEach(function (p) { mk(p[0], p[1], false); });
  };

  Arena.prototype.update = function (dt, camera) {
    this.t += dt;
    var i, p;
    for (i = 0; i < this.pads.length; i++) {
      p = this.pads[i];
      if (p.timer > 0) {
        p.timer -= dt;
        var frac = 1 - p.timer / p.cool;
        var o = p.timer > 0 ? 0.06 : 0.55;
        p.mat.opacity = p.timer > 0 ? 0.05 + frac * 0.1 : 0.55;
        p.ringMat.opacity = p.timer > 0 ? 0.08 + frac * 0.35 : 0.9;
        p.ring.scale.setScalar(p.r * (p.timer > 0 ? 1.0 + frac * 1.1 : 2.1));
        if (p.pillar) p.pillar.visible = p.timer <= 0;
      } else {
        var pulse = 0.75 + Math.sin(this.t * 3.0 + i * 0.7) * 0.25;
        p.ringMat.opacity = 0.55 + pulse * 0.4;
        p.ring.scale.setScalar(p.r * (1.95 + pulse * 0.20));
        p.mat.opacity = 0.35 + pulse * 0.25;
        if (p.pillar) {
          p.pillar.visible = true;
          p.pillar.material.opacity = 0.16 + pulse * 0.2;
          if (camera) p.pillar.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
        }
      }
    }

    // goal glow breathes
    for (i = 0; i < this.goals.length; i++) {
      var g = this.goals[i];
      g.glow.opacity = 0.16 + Math.sin(this.t * 2 + i * 2) * 0.06;
      if (g.light.intensity > 0) g.light.intensity = Math.max(0, g.light.intensity - dt * 2.2);
    }

    // crowd settles back to its resting brightness after a cheer
    for (i = 0; i < this.crowdMats.length; i++) {
      var m = this.crowdMats[i], c = m.color;
      c.r = M.damp(c.r, 0.76, 3, dt);
      c.g = M.damp(c.g, 0.80, 3, dt);
      c.b = M.damp(c.b, 0.87, 3, dt);
    }

    if (this.starField) this.starField.rotation.y += dt * 0.012;

    if (this.embers) {
      var arr = this.embers.geometry.attributes.position.array;
      for (i = 0; i < this.emberVel.length; i++) {
        arr[i * 3 + 1] += this.emberVel[i] * dt;
        arr[i * 3] += Math.sin(this.t * 0.8 + i) * dt * 0.6;
        if (arr[i * 3 + 1] > A.h) {
          arr[i * 3 + 1] = 0.2;
          arr[i * 3] = (Math.random() * 2 - 1) * (A.hx - 4);
          arr[i * 3 + 2] = (Math.random() * 2 - 1) * (A.hz - 4);
        }
      }
      this.embers.geometry.attributes.position.needsUpdate = true;
    }
  };

  Arena.prototype.cheer = function (amount) {
    for (var i = 0; i < this.crowdMats.length; i++) {
      this.crowdMats[i].color.setRGB(1.6 * amount, 1.5 * amount, 1.7 * amount);
    }
  };

  Arena.prototype.flashGoal = function (side) {
    for (var i = 0; i < this.goals.length; i++) {
      if (this.goals[i].side === side) this.goals[i].light.intensity = 5.5;
    }
  };

  Arena.prototype.dispose = function () {
    this.scene.remove(this.group);
    this.group.traverse(function (o) { /* geometry/material freed below */ });
    for (var i = 0; i < this.disposables.length; i++) {
      var d = this.disposables[i];
      if (d && d.dispose) d.dispose();
    }
    this.disposables.length = 0;
    this.pads.length = 0;
    this.scene.fog = null;
  };

  RL.Arena = Arena;

})(window);
