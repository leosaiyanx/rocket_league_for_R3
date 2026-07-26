/* ============================================================
   main.js — boot.
   ============================================================ */
(function (global) {
  'use strict';
  var RL = global.RL;

  function boot() {
    if (!global.THREE) {
      document.body.innerHTML =
        '<div style="color:#fff;font:16px system-ui;padding:40px">' +
        'Could not load the 3D engine. Try refreshing the page.</div>';
      return;
    }

    var canvas = document.getElementById('gl');

    // WebGL missing (very old device, or blocked) — say so instead of hanging
    try {
      RL.Game.init(canvas);
    } catch (e) {
      console.error(e);
      document.getElementById('overlay').innerHTML =
        '<div class="screen on"><div class="card"><h2>No 3D support</h2>' +
        '<p style="opacity:.8;line-height:1.6">This device or browser can\'t run WebGL. ' +
        'Try Chrome or Safari, or turn on hardware acceleration in your browser settings.</p></div></div>';
      return;
    }

    RL.Input.init();
    RL.UI.init();

    if (RL.save.touchLayout === 'right') {
      document.getElementById('touch').classList.add('mirrored');
    }

    // stop iOS double-tap zoom and long-press menus over the play area
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('contextmenu', function (e) {
      if (e.target.closest('#touch') || e.target.id === 'gl') e.preventDefault();
    });

    // pause automatically if the tab or app goes away mid-match
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && RL.Game.state !== 'menu' && RL.Game.state !== 'paused' &&
        RL.Game.running) {
        RL.Game.pause();
      }
    });

    // portrait nag on phones only
    function checkRotate() {
      var need = RL.isMobile && global.innerHeight > global.innerWidth * 1.15;
      document.getElementById('rotate').classList.toggle('on', need);
    }
    global.addEventListener('resize', checkRotate);
    global.addEventListener('orientationchange', function () { setTimeout(checkRotate, 200); });
    checkRotate();

    /* Deep links, also handy for attract-mode screenshots:
         ?level=3        jump straight into season level 3
         ?arena=neon     free play in a named arena
         ?demo=1         hand the player's car to a bot and just watch     */
    var q = new URLSearchParams(location.search);
    if (q.has('level') || q.has('arena') || q.has('demo')) {
      var lvl;
      if (q.has('level')) {
        lvl = RL.LEVELS[Math.max(1, Math.min(RL.LEVELS.length, parseInt(q.get('level'), 10) || 1)) - 1];
      } else {
        lvl = RL.exhibition({ theme: q.get('arena') || 'neon', teamSize: 2, time: 0 });
      }
      RL.Game.start(lvl);
      RL.UI.show('game');
      if (q.get('demo') === '1' && RL.Game.player) {
        RL.Game.bots.push(new RL.Bot(RL.Game, RL.Game.player, 'allstar', 7));
        RL.Game.player.isSpectated = true;
      }
    }

    // service worker: only over https, so a local dev server never fights the cache
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      global.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else boot();

})(window);
