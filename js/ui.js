/* ============================================================
   ui.js — menus, HUD and settings.  Plain DOM over the canvas:
   crisp text at any resolution and it costs the renderer nothing.
   ============================================================ */
(function (global) {
  'use strict';
  var RL = global.RL, M = RL.M;

  var U = RL.UI = { screen: 'title', hudOn: false };
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function hex(c) { return '#' + ('000000' + c.toString(16)).slice(-6); }

  function click(node, fn, sound) {
    node.addEventListener('click', function (e) {
      e.preventDefault();
      RL.Audio.unlock();
      RL.Audio.sfxUI(sound || 'tap');
      fn(e);
    });
    return node;
  }

  /* ---------------- screens ---------------- */

  U.show = function (name) {
    U.screen = name;
    var overlay = $('overlay');
    overlay.style.display = name === 'game' ? 'none' : 'flex';
    ['title', 'season', 'exhibition', 'garage', 'settings', 'controls', 'howto', 'pause', 'results']
      .forEach(function (s) {
        var n = $('scr-' + s);
        if (n) n.classList.toggle('on', s === name);
      });
    if (name !== 'game') $('hud').classList.remove('on');
    document.body.classList.toggle('in-game', name === 'game');
  };

  U.showHUD = function (on) {
    U.hudOn = on;
    $('hud').classList.toggle('on', !!on);
    var touch = !!on && RL.isTouch;
    $('touch').classList.toggle('on', touch);
    document.body.classList.toggle('touch-ui', touch);
  };

  /* ---------------- title ---------------- */

  function buildTitle() {
    var s = $('scr-title');
    clear(s);
    var card = el('div', 'card title-card');

    var logo = el('div', 'logo');
    logo.innerHTML = '<span class="l1">ROCKET</span><span class="l2">RUMBLE</span>';
    card.appendChild(logo);
    card.appendChild(el('div', 'sub', "R3's Turbo League"));

    var stars = RL.totalStars();
    card.appendChild(el('div', 'tiny', '★ ' + stars + ' / ' + (RL.LEVELS.length * 3) +
      '   ·   ' + RL.save.totalGoals + ' career goals'));

    var menu = el('div', 'menu');
    menu.appendChild(click(el('button', 'btn primary', 'PLAY SEASON'), function () { buildSeason(); U.show('season'); }, 'big'));
    menu.appendChild(click(el('button', 'btn', 'QUICK MATCH'), function () { buildExhibition(); U.show('exhibition'); }));
    menu.appendChild(click(el('button', 'btn', 'FREE PLAY'), function () {
      RL.Game.start(RL.freePlay(RL.LEVELS[Math.min(RL.save.unlocked, RL.LEVELS.length) - 1].theme));
      U.show('game');
    }));
    menu.appendChild(click(el('button', 'btn', 'GARAGE'), function () { buildGarage(); U.show('garage'); }));
    menu.appendChild(click(el('button', 'btn', 'CONTROLS'), function () { buildControls(); U.show('controls'); }));
    menu.appendChild(click(el('button', 'btn', 'SETTINGS'), function () { buildSettings(); U.show('settings'); }));
    menu.appendChild(click(el('button', 'btn ghost', 'HOW TO PLAY'), function () { buildHowTo(); U.show('howto'); }));
    card.appendChild(menu);

    card.appendChild(el('div', 'foot', 'Built for Roland N. Emokpae III'));
    s.appendChild(card);
  }

  /* ---------------- season ---------------- */

  function starRow(n) {
    var w = el('span', 'stars');
    for (var i = 0; i < 3; i++) {
      var st = el('span', 'star' + (i < n ? ' on' : ''), '★');
      w.appendChild(st);
    }
    return w;
  }

  function buildSeason() {
    var s = $('scr-season');
    clear(s);
    var card = el('div', 'card wide');
    card.appendChild(header('SEASON', function () { buildTitle(); U.show('title'); }));

    var diff = el('div', 'row diffrow');
    diff.appendChild(el('span', 'lbl', 'Difficulty'));
    var seg = el('div', 'seg');
    RL.SKILL_ORDER.forEach(function (k) {
      var b = el('button', 'segbtn' + (RL.save.difficulty === k ? ' on' : ''), RL.SKILLS[k].label);
      click(b, function () {
        RL.save.difficulty = k; RL.persist();
        buildSeason();
      });
      seg.appendChild(b);
    });
    diff.appendChild(seg);
    card.appendChild(diff);

    var list = el('div', 'levels');
    RL.LEVELS.forEach(function (lv) {
      var locked = lv.id > RL.save.unlocked;
      var got = RL.save.stars['L' + lv.id] || 0;
      var item = el('div', 'level' + (locked ? ' locked' : ''));
      var th = RL.THEMES[lv.theme];

      var swatch = el('div', 'swatch');
      swatch.style.background = 'linear-gradient(135deg,' + th.turf[0] + ',' + hex(th.trim) + ')';
      swatch.appendChild(el('span', 'num', locked ? '\u{1F512}' : String(lv.id)));
      item.appendChild(swatch);

      var body = el('div', 'lvbody');
      var t = el('div', 'lvtitle');
      t.appendChild(el('span', 'nm', lv.name));
      t.appendChild(el('span', 'tag', lv.tag));
      body.appendChild(t);
      body.appendChild(el('div', 'lvblurb', locked ? 'Win the previous match to unlock.' : lv.blurb));
      body.appendChild(starRow(got));
      item.appendChild(body);

      if (!locked) {
        click(item, function () {
          RL.Game.start(lv);
          U.show('game');
        }, 'big');
      }
      list.appendChild(item);
    });
    card.appendChild(list);
    s.appendChild(card);
  }

  function header(title, back) {
    var h = el('div', 'hdr');
    h.appendChild(click(el('button', 'back', '‹'), back, 'back'));
    h.appendChild(el('h2', null, title));
    h.appendChild(el('span', 'spacer'));
    return h;
  }

  /* ---------------- exhibition ---------------- */

  var exOpts = { theme: 'neon', teamSize: 1, time: 300, gravity: 1.0, grip: 1.0 };

  function buildExhibition() {
    var s = $('scr-exhibition');
    clear(s);
    var card = el('div', 'card wide');
    card.appendChild(header('QUICK MATCH', function () { buildTitle(); U.show('title'); }));

    card.appendChild(choiceRow('Arena', Object.keys(RL.THEMES).map(function (k) {
      return { v: k, l: RL.THEMES[k].name };
    }), exOpts.theme, function (v) { exOpts.theme = v; buildExhibition(); }));

    card.appendChild(choiceRow('Team size', [
      { v: 1, l: '1 v 1' }, { v: 2, l: '2 v 2' }, { v: 3, l: '3 v 3' }
    ], exOpts.teamSize, function (v) { exOpts.teamSize = v; buildExhibition(); }));

    card.appendChild(choiceRow('Match length', [
      { v: 120, l: '2 min' }, { v: 300, l: '5 min' }, { v: 600, l: '10 min' }, { v: 0, l: 'No limit' }
    ], exOpts.time, function (v) { exOpts.time = v; buildExhibition(); }));

    card.appendChild(choiceRow('Gravity', [
      { v: 0.42, l: 'Low' }, { v: 1.0, l: 'Normal' }, { v: 1.5, l: 'Heavy' }
    ], exOpts.gravity, function (v) { exOpts.gravity = v; buildExhibition(); }));

    card.appendChild(choiceRow('Grip', [
      { v: 0.42, l: 'Ice' }, { v: 1.0, l: 'Normal' }, { v: 1.4, l: 'Sticky' }
    ], exOpts.grip, function (v) { exOpts.grip = v; buildExhibition(); }));

    card.appendChild(choiceRow('Opponents', RL.SKILL_ORDER.map(function (k) {
      return { v: k, l: RL.SKILLS[k].label };
    }), RL.save.difficulty, function (v) { RL.save.difficulty = v; RL.persist(); buildExhibition(); }));

    var go = click(el('button', 'btn primary wide-btn', 'START MATCH'), function () {
      RL.Game.start(RL.exhibition(exOpts));
      U.show('game');
    }, 'big');
    card.appendChild(go);
    s.appendChild(card);
  }

  function choiceRow(label, options, current, onPick) {
    var r = el('div', 'row');
    r.appendChild(el('span', 'lbl', label));
    var seg = el('div', 'seg');
    options.forEach(function (o) {
      var b = el('button', 'segbtn' + (o.v === current ? ' on' : ''), o.l);
      click(b, function () { onPick(o.v); });
      seg.appendChild(b);
    });
    r.appendChild(seg);
    return r;
  }

  /* ---------------- garage ---------------- */

  function buildGarage() {
    var s = $('scr-garage');
    clear(s);
    var card = el('div', 'card wide');
    card.appendChild(header('GARAGE', function () { buildTitle(); U.show('title'); }));

    var grid = el('div', 'bodies');
    RL.BODIES.forEach(function (b, i) {
      var it = el('div', 'bodycard' + (RL.save.carBody === i ? ' on' : ''));
      it.appendChild(el('div', 'bname', b.name));
      it.appendChild(el('div', 'bdesc', b.desc));
      var bars = el('div', 'bars');
      [['SPD', b.speed], ['TRN', b.turn], ['PWR', b.power]].forEach(function (st) {
        var row = el('div', 'bar');
        row.appendChild(el('span', 'bk', st[0]));
        var track = el('span', 'track');
        var fill = el('span', 'fill');
        fill.style.width = Math.round(((st[1] - 0.85) / 0.35) * 100) + '%';
        track.appendChild(fill);
        row.appendChild(track);
        bars.appendChild(row);
      });
      it.appendChild(bars);
      click(it, function () { RL.save.carBody = i; RL.persist(); buildGarage(); });
      grid.appendChild(it);
    });
    card.appendChild(grid);

    card.appendChild(el('div', 'lbl pad', 'Paint'));
    var sw = el('div', 'swatches');
    RL.ACCENTS.forEach(function (a, i) {
      var b = el('button', 'sw' + (RL.save.carColor === i ? ' on' : ''));
      b.style.background = hex(a.c);
      b.title = a.name;
      click(b, function () { RL.save.carColor = i; RL.persist(); buildGarage(); });
      sw.appendChild(b);
    });
    card.appendChild(sw);
    card.appendChild(el('div', 'tiny pad',
      'Your car always wears your team colour in a match — the paint goes on the stripes, wing and wheels.'));
    s.appendChild(card);
  }

  /* ---------------- settings ---------------- */

  function slider(label, value, min, max, step, fmt, onChange) {
    var r = el('div', 'row');
    r.appendChild(el('span', 'lbl', label));
    var wrap = el('div', 'slwrap');
    var input = document.createElement('input');
    input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
    var out = el('span', 'slval', fmt(value));
    input.addEventListener('input', function () {
      var v = parseFloat(input.value);
      out.textContent = fmt(v);
      onChange(v);
    });
    wrap.appendChild(input); wrap.appendChild(out);
    r.appendChild(wrap);
    return r;
  }

  function toggle(label, value, onChange) {
    var r = el('div', 'row');
    r.appendChild(el('span', 'lbl', label));
    var b = el('button', 'tgl' + (value ? ' on' : ''), value ? 'ON' : 'OFF');
    click(b, function () {
      value = !value;
      b.classList.toggle('on', value);
      b.textContent = value ? 'ON' : 'OFF';
      onChange(value);
    });
    r.appendChild(b);
    return r;
  }

  function buildSettings() {
    var s = $('scr-settings');
    clear(s);
    var card = el('div', 'card wide');
    card.appendChild(header('SETTINGS', function () { buildTitle(); U.show('title'); }));

    card.appendChild(choiceRow('Graphics', [
      { v: 'auto', l: 'Auto' }, { v: 'low', l: 'Low' },
      { v: 'medium', l: 'Medium' }, { v: 'high', l: 'High' }
    ], RL.save.quality, function (v) {
      RL.save.quality = v; RL.persist(); RL.Game.quality = RL.autoQuality(); RL.Game.resize();
      buildSettings();
    }));

    card.appendChild(el('div', 'lbl pad', 'Driving help'));
    card.appendChild(toggle('Smooth steering', RL.save.smoothSteer, function (v) {
      RL.save.smoothSteer = v; RL.persist();
    }));
    card.appendChild(toggle('Auto-level in the air', RL.save.assistLevel, function (v) {
      RL.save.assistLevel = v; RL.persist();
    }));
    card.appendChild(el('div', 'tiny pad',
      'Smooth steering eases the car into a turn instead of snapping to full lock. ' +
      'Auto-level rolls you back onto your wheels when you are not steering in the air — ' +
      'it stops the moment you touch a control.'));

    card.appendChild(toggle('Ball camera by default', RL.save.ballCam, function (v) {
      RL.save.ballCam = v; RL.persist();
    }));
    card.appendChild(toggle('Invert air pitch', RL.save.invertPitch, function (v) {
      RL.save.invertPitch = v; RL.persist();
    }));

    card.appendChild(slider('Camera distance', RL.save.camDist, 6, 15, 0.5,
      function (v) { return v.toFixed(1); }, function (v) { RL.save.camDist = v; RL.persist(); }));
    card.appendChild(slider('Camera height', RL.save.camHeight, 1.5, 6, 0.1,
      function (v) { return v.toFixed(1); }, function (v) { RL.save.camHeight = v; RL.persist(); }));
    card.appendChild(slider('Field of view', RL.save.camFov, 65, 110, 1,
      function (v) { return v + '°'; }, function (v) {
        RL.save.camFov = v; RL.persist(); RL.Game.resize();
      }));
    card.appendChild(slider('Screen shake', RL.save.shake, 0, 1.5, 0.05,
      function (v) { return Math.round(v * 100) + '%'; }, function (v) { RL.save.shake = v; RL.persist(); }));
    card.appendChild(slider('Steering sensitivity', RL.save.steerSens, 0.5, 1.6, 0.05,
      function (v) { return v.toFixed(2); }, function (v) { RL.save.steerSens = v; RL.persist(); }));
    card.appendChild(slider('Air control sensitivity', RL.save.airSens, 0.5, 1.6, 0.05,
      function (v) { return v.toFixed(2); }, function (v) { RL.save.airSens = v; RL.persist(); }));
    card.appendChild(slider('Controller deadzone', RL.save.deadzone, 0.02, 0.4, 0.01,
      function (v) { return Math.round(v * 100) + '%'; }, function (v) { RL.save.deadzone = v; RL.persist(); }));

    card.appendChild(slider('Sound effects', RL.save.sfxVol, 0, 1, 0.05,
      function (v) { return Math.round(v * 100) + '%'; },
      function (v) { RL.save.sfxVol = v; RL.Audio.setVolumes(); RL.persist(); }));
    card.appendChild(slider('Music', RL.save.musicVol, 0, 1, 0.05,
      function (v) { return Math.round(v * 100) + '%'; },
      function (v) { RL.save.musicVol = v; RL.Audio.setVolumes(); RL.persist(); }));

    if (RL.isTouch) {
      card.appendChild(toggle('Auto-accelerate (touch)', RL.Input.autoThrottle, function (v) {
        RL.Input.autoThrottle = v;
      }));
      card.appendChild(choiceRow('Stick side', [
        { v: 'left', l: 'Left' }, { v: 'right', l: 'Right' }
      ], RL.save.touchLayout, function (v) {
        RL.save.touchLayout = v; RL.persist();
        $('touch').classList.toggle('mirrored', v === 'right');
        buildSettings();
      }));
    }

    var danger = click(el('button', 'btn ghost danger', 'RESET ALL PROGRESS'), function () {
      if (global.confirm('Erase all stars, unlocks and settings?')) {
        RL.resetSave(); buildTitle(); U.show('title');
      }
    });
    card.appendChild(danger);
    s.appendChild(card);
  }

  /* ---------------- controls ---------------- */

  function buildControls() {
    var s = $('scr-controls');
    clear(s);
    var card = el('div', 'card wide');
    card.appendChild(header('CONTROLS', function () { buildTitle(); U.show('title'); }));

    card.appendChild(el('div', 'tiny pad',
      'Click a key to change it, then press the key you want. Esc cancels.'));

    var list = el('div', 'binds');
    RL.ACTION_LABELS.forEach(function (pair) {
      var action = pair[0], label = pair[1];
      var row = el('div', 'bindrow');
      row.appendChild(el('span', 'bl', label));
      var b = el('button', 'keycap', RL.Input.bindLabel(action));
      click(b, function () {
        b.textContent = 'press a key…';
        b.classList.add('listening');
        RL.Input.beginCapture(action, function () {
          b.classList.remove('listening');
          b.textContent = RL.Input.bindLabel(action);
        });
      });
      row.appendChild(b);
      list.appendChild(row);
    });
    card.appendChild(list);

    card.appendChild(click(el('button', 'btn ghost', 'RESTORE DEFAULT KEYS'), function () {
      RL.save.keys = JSON.parse(JSON.stringify(RL.DEFAULT_KEYS));
      RL.persist();
      buildControls();
    }));

    var pad = el('div', 'padinfo');
    pad.appendChild(el('h3', null, 'Gamepad'));
    pad.appendChild(el('p', null,
      'Plug in any controller and it just works. Right trigger accelerates, left trigger reverses, ' +
      'A jumps, X boosts, B powerslides and air-rolls, Y switches the camera, Start pauses.'));
    pad.appendChild(el('h3', null, 'Touch'));
    pad.appendChild(el('p', null,
      'On a phone or tablet the car drives itself forward. Steer with the stick, tap BRAKE to slow, ' +
      'and use BOOST and JUMP on the right. Turn off auto-accelerate in Settings if you want manual gas.'));
    card.appendChild(pad);
    s.appendChild(card);
  }

  /* ---------------- how to play ---------------- */

  function buildHowTo() {
    var s = $('scr-howto');
    clear(s);
    var card = el('div', 'card wide');
    card.appendChild(header('HOW TO PLAY', function () { buildTitle(); U.show('title'); }));
    var tips = [
      ['It is football, with cars.', 'Knock the giant ball into the other team’s net. Most goals when the clock runs out wins. A draw goes to overtime — next goal takes it.'],
      ['Boost is everything.', 'The yellow pads refill your boost. The big glowing ones give you a full tank. Boost makes you fast enough to demolish opponents — and fast enough to fly.'],
      ['Jump twice to flip.', 'Tap jump, then tap it again while holding a direction. Flipping forward is the hardest shot in the game. Flipping sideways is how you dodge.'],
      ['Yes, you can drive on the walls.', 'Hit a wall with enough speed and you’ll stick to it. The curved corners are ramps — use them to get up high.'],
      ['Aerials win matches.', 'Jump, then point your nose at the ball and hold boost. Steer in the air with the same stick you steer with on the ground.'],
      ['Powerslide round corners.', 'Hold the powerslide key and steer. You keep your speed instead of scrubbing it off.'],
      ['Don’t ball-chase.', 'If a team-mate is on the ball, hang back toward your own goal. Rotating is how good teams score.']
    ];
    var wrap = el('div', 'tips');
    tips.forEach(function (t) {
      var d = el('div', 'tip');
      d.appendChild(el('h3', null, t[0]));
      d.appendChild(el('p', null, t[1]));
      wrap.appendChild(d);
    });
    card.appendChild(wrap);
    s.appendChild(card);
  }

  /* ---------------- pause ---------------- */

  U.openPause = function () {
    var s = $('scr-pause');
    clear(s);
    var card = el('div', 'card');
    card.appendChild(el('h2', null, 'PAUSED'));
    var menu = el('div', 'menu');
    menu.appendChild(click(el('button', 'btn primary', 'RESUME'), function () { RL.Game.resume(); }, 'big'));
    menu.appendChild(click(el('button', 'btn', 'CONTROLS'), function () {
      buildControls();
      $('scr-controls').dataset.from = 'pause';
      U.show('controls');
    }));
    menu.appendChild(click(el('button', 'btn', 'SETTINGS'), function () {
      buildSettings();
      $('scr-settings').dataset.from = 'pause';
      U.show('settings');
    }));
    menu.appendChild(click(el('button', 'btn', 'RESTART'), function () {
      RL.Game.start(RL.Game.level); U.show('game');
    }));
    menu.appendChild(click(el('button', 'btn ghost', 'QUIT TO MENU'), function () {
      RL.Game.quit(); buildTitle(); U.show('title');
    }, 'back'));
    card.appendChild(menu);
    s.appendChild(card);
    U.show('pause');
  };
  U.closePause = function () { U.show('game'); };

  /* ---------------- results ---------------- */

  U.matchOver = function (won, score, stars, stats, level) {
    var s = $('scr-results');
    clear(s);
    var card = el('div', 'card');
    card.appendChild(el('div', 'verdict ' + (won ? 'win' : 'lose'), won ? 'VICTORY' : 'DEFEAT'));
    card.appendChild(el('div', 'bigscore', score[0] + ' – ' + score[1]));
    card.appendChild(el('div', 'sub', level.name));

    if (!level.freePlay && !level.exhibition) {
      var sr = starRow(stars);
      sr.classList.add('big');
      card.appendChild(sr);
      if (stars > 0) {
        for (var i = 0; i < stars; i++) {
          (function (k) { setTimeout(function () { RL.Audio.sfxStar(k); }, 380 + k * 240); })(i);
        }
      }
      if (won && level.id === RL.LEVELS.length) {
        card.appendChild(el('div', 'champ', '\u{1F3C6} SEASON CHAMPION \u{1F3C6}'));
      } else if (won && level.id < RL.LEVELS.length) {
        card.appendChild(el('div', 'unlock', 'UNLOCKED: ' + RL.LEVELS[level.id].name));
      }
    }

    var g = el('div', 'statgrid');
    [['Goals', stats.goals], ['Saves', stats.saves], ['Demos', stats.demos],
    ['Top speed', Math.round(stats.topSpeed * 3.1) + ' kph']].forEach(function (p) {
      var c = el('div', 'stat');
      c.appendChild(el('span', 'sv', String(p[1])));
      c.appendChild(el('span', 'sk', p[0]));
      g.appendChild(c);
    });
    card.appendChild(g);

    var menu = el('div', 'menu');
    var next = RL.LEVELS[level.id];   // level.id is 1-based, so this is the next one
    if (won && next && !level.freePlay && !level.exhibition && next.id <= RL.save.unlocked) {
      menu.appendChild(click(el('button', 'btn primary', 'NEXT: ' + next.name.toUpperCase()), function () {
        RL.Game.start(next); U.show('game');
      }, 'big'));
    }
    menu.appendChild(click(el('button', 'btn' + (won ? '' : ' primary'), 'PLAY AGAIN'), function () {
      RL.Game.start(level); U.show('game');
    }, 'big'));
    menu.appendChild(click(el('button', 'btn ghost', 'MENU'), function () {
      RL.Game.quit(); buildTitle(); U.show('title');
    }, 'back'));
    card.appendChild(menu);
    s.appendChild(card);
    U.show('results');
    U.showHUD(false);
  };

  /* ---------------- HUD ---------------- */

  var bigTimer = 0, toastTimer = 0, flashTimer = 0, bannerTimer = 0;

  U.bigText = function (txt, dur) {
    var n = $('bigtext');
    n.textContent = txt;
    n.classList.remove('pop');
    void n.offsetWidth;          // restart the CSS animation
    n.classList.add('pop');
    bigTimer = dur || 0.8;
  };

  U.toast = function (txt) {
    var n = $('toast');
    n.textContent = txt;
    n.classList.remove('pop');
    void n.offsetWidth;
    n.classList.add('pop');
    toastTimer = 1.5;
  };

  U.flash = function (color) {
    var n = $('flash');
    n.style.background = hex(color);
    n.style.opacity = '0.55';
    flashTimer = 0.5;
  };

  U.goalBanner = function (teamName, color, scorer, byPlayer) {
    var n = $('banner');
    clear(n);
    var t = el('div', 'bteam', teamName + ' SCORES');
    t.style.color = hex(color);
    n.appendChild(t);
    if (scorer) n.appendChild(el('div', 'bwho', byPlayer ? 'YOU!' : scorer));
    n.classList.add('on');
    bannerTimer = 3.0;
  };

  U.tickHUD = function (dt) {
    var G = RL.Game;

    if (bigTimer > 0) { bigTimer -= dt; if (bigTimer <= 0) $('bigtext').textContent = ''; }
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').textContent = ''; }
    if (flashTimer > 0) {
      flashTimer -= dt;
      $('flash').style.opacity = String(Math.max(0, flashTimer / 0.5) * 0.55);
    }
    if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) $('banner').classList.remove('on'); }

    if (!U.hudOn || !G.player) return;

    $('sc0').textContent = G.score[0];
    $('sc1').textContent = G.score[1];

    var t = Math.max(0, G.clock);
    var mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    var clockEl = $('clock');
    if (G.overtime) { clockEl.textContent = '+OT'; clockEl.classList.add('ot'); }
    else if (G.level && G.level.time === 0) { clockEl.textContent = '∞'; clockEl.classList.remove('ot'); }
    else {
      clockEl.textContent = mm + ':' + (ss < 10 ? '0' : '') + ss;
      clockEl.classList.toggle('ot', t < 30);
    }

    var b = Math.round(G.player.boost);
    $('boostNum').textContent = b;
    $('boostFill').style.width = b + '%';
    $('boostRing').classList.toggle('full', b >= 99);

    var kph = Math.round(G.player.speed * 3.1);
    $('speed').textContent = kph;
    $('speedo').classList.toggle('sonic', G.player.supersonic);

    var ind = $('ballcam');
    ind.classList.toggle('on', RL.save.ballCam);
  };

  /* ---------------- boot ---------------- */

  U.init = function () {
    buildTitle();
    U.show('title');

    // any first tap unlocks the audio context
    var unlock = function () {
      RL.Audio.unlock();
      RL.Audio.playMusic('menu');
      global.removeEventListener('pointerdown', unlock);
      global.removeEventListener('keydown', unlock);
    };
    global.addEventListener('pointerdown', unlock);
    global.addEventListener('keydown', unlock);

    // Esc / P from a submenu goes back sensibly
    global.addEventListener('keydown', function (e) {
      if (e.code !== 'Escape') return;
      if (RL.Input.capture) return;
      var s = U.screen;
      if (s === 'season' || s === 'exhibition' || s === 'garage' || s === 'howto') {
        buildTitle(); U.show('title');
      } else if (s === 'settings' || s === 'controls') {
        var from = $('scr-' + s).dataset.from;
        $('scr-' + s).dataset.from = '';
        if (from === 'pause') U.openPause();
        else { buildTitle(); U.show('title'); }
      }
    });

    $('btnPause').addEventListener('click', function () { RL.Game.pause(); });
    $('btnCam').addEventListener('click', function () {
      RL.save.ballCam = !RL.save.ballCam; RL.persist(); RL.Audio.sfxUI();
    });
  };

  U.buildTitle = buildTitle;

})(window);
