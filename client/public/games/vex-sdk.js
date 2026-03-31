/**
 * VEX Game SDK v1.0
 * =================
 * Include this SDK in your game to communicate with the VEX platform.
 * The game runs inside an iframe and uses PostMessage to talk to VEX.
 *
 * Usage:
 *   <script src="https://vixo.click/games/vex-sdk.js"></script>
 *   <script>
 *     VEX.init({ onReady: function(player) { startGame(player); } });
 *     // When game ends:
 *     VEX.endSession({ score: 100, result: 'win' });
 *   </script>
 *
 * Integration Types Supported:
 *   - zip_upload:    Game uploaded as ZIP, served from /games/ext/{slug}/
 *   - external_url:  Game hosted externally, loaded in iframe
 *   - html_embed:    Raw HTML pasted in admin panel
 *   - cdn_assets:    Game files on CDN
 *   - api_bridge:    Server-to-server API + client SDK
 *   - git_repo:      Game pulled from Git repository
 *   - pwa_app:       Standalone PWA loaded in iframe
 */
(function(global) {
  'use strict';

  var VEX = {};
  var _config = {};
  var _player = null;
  var _sessionToken = null;
  var _ready = false;
  var _callbacks = {};
  var _callbackId = 0;
  var _parentOrigin = '*';
  var _eventListeners = {};

  // ============ INTERNAL: PostMessage Communication ============

  function sendMessage(type, payload, callback) {
    var msg = {
      source: 'vex-game-sdk',
      type: type,
      payload: payload || {},
      id: ++_callbackId
    };
    if (callback) {
      _callbacks[msg.id] = callback;
    }
    try {
      window.parent.postMessage(JSON.stringify(msg), _parentOrigin);
    } catch (e) {
      console.error('[VEX SDK] PostMessage failed:', e);
    }
  }

  function handleMessage(event) {
    var data;
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch (e) {
      return; // Not our message
    }
    if (!data || data.source !== 'vex-platform') return;

    // Store parent origin for security
    if (event.origin && event.origin !== 'null') {
      _parentOrigin = event.origin;
    }

    switch (data.type) {
      case 'init_response':
        _player = data.payload.player || null;
        _sessionToken = data.payload.sessionToken || null;
        _ready = true;
        if (_config.onReady) _config.onReady(_player);
        _emit('ready', _player);
        break;

      case 'balance_update':
        if (_player) _player.balance = data.payload.balance;
        _emit('balanceUpdate', data.payload);
        break;

      case 'debit_response':
      case 'credit_response':
      case 'session_end_response':
      case 'score_response':
        if (data.id && _callbacks[data.id]) {
          _callbacks[data.id](data.payload);
          delete _callbacks[data.id];
        }
        break;

      case 'pause':
        _emit('pause', data.payload);
        break;

      case 'resume':
        _emit('resume', data.payload);
        break;

      case 'close':
        _emit('close', data.payload);
        break;

      case 'language_change':
        _emit('languageChange', data.payload);
        break;

      case 'error':
        console.error('[VEX SDK] Error from platform:', data.payload.message);
        _emit('error', data.payload);
        if (data.id && _callbacks[data.id]) {
          _callbacks[data.id]({ error: true, message: data.payload.message });
          delete _callbacks[data.id];
        }
        break;

      default:
        // Custom event from platform
        _emit(data.type, data.payload);
    }
  }

  // ============ INTERNAL: Event System ============

  function _emit(event, data) {
    var listeners = _eventListeners[event];
    if (listeners) {
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](data); } catch (e) { console.error('[VEX SDK] Event handler error:', e); }
      }
    }
  }

  // ============ PUBLIC API ============

  /**
   * Initialize the SDK and connect to VEX platform.
   * @param {Object} config
   * @param {Function} config.onReady - Called with player data when ready
   * @param {string} [config.language] - Preferred language (auto-detected if omitted)
   */
  VEX.init = function(config) {
    _config = config || {};
    window.addEventListener('message', handleMessage);

    // Tell the platform we're ready
    sendMessage('game_init', {
      sdkVersion: '1.0',
      language: _config.language || navigator.language || 'en'
    });

    // Ping parent to establish connection
    setTimeout(function() {
      if (!_ready) {
        sendMessage('game_ping', {});
      }
    }, 500);
  };

  /**
   * Get current player info.
   * @returns {{ id: string, username: string, balance: string, language: string, avatarUrl: string }} player
   */
  VEX.getPlayer = function() {
    return _player;
  };

  /**
   * Get current session token.
   * @returns {string} sessionToken
   */
  VEX.getSessionToken = function() {
    return _sessionToken;
  };

  /**
   * Check if SDK is ready.
   * @returns {boolean}
   */
  VEX.isReady = function() {
    return _ready;
  };

  /**
   * Debit (deduct) amount from player's balance.
   * Used for bets, entry fees, purchases.
   * @param {number} amount
   * @param {string} [reason] - Optional reason for the debit
   * @param {Function} callback - Called with { success, newBalance, error }
   */
  VEX.debit = function(amount, reason, callback) {
    if (typeof reason === 'function') { callback = reason; reason = ''; }
    sendMessage('debit', {
      amount: Number(amount),
      reason: reason || 'game_bet',
      sessionToken: _sessionToken
    }, callback);
  };

  /**
   * Credit (add) amount to player's balance.
   * Used for winnings, rewards.
   * @param {number} amount
   * @param {string} [reason] - Optional reason for the credit
   * @param {Function} callback - Called with { success, newBalance, error }
   */
  VEX.credit = function(amount, reason, callback) {
    if (typeof reason === 'function') { callback = reason; reason = ''; }
    sendMessage('credit', {
      amount: Number(amount),
      reason: reason || 'game_win',
      sessionToken: _sessionToken
    }, callback);
  };

  /**
   * Report player's score (for leaderboard/stats).
   * @param {number} score
   * @param {Object} [extra] - Extra metadata
   * @param {Function} [callback]
   */
  VEX.reportScore = function(score, extra, callback) {
    if (typeof extra === 'function') { callback = extra; extra = {}; }
    sendMessage('report_score', {
      score: Number(score),
      extra: extra || {},
      sessionToken: _sessionToken
    }, callback);
  };

  /**
   * End the current game session.
   * MUST be called when the game finishes.
   * @param {Object} result
   * @param {string} result.result - 'win', 'loss', 'draw', or 'none'
   * @param {number} [result.score] - Final score
   * @param {number} [result.winAmount] - Amount won (0 if lost)
   * @param {Object} [result.metadata] - Any extra game data
   * @param {Function} [callback]
   */
  VEX.endSession = function(result, callback) {
    sendMessage('end_session', {
      result: (result && result.result) || 'none',
      score: (result && result.score) || 0,
      winAmount: (result && result.winAmount) || 0,
      metadata: (result && result.metadata) || {},
      sessionToken: _sessionToken
    }, callback);
  };

  /**
   * Request to close the game and return to VEX.
   */
  VEX.close = function() {
    sendMessage('close_request', {});
  };

  /**
   * Show a toast notification in the VEX platform.
   * @param {string} message
   * @param {string} [type] - 'success', 'error', 'info', 'warning'
   */
  VEX.showToast = function(message, type) {
    sendMessage('show_toast', { message: message, type: type || 'info' });
  };

  /**
   * Listen for events from the VEX platform.
   * Events: 'ready', 'pause', 'resume', 'close', 'balanceUpdate', 'languageChange', 'error'
   * @param {string} event
   * @param {Function} handler
   */
  VEX.on = function(event, handler) {
    if (!_eventListeners[event]) _eventListeners[event] = [];
    _eventListeners[event].push(handler);
  };

  /**
   * Remove event listener.
   * @param {string} event
   * @param {Function} handler
   */
  VEX.off = function(event, handler) {
    var listeners = _eventListeners[event];
    if (listeners) {
      _eventListeners[event] = listeners.filter(function(h) { return h !== handler; });
    }
  };

  /**
   * Get platform info (language, theme, etc).
   * @param {Function} callback
   */
  VEX.getPlatformInfo = function(callback) {
    sendMessage('get_platform_info', {}, callback);
  };

  /**
   * Store data in persistent storage (scoped to this game + user).
   * @param {string} key
   * @param {*} value
   * @param {Function} [callback]
   */
  VEX.setData = function(key, value, callback) {
    sendMessage('set_data', { key: key, value: value }, callback);
  };

  /**
   * Read data from persistent storage.
   * @param {string} key
   * @param {Function} callback
   */
  VEX.getData = function(key, callback) {
    sendMessage('get_data', { key: key }, callback);
  };

  // ============ EXPOSE ============

  global.VEX = VEX;

})(typeof window !== 'undefined' ? window : this);
