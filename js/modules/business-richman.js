(function () {
  'use strict';

  var PAGE_ID = 'page-business-richman';
  var ROWS = 7;
  var COLUMNS = 6;
  var STORAGE_VERSION = 'v2';
  var DICE_SPINS = 12;
  var STEP_DELAY_MS = 650;
  var ARRIVAL_DELAY_MS = 350;
  var providers = Object.create(null);
  var state = null;
  var loadingPromise = null;

  var labels = {
    title: '\u5546\u8108\u5927\u5bcc\u7fc1',
    subtitle: '\u64f2\u9ab0\u63a2\u7d22\u4f60\u7684\u4eba\u8108\uff0c\u6bcf\u4e00\u683c\u90fd\u662f\u5408\u4f5c\u6a5f\u6703',
    peopleMode: '\u4eba\u8108\u63a2\u7d22',
    offerMode: '\u5e97\u5bb6\u512a\u60e0\u30fb\u5373\u5c07\u63a8\u51fa',
    loading: '\u6b63\u5728\u6392\u5217\u4eca\u5929\u7684\u4eba\u8108\u2026',
    privateNote: '\u540c\u6642\u8b80\u53d6\u4f60\u7684\u6536\u85cf\u540d\u7247\u8207\u5df2\u5be9\u6838\u7684\u516c\u958b\u540d\u7247\uff0c\u4e0d\u6703\u555f\u52d5 AI \u914d\u5c0d\u3002',
    boardCount: '\u672c\u5c40\u5df2\u6392\u5217',
    peopleUnit: '\u4f4d\u4eba\u8108',
    reset: '\u91cd\u65b0\u6392\u5217',
    board: '\u4eba\u8108\u5927\u5bcc\u7fc1\u68cb\u76e4',
    today: '\u4eca\u65e5\u4eba\u8108\u63a2\u7d22',
    next: '\u770b\u770b\u4e0b\u4e00\u4f4d\u662f\u8ab0',
    roll: '\u64f2\u9ab0\u63a2\u7d22',
    moving: '\u524d\u9032\u4e2d\u2026',
    roundPrefix: '\u7b2c ',
    roundSuffix: ' \u56de\u5408',
    arrived: '\u4f60\u8d70\u5230\u4e86\u9019\u4f4d\u4eba\u8108',
    continueGame: '\u7e7c\u7e8c\u904a\u6232',
    openCard: '\u6253\u958b\u5b8c\u6574\u540d\u7247',
    noContacts: '\u9084\u6c92\u6709\u53ef\u63a2\u7d22\u7684\u4eba\u8108',
    noContactsNote: '\u5148\u5230\u6536\u85cf\u540d\u7247\u6383\u63cf\u6216\u65b0\u589e\u540d\u7247\uff0c\u518d\u56de\u4f86\u64f2\u9ab0\u63a2\u7d22\u3002',
    goCards: '\u524d\u5f80\u6536\u85cf\u540d\u7247',
    loadFailed: '\u4eba\u8108\u8f09\u5165\u5931\u6557',
    retryNote: '\u8acb\u78ba\u8a8d\u767b\u5165\u72c0\u614b\u6216\u7a0d\u5f8c\u518d\u8a66\u3002',
    retry: '\u91cd\u65b0\u8f09\u5165',
    unnamed: '\u672a\u547d\u540d\u4eba\u8108',
    collectedCard: '\u6536\u85cf\u540d\u7247',
    publicCard: '\u5168\u7db2\u516c\u958b\u540d\u7247',
    collectedShort: '\u6536\u85cf',
    publicShort: '\u516c\u958b',
    explore: '\u63a2\u7d22',
    openPerson: '\u67e5\u770b\u4eba\u8108\uff1a',
    cardLoading: '\u540d\u7247\u529f\u80fd\u4ecd\u5728\u8f09\u5165\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66',
    back: '\u8fd4\u56de\u9996\u9801'
  };

  function clean(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function rowId(card) {
    return clean(card && (card.rowId || card.row_id || card.id || card.rowID));
  }

  function configOf(card) {
    try {
      var raw = card && (card['\u81ea\u8a02\u540d\u7247\u8a2d\u5b9a'] || card.customConfig || card.custom_config);
      var parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function imageOf(card) {
    var config = configOf(card);
    return clean(card && (
      card.avatarUrl || card.avatar_url || card.pictureUrl || card.picture_url || card['\u982d\u8cbc']
    )) || clean(
      config.thumbnailUrl || config.previewUrl || config.imgUrlSquare || config.imgUrlPortrait ||
      config.imgUrl || card.imageUrl || card.image_url || card['\u540d\u7247\u5716\u6a94']
    );
  }

  function nameOf(card) {
    return clean(card && (card['\u59d3\u540d'] || card.name || card.displayName || card['\u82f1\u6587\u540d'])) || labels.unnamed;
  }

  function subtitleOf(card) {
    var parts = [
      clean(card && (card['\u516c\u53f8\u540d\u7a31'] || card.companyName || card.company)),
      clean(card && (card['\u8077\u7a31'] || card.title))
    ].filter(Boolean);
    return parts.join('\uff5c');
  }

  function tagsOf(card) {
    var direct = clean(card && (card['\u6a19\u7c64'] || card.tags || card.tag))
      .split(/[,|\n/]+/)
      .map(clean)
      .filter(Boolean);
    var publicDetails = [
      card && (card.industry || card['\u884c\u696d'] || card['\u696d\u7a2e']),
      card && (card.services || card['\u670d\u52d9\u9805\u76ee'])
    ].map(clean).filter(Boolean);
    return Array.from(new Set(direct.concat(publicDetails))).slice(0, 4);
  }

  function isCollected(card) {
    var source = clean(card && (card.sourceType || card.source_type || card['\u540d\u7247\u4f86\u6e90'])).toLowerCase();
    return !!rowId(card) && source !== 'self_profile' && source !== 'referral_placeholder';
  }

  function isPublicEligible(card) {
    var source = clean(card && (card.sourceType || card.source_type || card['\u540d\u7247\u4f86\u6e90'])).toLowerCase();
    var visibility = clean(card && (card.visibility || card['\u516c\u958b\u72c0\u614b'])).toLowerCase();
    var review = clean(card && (card.aiReviewStatus || card.ai_review_status)).toLowerCase();
    var eligible = card && (card.poolEligible === true || Number(card.poolEligible || card.pool_eligible) === 1);
    return !!rowId(card) && source === 'self_profile' && visibility === 'public' && review === 'passed' && eligible;
  }

  function toTile(card, origin) {
    return {
      type: 'card',
      id: rowId(card),
      image: imageOf(card),
      title: nameOf(card),
      subtitle: subtitleOf(card) || (origin === 'public' ? labels.publicCard : labels.collectedCard),
      tags: tagsOf(card),
      origin: origin === 'public' ? 'public' : 'collected',
      sourceLabel: origin === 'public' ? labels.publicShort : labels.collectedShort,
      card: card
    };
  }

  function buildPath() {
    var result = [];
    var row;
    var column;
    for (column = 1; column <= COLUMNS; column += 1) result.push({ row: 1, column: column });
    for (row = 2; row <= ROWS; row += 1) result.push({ row: row, column: COLUMNS });
    for (column = COLUMNS - 1; column >= 1; column -= 1) result.push({ row: ROWS, column: column });
    for (row = ROWS - 1; row >= 2; row -= 1) result.push({ row: row, column: 1 });
    return result;
  }

  var path = buildPath();

  function randomIndex(max) {
    if (max <= 1) return 0;
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      var buffer = new Uint32Array(1);
      window.crypto.getRandomValues(buffer);
      return buffer[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function shuffle(items) {
    var result = items.slice();
    for (var index = result.length - 1; index > 0; index -= 1) {
      var other = randomIndex(index + 1);
      var current = result[index];
      result[index] = result[other];
      result[other] = current;
    }
    return result;
  }

  function userKey() {
    return clean(
      (window.currentUserProfile && window.currentUserProfile.userId) ||
      (window.currentUser && (window.currentUser.userId || window.currentUser.lineId)) ||
      window.currentUserId
    ) || 'member';
  }

  function dayKey() {
    var now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
  }

  function storageKey() {
    return ['business-richman', STORAGE_VERSION, userKey(), dayKey(), 'card'].join(':');
  }

  function readSaved(tileMap) {
    try {
      var saved = JSON.parse(window.sessionStorage.getItem(storageKey()) || 'null');
      if (!saved || saved.version !== STORAGE_VERSION || !Array.isArray(saved.order)) return null;
      var tiles = saved.order.map(function (id) { return tileMap.get(clean(id)); }).filter(Boolean);
      if (!tiles.length) return null;
      return {
        mode: 'card',
        tiles: tiles,
        position: Math.max(0, Math.min(Number(saved.position) || 0, path.length - 1)),
        round: Math.max(1, Number(saved.round) || 1),
        dice: Math.max(1, Math.min(Number(saved.dice) || 1, 6)),
        rolling: false,
        arrived: null
      };
    } catch (_) {
      return null;
    }
  }

  function save() {
    if (!state) return;
    try {
      window.sessionStorage.setItem(storageKey(), JSON.stringify({
        version: STORAGE_VERSION,
        order: state.tiles.map(function (tile) { return tile.id; }),
        position: state.position,
        round: state.round,
        dice: state.dice
      }));
    } catch (_) {}
  }

  function createState(tiles) {
    var unique = new Map();
    tiles.forEach(function (tile) {
      if (tile.id && !unique.has(tile.id)) unique.set(tile.id, tile);
    });
    var saved = readSaved(unique);
    if (saved) return saved;
    return {
      mode: 'card',
      tiles: shuffle(Array.from(unique.values())).slice(0, path.length),
      position: 0,
      round: 1,
      dice: 1,
      rolling: false,
      arrived: null
    };
  }

  function initials(value) {
    return Array.from(clean(value) || '\u4eba').slice(0, 2).join('');
  }

  function avatar(tile, className) {
    var frame = document.createElement('span');
    frame.className = className;
    if (!tile.image) {
      frame.classList.add('is-initials');
      frame.textContent = initials(tile.title);
      return frame;
    }
    var image = document.createElement('img');
    image.src = tile.image;
    image.alt = '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', function () {
      frame.innerHTML = '';
      frame.classList.add('is-initials');
      frame.textContent = initials(tile.title);
    }, { once: true });
    frame.appendChild(image);
    return frame;
  }

  function installStyles() {
    if (document.getElementById('business-richman-styles')) return;
    var style = document.createElement('style');
    style.id = 'business-richman-styles';
    style.textContent = [
      '#' + PAGE_ID + '{min-height:calc(100vh - 76px);background:linear-gradient(180deg,#ecfdf5,#f8fafc 45%,#fff);color:#0f172a;padding-bottom:96px}',
      '.br-header{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;padding:14px 16px;background:rgba(255,255,255,.94);border-bottom:1px solid #d1fae5;backdrop-filter:blur(12px)}',
      '.br-back{width:40px;height:40px;border-radius:999px;border:1px solid #dbe5e1;background:#fff;color:#0f5c4c;display:flex;align-items:center;justify-content:center}.br-title{font-size:20px;line-height:1.1;font-weight:900;color:#064338}.br-subtitle{margin-top:3px;font-size:11px;font-weight:800;color:#64748b}',
      '.br-modes{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:14px 14px 0}.br-mode{min-height:44px;border-radius:14px;border:1px solid #a7f3d0;background:#fff;color:#047857;font-size:13px;font-weight:900}.br-mode.active{background:#047857;color:#fff}.br-mode:disabled{border-color:#e2e8f0;background:#f8fafc;color:#94a3b8}',
      '.br-status{margin:12px 14px 0;padding:10px 12px;border:1px solid #d1fae5;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:800;color:#475569}.br-status strong{color:#047857}.br-status small{display:block;margin-top:2px;font-size:10px;color:#64748b}.br-reset{border:0;background:transparent;color:#047857;font-size:11px;font-weight:900}',
      '.br-wrap{padding:12px}.br-board{display:grid;grid-template-columns:repeat(' + COLUMNS + ',minmax(0,1fr));grid-template-rows:repeat(' + ROWS + ',minmax(0,1fr));gap:4px;aspect-ratio:' + COLUMNS + '/' + ROWS + ';width:100%;max-width:500px;margin:auto;padding:5px;border:3px solid #0f766e;border-radius:24px;background:linear-gradient(135deg,#fef3c7,#d1fae5 58%,#bfdbfe);box-shadow:0 18px 44px rgba(15,118,110,.18)}',
      '.br-tile{position:relative;min-width:0;overflow:visible;border:1px solid rgba(4,120,87,.2);border-radius:11px;background:rgba(255,255,255,.95);padding:3px 2px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;box-shadow:0 3px 8px rgba(15,23,42,.08);transition:.16s}.br-tile:disabled{opacity:1;color:inherit}.br-tile.current{z-index:3;border:2px solid #f97316;transform:scale(1.08);box-shadow:0 0 0 3px rgba(249,115,22,.2),0 7px 14px rgba(15,23,42,.16)}',
      '.br-avatar{width:36px;height:36px;flex:0 0 36px;border-radius:999px;border:2px solid #fff;background:#059669;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;overflow:hidden;box-shadow:0 2px 5px rgba(15,23,42,.15)}.br-avatar img,.br-dialog-avatar img{width:100%;height:100%;object-fit:cover}.is-initials{background:linear-gradient(135deg,#059669,#2563eb)!important}.br-name{width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;font-size:9px;font-weight:900;color:#334155}.br-origin{position:absolute;left:2px;top:2px;border-radius:999px;padding:1px 4px;background:#dbeafe;color:#1d4ed8;font-size:7px;font-weight:900}.br-origin.public{background:#d1fae5;color:#047857}',
      '.br-empty-tile{width:34px;height:34px;border-radius:999px;background:#e2e8f0;color:#64748b;display:flex;align-items:center;justify-content:center}.br-empty-tile .material-symbols-outlined{font-size:18px}.br-player{position:absolute;right:-3px;bottom:-3px;width:22px;height:22px;border:2px solid #fff;border-radius:999px;background:#f97316;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 7px rgba(15,23,42,.28);animation:brHop .6s ease-out}.br-player .material-symbols-outlined{font-size:15px}',
      '.br-center{grid-column:2/' + COLUMNS + ';grid-row:2/' + ROWS + ';margin:6px;border:1px solid rgba(255,255,255,.85);border-radius:20px;background:rgba(255,255,255,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;text-align:center}.br-kicker{font-size:10px;font-weight:900;color:#059669}.br-center-title{font-size:16px;line-height:1.1;font-weight:900;color:#064e3b}.br-die{width:58px;height:58px;margin:5px 0;border:4px solid #0f766e;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:900;color:#0f766e;box-shadow:0 6px 12px rgba(15,23,42,.14)}.br-die.rolling{animation:brShake .16s linear infinite}.br-roll{min-width:138px;min-height:42px;border:0;border-radius:14px;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:14px;font-weight:900;box-shadow:0 8px 18px rgba(234,88,12,.24)}.br-roll:disabled{background:#cbd5e1;box-shadow:none}.br-round{margin-top:6px;font-size:10px;font-weight:800;color:#64748b}',
      '.br-empty{margin:16px;border:1px solid #fde68a;border-radius:20px;background:#fffbeb;padding:24px;text-align:center}.br-empty h3{font-size:18px;font-weight:900;color:#92400e}.br-empty p{margin-top:6px;font-size:12px;font-weight:700;line-height:1.6;color:#a16207}.br-empty button{margin-top:14px;border:0;border-radius:14px;background:#047857;padding:12px 18px;color:#fff;font-size:13px;font-weight:900}',
      '.br-modal{position:fixed;inset:0;z-index:130;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.5);padding:18px;backdrop-filter:blur(4px)}.br-modal.hidden{display:none}.br-dialog{width:100%;max-width:480px;border-radius:28px;background:#fff;padding:22px;box-shadow:0 24px 70px rgba(15,23,42,.3);animation:brUp .22s ease-out}.br-dialog-head{display:flex;align-items:center;gap:14px}.br-dialog-avatar{width:76px;height:76px;flex:0 0 76px;border-radius:999px;border:4px solid #d1fae5;background:#059669;color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;overflow:hidden}.br-dialog h3{font-size:21px;font-weight:900;color:#0f172a}.br-dialog p{margin-top:5px;font-size:13px;font-weight:700;color:#64748b}.br-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.br-tag{border-radius:999px;background:#ecfdf5;padding:5px 9px;font-size:10px;font-weight:900;color:#047857}.br-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:9px;margin-top:18px}.br-actions button{min-height:48px;border-radius:15px;font-size:13px;font-weight:900}.br-close{border:1px solid #e2e8f0;background:#fff;color:#64748b}.br-open{border:0;background:#047857;color:#fff}',
      '@keyframes brShake{0%{transform:rotate(-12deg) scale(.92)}50%{transform:rotate(12deg) scale(1.08)}100%{transform:rotate(-12deg) scale(.92)}}@keyframes brHop{0%{transform:translateY(8px) scale(.75)}55%{transform:translateY(-7px) scale(1.12)}100%{transform:none}}@keyframes brUp{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}',
      '@media(max-width:380px){.br-avatar{width:30px;height:30px;flex-basis:30px}.br-name{font-size:8px}.br-die{width:48px;height:48px;font-size:28px}.br-center-title{font-size:14px}.br-roll{min-width:112px;min-height:38px}}',
      '@media(prefers-reduced-motion:reduce){.br-die.rolling,.br-dialog{animation:none}.br-tile{transition:none}}'
    ].join('');
    document.head.appendChild(style);
  }

  function markup() {
    return [
      '<header class="br-header">',
      '<button type="button" class="br-back" onclick="window.goPage(\'home\')" aria-label="' + labels.back + '"><span class="material-symbols-outlined">arrow_back</span></button>',
      '<div><h2 class="br-title">' + labels.title + '</h2><p class="br-subtitle">' + labels.subtitle + '</p></div></header>',
      '<div class="br-modes"><button type="button" class="br-mode active"><span class="material-symbols-outlined align-middle text-[18px]">groups</span> ' + labels.peopleMode + '</button>',
      '<button type="button" class="br-mode" disabled><span class="material-symbols-outlined align-middle text-[18px]">redeem</span> ' + labels.offerMode + '</button></div>',
      '<div id="business-richman-content"><div class="br-empty"><h3>' + labels.loading + '</h3><p>' + labels.privateNote + '</p></div></div>',
      '<div id="business-richman-modal" class="br-modal hidden" role="dialog" aria-modal="true" aria-labelledby="business-richman-modal-title">',
      '<div class="br-dialog"><div class="br-dialog-head"><div id="business-richman-modal-avatar"></div><div class="min-w-0"><span class="text-[11px] font-black text-emerald-600">' + labels.arrived + '</span><h3 id="business-richman-modal-title"></h3><p id="business-richman-modal-subtitle"></p></div></div>',
      '<div id="business-richman-modal-tags" class="br-tags"></div><div class="br-actions"><button type="button" class="br-close" onclick="window.closeBusinessRichmanCard()">' + labels.continueGame + '</button><button type="button" class="br-open" onclick="window.openBusinessRichmanCard()">' + labels.openCard + '</button></div></div></div>'
    ].join('');
  }

  function emptyTile(index) {
    return { type: 'empty', id: 'empty-' + index, title: labels.explore };
  }

  function render() {
    var content = document.getElementById('business-richman-content');
    if (!content || !state) return;
    if (!state.tiles.length) {
      content.innerHTML = '<div class="br-empty"><h3>' + labels.noContacts + '</h3><p>' + labels.noContactsNote + '</p><button type="button" onclick="window.goPage(\'card\')">' + labels.goCards + '</button></div>';
      return;
    }

    content.innerHTML = '';
    var status = document.createElement('div');
    status.className = 'br-status';
    var publicCount = state.tiles.filter(function (tile) { return tile.origin === 'public'; }).length;
    var collectedCount = state.tiles.length - publicCount;
    status.innerHTML = '<span>' + labels.boardCount + ' <strong>' + state.tiles.length + '</strong> ' + labels.peopleUnit +
      '<small>' + labels.collectedShort + ' ' + collectedCount + ' \u30fb ' + labels.publicShort + ' ' + publicCount + '</small></span><button type="button" class="br-reset" onclick="window.resetBusinessRichman()">' + labels.reset + '</button>';
    content.appendChild(status);

    var wrap = document.createElement('div');
    wrap.className = 'br-wrap';
    var board = document.createElement('div');
    board.className = 'br-board';
    board.setAttribute('aria-label', labels.board);

    path.forEach(function (point, index) {
      var tile = state.tiles[index % state.tiles.length];
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'br-tile' + (index === state.position ? ' current' : '');
      button.style.gridRow = String(point.row);
      button.disabled = tile.type !== 'card' || index !== state.position;
      button.style.gridColumn = String(point.column);
      if (tile.type === 'card') {
        var source = document.createElement('span');
        source.className = 'br-origin' + (tile.origin === 'public' ? ' public' : '');
        source.textContent = tile.sourceLabel;
        button.appendChild(source);
        button.setAttribute('aria-label', labels.openPerson + tile.title);
        button.appendChild(avatar(tile, 'br-avatar'));
        var name = document.createElement('span');
        name.className = 'br-name';
        name.textContent = tile.title;
        button.appendChild(name);
        if (index === state.position) button.addEventListener('click', function () { showArrival(tile); });
      } else {
        button.innerHTML = '<span class="br-empty-tile"><span class="material-symbols-outlined">explore</span></span><span class="br-name">' + labels.explore + '</span>';
      }
      if (index === state.position) {
        var player = document.createElement('span');
        player.className = 'br-player';
        player.innerHTML = '<span class="material-symbols-outlined">directions_walk</span>';
        button.appendChild(player);
      }
      board.appendChild(button);
    });

    var center = document.createElement('section');
    center.className = 'br-center';
    center.innerHTML = '<span class="br-kicker">' + labels.today + '</span><strong class="br-center-title">' + labels.next + '</strong><div id="business-richman-die" class="br-die" aria-live="polite">' + state.dice + '</div><button id="business-richman-roll" type="button" class="br-roll" onclick="window.rollBusinessRichman()">' + labels.roll + '</button><span class="br-round">' + labels.roundPrefix + state.round + labels.roundSuffix + '</span>';
    board.appendChild(center);
    wrap.appendChild(board);
    content.appendChild(wrap);
  }

  function wait(milliseconds) {
    return new Promise(function (resolve) { window.setTimeout(resolve, milliseconds); });
  }

  function rollingUi(active) {
    var die = document.getElementById('business-richman-die');
    var button = document.getElementById('business-richman-roll');
    if (die) die.classList.toggle('rolling', active);
    if (button) {
      button.disabled = active;
      button.textContent = active ? labels.moving : labels.roll;
    }
  }

  async function roll() {
    if (!state || state.rolling || !state.tiles.length) return;
    state.rolling = true;
    rollingUi(true);
    var dice = randomIndex(6) + 1;
    for (var spin = 0; spin < DICE_SPINS; spin += 1) {
      var die = document.getElementById('business-richman-die');
      if (die) die.textContent = String(randomIndex(6) + 1);
      await wait(70 + spin * 8);
    }
    for (var step = 0; step < dice; step += 1) {
      state.position = (state.position + 1) % path.length;
      state.dice = dice;
      render();
      rollingUi(true);
      await wait(STEP_DELAY_MS);
    }
    state.round += 1;
    state.rolling = false;
    save();
    render();
    await wait(ARRIVAL_DELAY_MS);
    var arrived = state.tiles[state.position % state.tiles.length];
    if (arrived) showArrival(arrived);
  }

  function showArrival(tile) {
    if (!tile || tile.type !== 'card') return;
    var modal = document.getElementById('business-richman-modal');
    var avatarHost = document.getElementById('business-richman-modal-avatar');
    var title = document.getElementById('business-richman-modal-title');
    var subtitle = document.getElementById('business-richman-modal-subtitle');
    var tags = document.getElementById('business-richman-modal-tags');
    if (!modal || !avatarHost || !title || !subtitle || !tags) return;
    state.arrived = tile;
    avatarHost.innerHTML = '';
    avatarHost.appendChild(avatar(tile, 'br-dialog-avatar'));
    title.textContent = tile.title;
    subtitle.textContent = tile.subtitle;
    tags.innerHTML = '';
    var sourceChip = document.createElement('span');
    sourceChip.className = 'br-tag';
    sourceChip.textContent = tile.origin === 'public' ? labels.publicCard : labels.collectedCard;
    tags.appendChild(sourceChip);
    (tile.tags || []).forEach(function (tag) {
      var chip = document.createElement('span');
      chip.className = 'br-tag';
      chip.textContent = tag;
      tags.appendChild(chip);
    });
    modal.classList.remove('hidden');
  }

  function closeArrival() {
    var modal = document.getElementById('business-richman-modal');
    if (modal) modal.classList.add('hidden');
  }

  async function loadPublicCards() {
    if (typeof window.fetchAPI !== 'function') return [];
    var ownRowId = rowId(window.currentUserCard);
    var result = await window.fetchAPI('listPublicBusinessCards', {
      limit: path.length * 3,
      excludeRowId: ownRowId
    }, true);
    var cards = Array.isArray(result)
      ? result
      : (result && Array.isArray(result.data) ? result.data : []);
    return cards.filter(isPublicEligible).map(function (card) { return toTile(card, 'public'); });
  }

  async function loadCards() {
    if (typeof window.loadCardData !== 'function') return [];
    await window.loadCardData({ render: false, harvest: true, initPanels: false });
    var collected = (Array.isArray(window.harvestCards) ? window.harvestCards : [])
      .filter(isCollected)
      .map(function (card) { return toTile(card, 'collected'); });
    var publicCards = [];
    try {
      publicCards = await loadPublicCards();
    } catch (error) {
      console.warn('[business-richman] public pool unavailable:', error);
    }
    return collected.concat(publicCards);
  }

  providers.card = {
    load: loadCards,
    open: async function (tile) {
      if (tile.origin === 'public' && tile.card && typeof window.openCardDetail === 'function') {
        window.openCardDetail(tile.card);
      } else if (typeof window.openCardDetailById === 'function') {
        await window.openCardDetailById(tile.id);
      } else if (typeof window.showToast === 'function') {
        window.showToast(labels.cardLoading, true);
      }
    }
  };

  window.registerBusinessRichmanProvider = function (type, provider) {
    var key = clean(type);
    if (key && provider && typeof provider.load === 'function' && typeof provider.open === 'function') {
      providers[key] = provider;
    }
  };

  window.openBusinessRichman = function () {
    if (typeof window.goPage === 'function') window.goPage('business-richman');
    return window.initBusinessRichman();
  };

  window.initBusinessRichman = function (options) {
    options = options || {};
    var page = document.getElementById(PAGE_ID);
    if (!page) return Promise.resolve();
    installStyles();
    if (page.dataset.ready !== '1') {
      page.innerHTML = markup();
      page.dataset.ready = '1';
    }
    if (loadingPromise && !options.force) return loadingPromise;
    loadingPromise = (async function () {
      try {
        var tiles = await providers.card.load();
        state = createState(tiles);
        save();
        render();
      } catch (error) {
        console.error('[business-richman] contact load failed:', error);
        var content = document.getElementById('business-richman-content');
        if (content) content.innerHTML = '<div class="br-empty"><h3>' + labels.loadFailed + '</h3><p>' + labels.retryNote + '</p><button type="button" onclick="window.initBusinessRichman({force:true})">' + labels.retry + '</button></div>';
      } finally {
        loadingPromise = null;
      }
    })();
    return loadingPromise;
  };

  window.rollBusinessRichman = roll;
  window.closeBusinessRichmanCard = closeArrival;
  window.openBusinessRichmanCard = async function () {
    var tile = state && state.arrived;
    if (!tile) return;
    closeArrival();
    var provider = providers[tile.type];
    if (provider && typeof provider.open === 'function') await provider.open(tile);
  };
  window.resetBusinessRichman = function () {
    try { window.sessionStorage.removeItem(storageKey()); } catch (_) {}
    state = null;
    return window.initBusinessRichman({ force: true });
  };
})();
