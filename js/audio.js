/* ============================================================
   audio.js — everything you hear is synthesised at runtime.
   No sound files, so the whole game still works with zero network.
   ============================================================ */
(function (global) {
  'use strict';
  var RL = global.RL;

  var A = RL.Audio = {
    ctx: null, master: null, sfx: null, music: null,
    ready: false, muted: false,
    _noise: null, _engine: null, _boost: null, _seq: null, _track: null
  };

  function now() { return A.ctx ? A.ctx.currentTime : 0; }

  A.init = function () {
    if (A.ctx) return;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    try { A.ctx = new AC(); } catch (e) { return; }

    A.master = A.ctx.createGain();
    A.master.gain.value = 1;
    A.master.connect(A.ctx.destination);

    // a touch of hall on everything — cheap convolver with a synthetic tail
    var conv = A.ctx.createConvolver();
    var len = Math.floor(A.ctx.sampleRate * 1.1);
    var imp = A.ctx.createBuffer(2, len, A.ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = imp.getChannelData(c);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    conv.buffer = imp;
    var wet = A.ctx.createGain(); wet.gain.value = 0.16;
    conv.connect(wet); wet.connect(A.master);
    A.verb = conv;

    A.sfx = A.ctx.createGain();
    A.sfx.gain.value = RL.save.sfxVol;
    A.sfx.connect(A.master); A.sfx.connect(conv);

    A.music = A.ctx.createGain();
    A.music.gain.value = RL.save.musicVol;
    A.music.connect(A.master);

    // shared white-noise buffer
    var n = A.ctx.createBuffer(1, A.ctx.sampleRate * 2, A.ctx.sampleRate);
    var nd = n.getChannelData(0);
    for (var j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;
    A._noise = n;

    A.ready = true;
  };

  /* browsers need a user gesture before audio will start */
  A.unlock = function () {
    A.init();
    if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
  };

  A.setVolumes = function () {
    if (!A.ready) return;
    A.sfx.gain.value = A.muted ? 0 : RL.save.sfxVol;
    A.music.gain.value = A.muted ? 0 : RL.save.musicVol;
  };

  function noiseSrc() {
    var s = A.ctx.createBufferSource();
    s.buffer = A._noise;
    s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    return s;
  }

  /* ---------------- one-shots ---------------- */

  function tone(o) {
    if (!A.ready || A.muted) return;
    var t = now() + (o.delay || 0);
    var osc = A.ctx.createOscillator();
    var g = A.ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 !== undefined) {
      if (o.exp === false) osc.frequency.linearRampToValueAtTime(o.f1, t + o.dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    }
    var v = (o.vol === undefined ? 0.3 : o.vol);
    var atk = o.atk === undefined ? 0.005 : o.atk;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    var dest = A.sfx;
    if (o.filter) {
      var f = A.ctx.createBiquadFilter();
      f.type = o.filter; f.frequency.value = o.ff || 1200; f.Q.value = o.q || 1;
      osc.connect(f); f.connect(g);
    } else osc.connect(g);
    g.connect(dest);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }

  function noise(o) {
    if (!A.ready || A.muted) return;
    var t = now() + (o.delay || 0);
    var s = noiseSrc();
    var f = A.ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    f.Q.value = o.q || 1.2;
    var g = A.ctx.createGain();
    var v = o.vol === undefined ? 0.3 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + (o.atk === undefined ? 0.004 : o.atk));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f); f.connect(g); g.connect(A.sfx);
    s.start(t); s.stop(t + o.dur + 0.05);
  }
  A.tone = tone; A.noise = noise;

  A.sfxBall = function (impact) {
    var p = RL.M.clamp(impact / 34, 0.10, 1);
    tone({ type: 'sine', f0: 190 - 60 * p, f1: 52, dur: 0.22 + 0.16 * p, vol: 0.20 + 0.42 * p, atk: 0.002 });
    tone({ type: 'triangle', f0: 430 - 120 * p, f1: 130, dur: 0.10, vol: 0.10 + 0.18 * p });
    noise({ f0: 1500 + 2600 * p, f1: 260, dur: 0.11 + 0.1 * p, vol: 0.10 + 0.26 * p, q: 0.9 });
  };

  A.sfxWall = function (impact) {
    var p = RL.M.clamp(impact / 40, 0.06, 1);
    tone({ type: 'sine', f0: 120, f1: 44, dur: 0.24, vol: 0.10 + 0.3 * p });
    noise({ f0: 900 + 1800 * p, f1: 180, dur: 0.16, vol: 0.06 + 0.2 * p, q: 0.7 });
  };

  A.sfxJump = function () {
    noise({ f0: 500, f1: 2400, dur: 0.13, vol: 0.16, q: 1.6 });
    tone({ type: 'triangle', f0: 300, f1: 700, dur: 0.11, vol: 0.10 });
  };

  A.sfxFlip = function () {
    noise({ f0: 2600, f1: 420, dur: 0.30, vol: 0.24, q: 1.1 });
    tone({ type: 'sawtooth', f0: 220, f1: 90, dur: 0.24, vol: 0.09, filter: 'lowpass', ff: 900 });
  };

  A.sfxLand = function (impact) {
    var p = RL.M.clamp(impact / 26, 0.05, 1);
    noise({ f0: 320, f1: 90, dur: 0.14, vol: 0.09 + 0.2 * p, q: 0.6, type: 'lowpass' });
  };

  A.sfxPad = function (big) {
    var f = big ? 420 : 620;
    tone({ type: 'square', f0: f, f1: f * 2.4, dur: big ? 0.30 : 0.15, vol: big ? 0.20 : 0.13, filter: 'lowpass', ff: 3600 });
    tone({ type: 'sine', f0: f * 2, f1: f * 4, dur: big ? 0.34 : 0.16, vol: big ? 0.14 : 0.08, delay: 0.03 });
  };

  A.sfxDemo = function () {
    noise({ f0: 2400, f1: 120, dur: 0.5, vol: 0.42, q: 0.5 });
    tone({ type: 'sawtooth', f0: 150, f1: 30, dur: 0.45, vol: 0.3, filter: 'lowpass', ff: 700 });
    for (var i = 0; i < 5; i++) {
      noise({ f0: 700 + Math.random() * 2400, f1: 200, dur: 0.16, vol: 0.13, delay: 0.03 + i * 0.045 });
    }
  };

  A.sfxGoal = function (mine) {
    // horn
    var base = mine ? 138 : 104;
    for (var i = 0; i < 3; i++) {
      tone({ type: 'sawtooth', f0: base * (i + 1), f1: base * (i + 1), dur: 1.15, vol: 0.13 / (i * 0.7 + 1), atk: 0.05, filter: 'lowpass', ff: 2200, exp: false });
    }
    noise({ f0: 90, f1: 40, dur: 0.9, vol: 0.4, q: 0.4, type: 'lowpass' });
    A.crowd(1.0, 2.6);
  };

  A.sfxSave = function () {
    tone({ type: 'square', f0: 520, f1: 880, dur: 0.16, vol: 0.16, filter: 'lowpass', ff: 3000 });
    tone({ type: 'square', f0: 880, f1: 1320, dur: 0.20, vol: 0.13, delay: 0.10, filter: 'lowpass', ff: 3800 });
    A.crowd(0.5, 1.1);
  };

  A.crowd = function (level, dur) {
    if (!A.ready || A.muted) return;
    var t = now();
    var s = noiseSrc();
    var f = A.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.55;
    var g = A.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.14 * level, t + 0.18);
    g.gain.setValueAtTime(0.14 * level, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // wobble so it sounds like people, not static
    var lfo = A.ctx.createOscillator(), lg = A.ctx.createGain();
    lfo.frequency.value = 5.5; lg.gain.value = 220;
    lfo.connect(lg); lg.connect(f.frequency); lfo.start(t); lfo.stop(t + dur + 0.1);
    s.connect(f); f.connect(g); g.connect(A.sfx); g.connect(A.verb);
    s.start(t); s.stop(t + dur + 0.1);
  };

  A.sfxCount = function (n) {
    if (n > 0) tone({ type: 'square', f0: 520, dur: 0.16, vol: 0.22, filter: 'lowpass', ff: 2400 });
    else {
      tone({ type: 'square', f0: 780, f1: 1040, dur: 0.42, vol: 0.26, filter: 'lowpass', ff: 4000 });
      A.crowd(0.7, 1.4);
    }
  };

  A.sfxWhistle = function () {
    tone({ type: 'sine', f0: 2100, f1: 2350, dur: 0.5, vol: 0.13 });
    noise({ f0: 2400, f1: 2600, dur: 0.5, vol: 0.09, q: 14 });
  };

  A.sfxUI = function (kind) {
    if (kind === 'back') tone({ type: 'square', f0: 420, f1: 260, dur: 0.09, vol: 0.11, filter: 'lowpass', ff: 2600 });
    else if (kind === 'big') {
      tone({ type: 'square', f0: 400, f1: 800, dur: 0.13, vol: 0.15, filter: 'lowpass', ff: 3200 });
      tone({ type: 'square', f0: 600, f1: 1200, dur: 0.16, vol: 0.10, delay: 0.06, filter: 'lowpass', ff: 3600 });
    } else tone({ type: 'square', f0: 660, f1: 880, dur: 0.07, vol: 0.10, filter: 'lowpass', ff: 3000 });
  };

  A.sfxWin = function () {
    var notes = [523, 659, 784, 1047, 1319];
    notes.forEach(function (f, i) {
      tone({ type: 'square', f0: f, dur: 0.34, vol: 0.15, delay: i * 0.11, filter: 'lowpass', ff: 4200 });
      tone({ type: 'triangle', f0: f * 2, dur: 0.24, vol: 0.07, delay: i * 0.11 });
    });
    A.crowd(1.0, 3.0);
  };

  A.sfxLose = function () {
    [440, 392, 330, 262].forEach(function (f, i) {
      tone({ type: 'sawtooth', f0: f, dur: 0.4, vol: 0.11, delay: i * 0.16, filter: 'lowpass', ff: 1400 });
    });
  };

  A.sfxStar = function (i) {
    tone({ type: 'square', f0: 660 * Math.pow(1.26, i), dur: 0.26, vol: 0.16, filter: 'lowpass', ff: 5000 });
  };

  /* ---------------- continuous engine + boost ---------------- */

  A.startEngine = function () {
    if (!A.ready || A._engine) return;
    var t = now();
    var o1 = A.ctx.createOscillator(), o2 = A.ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square';
    o1.frequency.value = 60; o2.frequency.value = 30;
    var f = A.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 3.2;
    var g = A.ctx.createGain(); g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(A.sfx);
    o1.start(t); o2.start(t);
    A._engine = { o1: o1, o2: o2, f: f, g: g };

    var ns = noiseSrc();
    var bf = A.ctx.createBiquadFilter();
    bf.type = 'bandpass'; bf.frequency.value = 1100; bf.Q.value = 0.7;
    var bg = A.ctx.createGain(); bg.gain.value = 0;
    ns.connect(bf); bf.connect(bg); bg.connect(A.sfx); bg.connect(A.verb);
    ns.start(t);
    A._boost = { s: ns, f: bf, g: bg };
  };

  A.stopEngine = function () {
    if (A._engine) {
      try { A._engine.o1.stop(); A._engine.o2.stop(); } catch (e) { }
      A._engine = null;
    }
    if (A._boost) { try { A._boost.s.stop(); } catch (e) { } A._boost = null; }
  };

  /* speed 0..1, throttle 0..1, boosting bool, air bool */
  A.engine = function (speed, throttle, boosting, air) {
    if (!A._engine || A.muted) return;
    var t = now(), e = A._engine;
    var rpm = 46 + speed * 150 + throttle * 26;
    e.o1.frequency.setTargetAtTime(rpm, t, 0.06);
    e.o2.frequency.setTargetAtTime(rpm * 0.5, t, 0.06);
    e.f.frequency.setTargetAtTime(420 + speed * 1500 + throttle * 380, t, 0.07);
    var vol = (air ? 0.035 : 0.075) + speed * 0.075 + throttle * 0.03;
    e.g.gain.setTargetAtTime(vol, t, 0.08);
    var b = A._boost;
    b.g.gain.setTargetAtTime(boosting ? 0.15 : 0, t, boosting ? 0.02 : 0.09);
    b.f.frequency.setTargetAtTime(boosting ? 1500 + speed * 1400 : 900, t, 0.05);
  };

  /* ---------------- music: a small step sequencer ---------------- */

  var SCALE = [0, 3, 5, 7, 10];            // minor pentatonic
  var TRACKS = {
    menu: { bpm: 104, root: 55.0, drive: 0.5, arp: [0, 2, 4, 2, 3, 1, 4, 2] },
    match: { bpm: 138, root: 61.7, drive: 0.9, arp: [0, 4, 2, 4, 1, 4, 3, 4] },
    tense: { bpm: 156, root: 58.3, drive: 1.0, arp: [0, 1, 2, 3, 4, 3, 2, 1] }
  };

  function midiHz(root, semi) { return root * Math.pow(2, semi / 12); }

  A.playMusic = function (name) {
    if (!A.ready) return;
    if (A._track === name) return;
    A.stopMusic();
    A._track = name;
    var T = TRACKS[name] || TRACKS.match;
    var step = 0;
    var spb = 60 / T.bpm / 2;   // eighth notes
    var nextTime = now() + 0.08;

    function schedule() {
      if (A._track !== name) return;
      var t = now();
      while (nextTime < t + 0.25) {
        emit(step, nextTime, T);
        nextTime += spb;
        step++;
      }
    }
    A._seq = setInterval(schedule, 60);
    schedule();
  };

  function emit(step, t, T) {
    if (A.muted || !A.ready) return;
    var bar = Math.floor(step / 8) % 4;
    var s = step % 8;
    var prog = [0, 0, 5, 3][bar];

    // bass
    if (s % 2 === 0) {
      var bo = A.ctx.createOscillator(), bg = A.ctx.createGain(), bf = A.ctx.createBiquadFilter();
      bo.type = 'sawtooth';
      bo.frequency.value = midiHz(T.root, prog);
      bf.type = 'lowpass'; bf.frequency.value = 280 + T.drive * 300; bf.Q.value = 5;
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.linearRampToValueAtTime(0.16, t + 0.01);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
      bo.connect(bf); bf.connect(bg); bg.connect(A.music);
      bo.start(t); bo.stop(t + 0.3);
    }
    // arp
    var deg = T.arp[s];
    var ao = A.ctx.createOscillator(), ag = A.ctx.createGain();
    ao.type = 'square';
    ao.frequency.value = midiHz(T.root * 4, prog + SCALE[deg]);
    ag.gain.setValueAtTime(0.0001, t);
    ag.gain.linearRampToValueAtTime(0.045 * T.drive, t + 0.006);
    ag.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    var af = A.ctx.createBiquadFilter();
    af.type = 'lowpass'; af.frequency.value = 2600; af.Q.value = 2;
    ao.connect(af); af.connect(ag); ag.connect(A.music);
    ao.start(t); ao.stop(t + 0.2);

    // drums
    if (s === 0 || s === 4 || (s === 3 && T.drive > 0.8)) {
      var ko = A.ctx.createOscillator(), kg = A.ctx.createGain();
      ko.type = 'sine';
      ko.frequency.setValueAtTime(150, t);
      ko.frequency.exponentialRampToValueAtTime(38, t + 0.11);
      kg.gain.setValueAtTime(0.35, t);
      kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      ko.connect(kg); kg.connect(A.music);
      ko.start(t); ko.stop(t + 0.2);
    }
    if (s === 2 || s === 6) {
      var sn = noiseSrc(), sf = A.ctx.createBiquadFilter(), sg = A.ctx.createGain();
      sf.type = 'highpass'; sf.frequency.value = 1400;
      sg.gain.setValueAtTime(0.13 * T.drive, t);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      sn.connect(sf); sf.connect(sg); sg.connect(A.music);
      sn.start(t); sn.stop(t + 0.15);
    }
    if (T.drive > 0.6) {   // hats
      var hn = noiseSrc(), hf = A.ctx.createBiquadFilter(), hg = A.ctx.createGain();
      hf.type = 'highpass'; hf.frequency.value = 7000;
      hg.gain.setValueAtTime(s % 2 ? 0.03 : 0.055, t);
      hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      hn.connect(hf); hf.connect(hg); hg.connect(A.music);
      hn.start(t); hn.stop(t + 0.06);
    }
  }

  A.stopMusic = function () {
    A._track = null;
    if (A._seq) { clearInterval(A._seq); A._seq = null; }
  };

})(window);
