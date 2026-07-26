/* ============================================================
   levels.js — the season ladder.
   `aiBump` shifts the opponents up the skill table on top of whatever
   difficulty the player picked, so level 7 on Rookie is still a fight.
   ============================================================ */
(function (global) {
  'use strict';
  var RL = global.RL;

  RL.LEVELS = [
    {
      id: 1, name: 'Rookie Dome', theme: 'dome', teamSize: 1, aiBump: 0,
      time: 180, gravity: 1.0, grip: 1.0, startBoost: 34,
      tag: '1 v 1',
      blurb: 'Bright, friendly and forgiving. Learn to drive, boost and score.'
    },
    {
      id: 2, name: 'Neon Nights', theme: 'neon', teamSize: 1, aiBump: 0,
      time: 180, gravity: 1.0, grip: 1.0, startBoost: 34,
      tag: '1 v 1',
      blurb: 'Same rules, sharper opponent. Time to learn the flip.'
    },
    {
      id: 3, name: 'Sunset Speedway', theme: 'sunset', teamSize: 2, aiBump: 0,
      time: 210, gravity: 1.0, grip: 1.0, startBoost: 34,
      tag: '2 v 2',
      blurb: 'You get a team-mate — and so do they. Watch the rotation.'
    },
    {
      id: 4, name: 'Frostbite Rink', theme: 'frost', teamSize: 2, aiBump: 1,
      time: 210, gravity: 1.0, grip: 0.42, startBoost: 45,
      tag: '2 v 2 · ICE',
      blurb: 'Almost no grip. Brake early, steer gently, let the slide work for you.'
    },
    {
      id: 5, name: 'Volcano Pit', theme: 'volcano', teamSize: 3, aiBump: 1,
      time: 240, gravity: 1.12, grip: 1.05, startBoost: 34,
      tag: '3 v 3',
      blurb: 'Heavy gravity and a crowded pitch. Everything hits the deck faster.'
    },
    {
      id: 6, name: 'Zero-G Station', theme: 'space', teamSize: 3, aiBump: 1,
      time: 240, gravity: 0.42, grip: 0.85, startBoost: 60,
      tag: '3 v 3 · LOW-G',
      blurb: 'Float. Everything hangs in the air, so aerials win this one.'
    },
    {
      id: 7, name: "Champion's Colosseum", theme: 'colosseum', teamSize: 3, aiBump: 2,
      time: 300, gravity: 1.0, grip: 1.0, startBoost: 34,
      tag: '3 v 3 · FINAL',
      blurb: 'The title match. They aerial, they demo, they defend. Beat them.'
    }
  ];

  /* Free play / exhibition uses the same shape but nothing is fixed. */
  RL.exhibition = function (opts) {
    var th = opts.theme || 'neon';
    return {
      id: 0, name: RL.THEMES[th].name, theme: th,
      teamSize: opts.teamSize || 1, aiBump: 0,
      time: opts.time === undefined ? 300 : opts.time,
      gravity: opts.gravity || 1.0, grip: opts.grip || 1.0,
      startBoost: 34, tag: 'EXHIBITION', blurb: '', exhibition: true
    };
  };

  RL.freePlay = function (theme) {
    return {
      id: -1, name: RL.THEMES[theme || 'dome'].name + ' — Free Play',
      theme: theme || 'dome', teamSize: 0, aiBump: 0,
      time: 0, gravity: 1.0, grip: 1.0, startBoost: 100,
      tag: 'FREE PLAY', blurb: '', freePlay: true
    };
  };

  /* stars: 1 for the win, 2 if you kept them to two, 3 for a 3-goal margin */
  RL.starsFor = function (myScore, theirScore) {
    if (myScore <= theirScore) return 0;
    if (myScore - theirScore >= 3) return 3;
    if (theirScore <= 2) return 2;
    return 1;
  };

  RL.totalStars = function () {
    var t = 0, s = RL.save.stars;
    for (var k in s) t += s[k] || 0;
    return t;
  };

  /* effective bot skill for a level, given the player's difficulty choice */
  RL.skillFor = function (level) {
    var order = RL.SKILL_ORDER;
    var base = order.indexOf(RL.save.difficulty);
    if (base < 0) base = 1;
    var i = Math.max(0, Math.min(order.length - 1, base + (level.aiBump || 0)));
    return order[i];
  };

})(window);
