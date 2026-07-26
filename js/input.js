/* ============================================================
   input.js — keyboard, gamepad and touch all funnel into one
   normalised control struct.  Every keyboard action is rebindable.
   ============================================================ */
(function (global) {
  'use strict';
  var RL = global.RL, M = RL.M;

  var I = RL.Input = {
    down: {},              // physical code -> true
    edges: {},             // action -> pending press
    pad: null,
    padIndex: -1,
    hasPad: false,
    capture: null,         // {action, cb} while rebinding
    touch: { active: false, stick: null, buttons: {} },
    autoThrottle: false,
    lastSource: 'keyboard'
  };

  function actionsFor(code) {
    var keys = RL.save.keys, hits = [];
    for (var a in keys) {
      var list = keys[a];
      for (var i = 0; i < list.length; i++) if (list[i] === code) { hits.push(a); break; }
    }
    return hits;
  }

  I.isDown = function (action) {
    var list = RL.save.keys[action];
    if (!list) return false;
    for (var i = 0; i < list.length; i++) if (I.down[list[i]]) return true;
    return false;
  };

  /* ---------------- keyboard ---------------- */

  function onKeyDown(e) {
    if (I.capture) {
      e.preventDefault();
      var cb = I.capture.cb, act = I.capture.action;
      I.capture = null;
      if (e.code !== 'Escape') {
        // free this key from anything else it was bound to
        var keys = RL.save.keys;
        for (var a in keys) keys[a] = keys[a].filter(function (k) { return k !== e.code; });
        keys[act] = [e.code].concat((keys[act] || []).slice(0, 1));
        RL.persist();
      }
      if (cb) cb(e.code === 'Escape' ? null : e.code);
      return;
    }
    if (e.repeat) return;
    var acts = actionsFor(e.code);
    if (acts.length) {
      I.lastSource = 'keyboard';
      for (var i = 0; i < acts.length; i++) I.edges[acts[i]] = true;
      // don't let space/arrows scroll the page
      if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
    }
    I.down[e.code] = true;
  }
  function onKeyUp(e) { I.down[e.code] = false; }
  function onBlur() { I.down = {}; }

  /* ---------------- gamepad ---------------- */

  function pollPad() {
    if (!global.navigator || !global.navigator.getGamepads) return null;
    var pads = global.navigator.getGamepads();
    for (var i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) { I.padIndex = i; return pads[i]; }
    }
    I.padIndex = -1;
    return null;
  }

  var padPrev = {};
  function padButton(p, idx) { return p.buttons[idx] && (p.buttons[idx].pressed || p.buttons[idx].value > 0.35); }
  function padEdge(p, idx, name) {
    var v = padButton(p, idx);
    var was = padPrev[name];
    padPrev[name] = v;
    return v && !was;
  }

  /* ---------------- touch ---------------- */

  function initTouch(root) {
    var stickEl = document.getElementById('tStick');
    var knobEl = document.getElementById('tKnob');
    if (!stickEl) return;

    var st = I.touch;
    st.stick = { id: null, cx: 0, cy: 0, x: 0, y: 0, el: stickEl, knob: knobEl };

    var R = 62;   // stick radius in px

    function place(t) {
      var s = st.stick;
      var dx = t.clientX - s.cx, dy = t.clientY - s.cy;
      var len = Math.hypot(dx, dy);
      if (len > R) { dx *= R / len; dy *= R / len; }
      s.x = dx / R; s.y = dy / R;
      if (s.knob) s.knob.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
    }

    stickEl.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var t = e.changedTouches[0];
      var r = stickEl.getBoundingClientRect();
      st.stick.id = t.identifier;
      st.stick.cx = r.left + r.width / 2;
      st.stick.cy = r.top + r.height / 2;
      I.lastSource = 'touch';
      place(t);
    }, { passive: false });

    document.addEventListener('touchmove', function (e) {
      var s = st.stick;
      if (s.id === null) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === s.id) { e.preventDefault(); place(e.changedTouches[i]); }
      }
    }, { passive: false });

    function endTouch(e) {
      var s = st.stick;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === s.id) {
          s.id = null; s.x = 0; s.y = 0;
          if (s.knob) s.knob.style.transform = 'translate(0px,0px)';
        }
      }
    }
    document.addEventListener('touchend', endTouch);
    document.addEventListener('touchcancel', endTouch);

    // action buttons
    ['tBoost', 'tJump', 'tBrake', 'tDrift', 'tRoll'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var key = id.slice(1).toLowerCase();
      st.buttons[key] = false;
      function on(e) {
        e.preventDefault();
        st.buttons[key] = true;
        el.classList.add('held');
        I.lastSource = 'touch';
        if (key === 'jump') I.edges.jump = true;
      }
      function off(e) { e.preventDefault(); st.buttons[key] = false; el.classList.remove('held'); }
      el.addEventListener('touchstart', on, { passive: false });
      el.addEventListener('touchend', off, { passive: false });
      el.addEventListener('touchcancel', off, { passive: false });
      // mouse fallback so the layout can be checked on a desktop
      el.addEventListener('mousedown', on);
      el.addEventListener('mouseup', off);
      el.addEventListener('mouseleave', off);
    });
  }

  /* ---------------- public API ---------------- */

  I.init = function () {
    global.addEventListener('keydown', onKeyDown);
    global.addEventListener('keyup', onKeyUp);
    global.addEventListener('blur', onBlur);
    global.addEventListener('gamepadconnected', function (e) {
      I.hasPad = true; I.padIndex = e.gamepad.index; I.lastSource = 'gamepad';
    });
    global.addEventListener('gamepaddisconnected', function () { I.hasPad = false; });
    initTouch();
    I.autoThrottle = RL.isTouch;
  };

  /* Fill `out` with this frame's controls. */
  I.poll = function (out) {
    var dz = RL.save.deadzone, sens = RL.save.steerSens;
    var th = 0, st = 0, jump = false, boost = false, drift = false, roll = 0, airRoll = false;

    /* keyboard */
    if (I.isDown('throttle')) th += 1;
    if (I.isDown('reverse')) th -= 1;
    if (I.isDown('left')) st -= 1;
    if (I.isDown('right')) st += 1;
    if (I.isDown('jump')) jump = true;
    if (I.isDown('boost')) boost = true;
    if (I.isDown('drift')) drift = true;
    if (I.isDown('airRoll')) airRoll = true;

    /* gamepad */
    var p = pollPad();
    if (p) {
      I.hasPad = true;
      var ax = p.axes.length > 0 ? M.dead(p.axes[0], dz) : 0;
      var ay = p.axes.length > 1 ? M.dead(p.axes[1], dz) : 0;
      var rx = p.axes.length > 2 ? M.dead(p.axes[2], dz) : 0;
      var trigR = p.buttons[7] ? p.buttons[7].value : 0;
      var trigL = p.buttons[6] ? p.buttons[6].value : 0;
      if (Math.abs(ax) > 0.01 || Math.abs(ay) > 0.01 || trigR > 0.05 || trigL > 0.05) {
        I.lastSource = 'gamepad';
      }
      st += ax;
      // triggers drive; if neither is touched fall back to the stick's Y
      var padTh = trigR - trigL;
      if (Math.abs(padTh) > 0.03) th += padTh; else th += -ay;
      // pitch always comes from the stick
      out.padPitch = ay;
      if (padButton(p, 0)) jump = true;                    // A
      if (padButton(p, 2) || padButton(p, 5)) boost = true; // X or RB
      if (padButton(p, 1) || padButton(p, 4)) { drift = true; airRoll = true; } // B or LB
      if (padEdge(p, 0, 'jump')) I.edges.jump = true;
      if (padEdge(p, 3, 'ballCam')) I.edges.ballCam = true;  // Y
      if (padEdge(p, 9, 'pause')) I.edges.pause = true;      // Start
      if (padEdge(p, 8, 'reset')) I.edges.reset = true;      // Back/Select
      roll += rx;
    } else out.padPitch = undefined;

    /* touch */
    var tt = I.touch;
    if (tt.stick && (tt.stick.id !== null || tt.buttons.boost || tt.buttons.jump || tt.buttons.brake)) {
      I.lastSource = 'touch';
    }
    if (tt.stick) {
      st += tt.stick.x;
      out.touchPitch = tt.stick.y;
    }
    if (tt.buttons.boost) boost = true;
    if (tt.buttons.jump) jump = true;
    if (tt.buttons.drift) drift = true;
    if (tt.buttons.roll) { airRoll = true; drift = true; }
    if (I.autoThrottle && I.lastSource === 'touch') {
      th += tt.buttons.brake ? -1 : 1;
    } else if (tt.buttons.brake) th -= 1;

    /* normalise */
    out.throttle = M.clamp(th, -1, 1);
    out.steer = M.clamp(st * sens, -1, 1);
    out.jump = jump;
    out.boost = boost;
    out.drift = drift;
    out.airRoll = airRoll;

    /* air axes: pitch follows the same stick as throttle, yaw follows steer */
    var pitch;
    if (out.padPitch !== undefined && Math.abs(out.padPitch) > 0.01) pitch = -out.padPitch;
    else if (out.touchPitch !== undefined && Math.abs(out.touchPitch) > 0.01) pitch = -out.touchPitch;
    else pitch = out.throttle;
    // invert lives here and nowhere else, so it can never reach the bots
    out.pitch = M.clamp(pitch, -1, 1) * (RL.save.invertPitch ? -1 : 1);
    out.yaw = out.steer;
    out.roll = M.clamp(roll, -1, 1);
    return out;
  };

  /* one-shot actions */
  I.pressed = function (action) {
    if (I.edges[action]) { I.edges[action] = false; return true; }
    return false;
  };
  I.clearEdges = function () { I.edges = {}; };

  /* rebinding */
  I.beginCapture = function (action, cb) { I.capture = { action: action, cb: cb }; };
  I.cancelCapture = function () { I.capture = null; };

  I.keyLabel = function (code) {
    if (!code) return '—';
    return code
      .replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ')
      .replace(/^Arrow/, '').replace('Left', 'L ').replace('Right', 'R ')
      .replace('Control', 'Ctrl').replace('Shift', 'Shift ').replace('Alt', 'Alt ')
      .replace('Escape', 'Esc').replace('Space', 'Space').trim();
  };

  I.bindLabel = function (action) {
    var list = RL.save.keys[action] || [];
    return list.map(I.keyLabel).join(' / ') || '—';
  };

})(window);
