/**
 * VEX Stadium Solo-Game runtime helpers.
 * Loads on top of vex-sdk.js. Provides:
 *   - VexGame.boot({ slug, lang })            initialise the game (calls VEX.init internally)
 *   - VexGame.endSession({ score, result })   submit final score to platform
 *   - VexGame.toast(msg, kind)                small toast banner
 *   - VexGame.popScore(parentEl, value, x, y) floating "+10" near a board cell
 *   - VexGame.confetti(durationMs)            celebratory confetti burst
 *   - VexGame.lockScroll() / unlockScroll()   prevent overscroll while playing
 */
(function (global) {
  'use strict';

  var lang = 'ar';
  var ready = false;
  var slug = null;
  var listeners = [];

  function on(event, fn) {
    listeners.push({ event: event, fn: fn });
  }
  function emit(event, payload) {
    listeners.forEach(function (l) {
      if (l.event === event) {
        try { l.fn(payload); } catch (e) { /* swallow */ }
      }
    });
  }

  function boot(opts) {
    opts = opts || {};
    slug = opts.slug || null;

    var inIframe = false;
    try { inIframe = window.parent && window.parent !== window; } catch (e) { inIframe = true; }

    function fallbackStandalone() {
      if (ready) return;
      ready = true;
      emit('ready', { standalone: true });
      if (typeof opts.onReady === 'function') opts.onReady({ standalone: true });
    }

    if (typeof VEX === 'undefined' || !inIframe) {
      fallbackStandalone();
      return;
    }

    VEX.init({
      onReady: function (player) {
        if (ready) return;
        ready = true;
        if (player && player.language) lang = player.language;
        emit('ready', player || {});
        if (typeof opts.onReady === 'function') opts.onReady(player || {});
      },
    });

    // If VEX.init bailed out (no trusted parent origin) or platform never replies,
    // fall back to standalone after a short timeout so the game still becomes playable.
    setTimeout(fallbackStandalone, 1500);
  }

  function endSession(payload) {
    payload = payload || {};
    var safe = {
      score: typeof payload.score === 'number' ? payload.score : 0,
      result: payload.result === 'win' ? 'win' : (payload.result === 'loss' ? 'loss' : 'draw'),
      winAmount: typeof payload.winAmount === 'number' ? payload.winAmount : 0,
      metadata: payload.metadata || {},
    };
    if (typeof VEX !== 'undefined' && typeof VEX.endSession === 'function') {
      try { VEX.endSession(safe); } catch (e) { /* ignore */ }
    }
    emit('sessionEnd', safe);
  }

  function reportScore(payload) {
    if (typeof VEX !== 'undefined' && typeof VEX.reportScore === 'function') {
      try { VEX.reportScore(payload); } catch (e) { /* ignore */ }
    }
  }

  // ─── Toast ────────────────────────────────────────────────────────────────
  var toastEl = null;
  var toastTimer = null;
  function toast(msg, kind) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'vex-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = String(msg || '');
    toastEl.className = 'vex-toast' + (kind ? ' ' + kind : '');
    requestAnimationFrame(function () { toastEl.classList.add('show'); });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 1800);
  }

  // ─── Score float ──────────────────────────────────────────────────────────
  function popScore(parent, value, x, y, kind) {
    if (!parent) parent = document.body;
    var el = document.createElement('div');
    el.className = 'vex-score-pop' + (kind ? ' ' + kind : '');
    el.textContent = (typeof value === 'string' ? value : (value > 0 ? '+' + value : String(value)));
    el.style.left = (x != null ? x : 50) + (typeof x === 'number' ? 'px' : '%');
    el.style.top = (y != null ? y : 30) + (typeof y === 'number' ? 'px' : '%');
    parent.appendChild(el);
    setTimeout(function () { el.remove(); }, 1100);
  }

  // ─── Confetti ─────────────────────────────────────────────────────────────
  function confetti(durationMs) {
    durationMs = durationMs || 1600;
    var canvas = document.createElement('canvas');
    canvas.className = 'vex-confetti-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var pieces = [];
    var colors = ['#1e88ff', '#ffb627', '#22c55e', '#ef4444', '#a855f7', '#22d3ee'];
    for (var i = 0; i < 90; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 3,
        size: 5 + Math.random() * 6,
        color: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.2,
      });
    }
    var t0 = performance.now();
    function frame(t) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.07;
        p.rot += p.vrot;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      if (t - t0 < durationMs) {
        requestAnimationFrame(frame);
      } else {
        // fade & cleanup
        canvas.style.transition = 'opacity 0.4s';
        canvas.style.opacity = '0';
        setTimeout(function () { canvas.remove(); }, 450);
      }
    }
    requestAnimationFrame(frame);
  }

  // ─── Scroll lock for touch games ──────────────────────────────────────────
  var scrollLocked = false;
  function preventDefault(e) { e.preventDefault(); }
  function lockScroll() {
    if (scrollLocked) return;
    scrollLocked = true;
    document.addEventListener('touchmove', preventDefault, { passive: false });
    document.body.style.overflow = 'hidden';
  }
  function unlockScroll() {
    if (!scrollLocked) return;
    scrollLocked = false;
    document.removeEventListener('touchmove', preventDefault);
    document.body.style.overflow = '';
  }

  // ─── i18n helper ──────────────────────────────────────────────────────────
  function t(strings) {
    if (!strings || typeof strings !== 'object') return '';
    return strings[lang] || strings.en || strings.ar || '';
  }

  // ─── Persistent best score (localStorage scoped per slug) ─────────────────
  function bestKey() { return 'vex:best:' + (slug || 'unknown'); }
  function getBest() {
    try { return parseInt(localStorage.getItem(bestKey()) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function setBest(score) {
    try {
      var prev = getBest();
      if (score > prev) localStorage.setItem(bestKey(), String(score));
    } catch (e) { /* ignore */ }
  }

  // Public API
  global.VexGame = {
    boot: boot,
    on: on,
    endSession: endSession,
    reportScore: reportScore,
    toast: toast,
    popScore: popScore,
    confetti: confetti,
    lockScroll: lockScroll,
    unlockScroll: unlockScroll,
    t: t,
    getBest: getBest,
    setBest: setBest,
    isReady: function () { return ready; },
    getLang: function () { return lang; },
    setLang: function (l) { lang = (l === 'en' ? 'en' : 'ar'); },
  };
})(typeof window !== 'undefined' ? window : this);
