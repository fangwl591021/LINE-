/**
 * ACTMASTER v6.0 - 企業安全防護版 (Edge Auth & Security)
 * 特點：導入 Cloudflare KV 進行毫秒級身分驗證，並新增 LINE Token 強制核對與 OpenAI 流量防護機制
 */

// ==================== 金流加密工具 (NewebPay MPG) ====================
const NewebPayCrypto = {
  encoder: new TextEncoder(),

  bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  hexToBytes(hex) {
    const clean = String(hex || '').trim();
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
    return bytes;
  },

  pkcs7Pad(bytes) {
    const blockSize = 16;
    let padding = blockSize - (bytes.length % blockSize);
    if (padding === 0) padding = blockSize;
    const out = new Uint8Array(bytes.length + padding);
    out.set(bytes);
    out.fill(padding, bytes.length);
    return out;
  },

  pkcs7Unpad(bytes) {
    const padding = bytes[bytes.length - 1];
    if (!padding || padding > 16) return bytes;
    return bytes.slice(0, bytes.length - padding);
  },

  async importAesKey(hashKey) {
    return await crypto.subtle.importKey('raw', this.encoder.encode(hashKey), { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
  },

  async aesEncrypt(text, hashKey, hashIv) {
    const key = await this.importAesKey(hashKey);
    const padded = this.pkcs7Pad(this.encoder.encode(text));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: this.encoder.encode(hashIv) }, key, padded);
    return this.bytesToHex(new Uint8Array(encrypted));
  },

  async aesDecrypt(hex, hashKey, hashIv) {
    const key = await this.importAesKey(hashKey);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: this.encoder.encode(hashIv) }, key, this.hexToBytes(hex));
    return new TextDecoder().decode(this.pkcs7Unpad(new Uint8Array(decrypted)));
  },

  async sha256(text) {
    const hash = await crypto.subtle.digest('SHA-256', this.encoder.encode(text));
    return this.bytesToHex(new Uint8Array(hash)).toUpperCase();
  }
};

// ==================== 模組 0: 資安防護 (Security Module) ====================
const SecurityModule = {
  hardAdminAccounts: [
    {
      label: '方萬隆',
      ids: ['Uf729764dbb5b652a5a90a467320bea29', 'U050397a077bef628b317b0bbedeb2187'],
      phones: ['0927136847'],
      names: ['方萬隆', 'Tonyfang']
    },
    {
      label: '楊滄棋',
      ids: ['U58eb5c1a747450140ce1335af709ae55', 'Ue9a59cf9b2969ec78b6bfdc2a4cfca08'],
      phones: ['0986919171'],
      names: ['楊滄棋']
    }
  ],
  hardAdminIds: new Set([
    'Uf729764dbb5b652a5a90a467320bea29',
    'U050397a077bef628b317b0bbedeb2187',
    'U58eb5c1a747450140ce1335af709ae55',
    'Ue9a59cf9b2969ec78b6bfdc2a4cfca08'
  ]),

  text(value) {
    return String(value ?? '').trim();
  },

  normalizeRole(value) {
    const role = this.text(value).toLowerCase();
    if (role === 'admin' || role === '總管') return 'admin';
    if (role === 'store' || role === 'tenant' || role === '店長' || role === '租戶') return 'store';
    return 'user';
  },

  normalizePhone(value) {
    return this.text(value).replace(/\D/g, '');
  },

  isHardAdmin(userId, user = {}) {
    const ids = [
      userId,
      user.line_id,
      user.row_id,
      user.legacy_line_id,
      user.point_line_id,
      user.legacyLineId,
      user.pointLineId,
      user.identityLink && user.identityLink.oldLineId,
      user.identityLink && user.identityLink.newLineId
    ].map(value => this.text(value)).filter(Boolean);
    const name = this.text(user.name || user.displayName || user.user_name);
    const phone = this.normalizePhone(user.phone || user.mobile);
    return this.hardAdminAccounts.some(account => {
      const idMatch = ids.some(id => account.ids.includes(id));
      const phoneMatch = !!phone && account.phones.includes(phone);
      const nameMatch = !!name && account.names.some(allowed => name.includes(allowed));
      if (idMatch) return phoneMatch || nameMatch;
      return phoneMatch && nameMatch;
    });
  },

  sanitizeRole(userId, role, user = {}) {
    if (this.isHardAdmin(userId, user)) return 'admin';
    const normalized = this.normalizeRole(role);
    return normalized === 'admin' ? 'user' : normalized;
  },

  effectiveNetworkId(userId, role, user = {}) {
    const normalizedRole = this.normalizeRole(role);
    const currentUserId = this.text(userId || user.line_id || user.row_id);
    if (normalizedRole === 'admin') return 'admin';
    if (normalizedRole === 'store') return currentUserId || this.text(user.network_id, 'admin');
    const explicitNetwork = this.text(user.network_id);
    if (explicitNetwork && explicitNetwork !== 'admin') return explicitNetwork;
    const referrerId = this.text(user.referrer_id);
    if (referrerId) return referrerId;
    return explicitNetwork || 'admin';
  },

  async getLineUserIdFromToken(token, env) {
    if (!token) return '';
    const cacheKey = `AUTH_${token.substring(0, 30)}`;
    if (env.ACTMASTER_KV) {
      const cachedUserId = await env.ACTMASTER_KV.get(cacheKey);
      if (cachedUserId) return cachedUserId;
    }

    const res = await fetch('https://api.line.me/v2/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status !== 200) return '';
    const data = await res.json();
    const userId = this.text(data.userId);
    if (userId && env.ACTMASTER_KV) {
      await env.ACTMASTER_KV.put(cacheKey, userId, { expirationTtl: 3600 });
    }
    return userId;
  },

  async getActor(payload, request, env) {
    const token = payload.lineAccessToken || request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return null;
    const userId = await this.getLineUserIdFromToken(token, env);
    if (!userId) return null;

    let role = 'user';
    let networkId = 'admin';
    if (this.isHardAdmin(userId)) role = 'admin';
    if (env.ACTMASTER_DB && typeof D1ReadModule !== 'undefined') {
      const user = await D1ReadModule.first(env, 'SELECT role, network_id, referrer_id, name, phone FROM users WHERE line_id = ? OR row_id = ? LIMIT 1', [userId, userId]);
      if (user) {
        role = this.sanitizeRole(userId, user.role, user);
        networkId = this.effectiveNetworkId(userId, role, user);
      }
    }
    return { userId, role, networkId, token };
  },

  canManage(role) {
    return role === 'admin' || role === 'store';
  },

  async authorizeAction(action, payload, request, env) {
    const adminOnly = new Set([
      'updateUserRole',
      'adminSyncBoundCardUser',
      'mlmMarkOrderPaid',
      'mlmCancelOrder',
      'mlmRefundOrder',
      'mlmCreateSettlementBatch',
      'mlmLockSettlementBatch',
      'mlmListSettlementBatches',
      'mlmPreviewMonthlySettlement',
      'mlmMarkSettlementPaid',
      'markTenantOrderPaid',
      'cancelTenantBonusOrder',
      'auditDataConsistency',
      'repairDataConsistency',
      'previewIdentityMigration',
      'confirmIdentityMerge',
      'listDuplicateCardBindings',
      'resolveDuplicateCardBinding',
      'deployRichMenu',
      'listAdminAnnouncements',
      'saveAnnouncement',
      'deleteAnnouncement'
    ]);
    const managerOnly = new Set([
      'bulkAddRegistrants',
      'updateActivity',
      'removeAct',
      'setActivityStatus',
      'duplicateActivity',
      'getActivityRegistrants',
      'confirmPayment',
      'toggleCheckin',
      'saveStoreSettings',
      'extractLineVoomMedia',
      'storeAdjustCustomerPoints',
      'getStorePointCustomer',
      'listStorePointCashierLogs'
    ]);
    const ownTokenRequired = new Set([
      'registerUser',
      'updateUserProfile',
      'linkUserIdentity',
      'getCardContacts',
      'getCrmContacts',
      'saveCard',
      'updateCard',
      'claimCardAndRegister',
      'deleteCard',
      'unlinkCard',
      'queryUserPoints',
      'listPersonalTasks',
      'savePersonalTask',
      'completePersonalTask',
      'deletePersonalTask',
      'getInboxCount',
      'listInboxItems',
      'listSentInboxItems',
      'getInboxItem',
      'markInboxRead',
      'searchInboxRecipients',
      'sendInboxMessage',
      'redeemInboxCoupon',
      'getWebPushConfig',
      'saveWebPushSubscription',
      'deleteWebPushSubscription',
      'dailyPointCheckin',
      'getPersonalAssistantCore',
      'savePersonalAssistantCore',
      'matchmakeContacts',
      'mlmCreateOrder',
      'createTenantBonusOrder',
      'nfcCheckin',
      'getActivityById',
      'cancelActivityRegistration',
      'cancelRegistration',
      'unregisterActivity',
      'removeActivityRegistration',
      'mlmListBonusTransactions',
      'mlmGetMemberTree',
      'mlmGetOrganizationTree'
    ]);

    if (!adminOnly.has(action) && !managerOnly.has(action) && !ownTokenRequired.has(action)) {
      return { allowed: true, actor: null };
    }

    const actor = await this.getActor(payload, request, env);
    if (!actor) return { allowed: false, error: 'Access Denied: Missing or invalid LINE Token' };

    payload.authenticatedUserId = actor.userId;
    payload.authenticatedRole = actor.role;
    payload.authenticatedNetworkId = actor.networkId;

    if (adminOnly.has(action) && actor.role !== 'admin') {
      return { allowed: false, error: 'Access Denied: Admin only action' };
    }

    if (managerOnly.has(action) && !this.canManage(actor.role)) {
      return { allowed: false, error: 'Access Denied: Manager role required' };
    }

    if (action === 'mlmCreateOrder' || action === 'createTenantBonusOrder') {
      const buyerId = this.text(payload.buyerId || payload.tenantId || payload.userId);
      if (!this.canManage(actor.role) && buyerId && buyerId !== actor.userId) {
        return { allowed: false, error: 'Access Denied: Cannot create order for another user' };
      }
      if (!this.canManage(actor.role)) {
        payload.buyerId = actor.userId;
        payload.tenantId = actor.userId;
        payload.paymentStatus = 'pending_payment';
        payload.status = 'pending_payment';
      }
    }

    if (action === 'updateUserProfile') {
      payload.userId = actor.userId;
    }

    if (action === 'linkUserIdentity') {
      payload.newUserId = actor.userId;
    }

    if (action === 'claimCardAndRegister') {
      payload.userId = actor.userId;
    }

    return { allowed: true, actor };
  },
  // 驗證 LIFF Token，確保 userId 未被偽造
  async verifyLineAuth(userId, token, env) {
    if (!token || !userId) return false;
    if (!env.ACTMASTER_KV) return true; // 若未綁定 KV 則暫時放行(避免癱瘓系統)

    const cacheKey = `AUTH_${token.substring(0, 30)}`; // 避免 Key 過長
    const cachedUserId = await env.ACTMASTER_KV.get(cacheKey);
    if (cachedUserId === userId) return true;

    try {
      const res = await fetch('https://api.line.me/v2/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status !== 200) return false;
      const data = await res.json();
      
      if (data.userId === userId) {
        // 驗證成功，快取 1 小時，大幅降低 LINE API 呼叫延遲
        await env.ACTMASTER_KV.put(cacheKey, userId, { expirationTtl: 3600 });
        return true;
      }
      return false;
    } catch(e) {
      return false;
    }
  },

  // 防刷機制 (Rate Limiting)
  async checkRateLimit(userId, action, env, role) {
    if (!env.ACTMASTER_KV || !userId) return true;
    
    const date = new Date().toISOString().split('T')[0];
    const key = `RL_${action}_${userId}_${date}`;
    
    // 定義各項 AI 功能的每日上限
    const limits = { 
      recognizeCardWithGPT4o: 10, 
      fateTags: 10, 
      matchmakeContacts: 20,
      reviewCardSafety: 50,
      generateCardCopy: 50
    };
    let max = limits[action] || 50;
    if (action === 'generateCardCopy' || action === 'reviewCardSafety') {
      if (role === 'admin') return true;
      max = (role === 'store' || role === 'tenant') ? 50 : 5;
    }

    let count = parseInt(await env.ACTMASTER_KV.get(key)) || 0;
    if (count >= max) return false;

    await env.ACTMASTER_KV.put(key, (count + 1).toString(), { expirationTtl: 86400 });
    return true;
  }
};

// ==================== 模組 1: 核心工具 (Core Utils) ====================
const Utils = {
  zwsp: String.fromCharCode(8203),

  text(value) {
    return String(value ?? '').trim();
  },
  
  getIconUrl(type) {
    const icons = {
      "LINE": "https://aiwe.cc/wp-content/uploads/2026/02/b75a5831fd553c7130aeafbb9783cf79.png",
      "FB":   "https://aiwe.cc/wp-content/uploads/2026/02/3986d1fd62384c8cdaa0e7c82f2740d1.png",
      "IG":   "https://aiwe.cc/wp-content/uploads/2026/02/a33306edcecd1ebdfd14baea6718cf23.png",
      "YT":   "https://aiwe.cc/wp-content/uploads/2026/02/87e6f8054bd3672f2885e38bddb112e2.png",
      "TEL":  "https://aiwe.cc/wp-content/uploads/2026/02/7254567388850a6b4d77b75208ebd4b8.png",
      "WEB":  "https://cdn-icons-png.flaticon.com/512/1006/1006771.png"
    };
    return icons[type] || icons['WEB'];
  },

  cleanURI(uri) {
    if (!uri) return '';
    uri = uri.trim();
    if (uri === 'http://' || uri === 'https://') return '';
    if (!uri.match(/^(http|https|tel|mailto|line):/i)) return 'https://' + uri;
    return uri;
  },

  formatPhone(val) {
    if (!val) return '';
    let s = String(val).replaceAll(this.zwsp, '').replaceAll("'", "");
    return this.zwsp + s;
  },

  jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};

// ==================== 模組 2: 圖片處理 (Storage Module) ====================
const StorageModule = {
  async upload(base64Image, env) {
    try {
      if (env.IMG_BUCKET) {
        const matches = base64Image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const mimeType = matches[1];
          const binaryStr = atob(matches[2]);
          const buffer = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) buffer[i] = binaryStr.charCodeAt(i);
          const ext = mimeType.split('/')[1] || 'jpeg';
          const fileName = `card_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
          await env.IMG_BUCKET.put(fileName, buffer, { httpMetadata: { contentType: mimeType } });
          const baseUrl = env.R2_WORKER_URL ? env.R2_WORKER_URL.replace(/\/$/, '') : 'https://photoman.fangwl591021.workers.dev';
          return `${baseUrl}/${fileName}`;
        }
      } 
      
      if (env.PHOTOMAN) {
        const r2Res = await env.PHOTOMAN.fetch("https://photoman.internal/", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Image })
        });
        const r2Data = await r2Res.json();
        if (r2Data.url) return r2Data.url;
      }

      // ImgBB 備援 
      if (!env.IMGBB_API_KEY) throw new Error("Missing IMGBB_API_KEY in environment variables");
      const formData = new URLSearchParams();
      formData.append('image', base64Image.replace(/^data:image\/[a-z]+;base64,/, ''));
      const bbRes = await fetch(`https://api.imgbb.com/1/upload?key=${env.IMGBB_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });
      const bbData = await bbRes.json();
      return bbData.data?.url || '';
    } catch (e) {
      console.error("[Storage Error]", e);
      return '';
    }
  }
};

// ==================== 模組 3: AI 服務 (AI Module) ====================
// ==================== LINE OA Tools Module ====================
const LineOAModule = {
  cleanMenu(menu) {
    const source = menu || {};
    const size = source.size || {};
    const cleaned = {
      size: { width: 2500, height: Number(size.height) === 1686 ? 1686 : 843 },
      selected: source.selected !== false,
      name: Utils.text(source.name || 'New Rich Menu').slice(0, 300),
      chatBarText: Utils.text(source.chatBarText || '選單').slice(0, 14),
      areas: []
    };
    cleaned.areas = (Array.isArray(source.areas) ? source.areas : []).map(area => {
      const bounds = area.bounds || {};
      const action = area.action || {};
      const type = Utils.text(action.type || 'uri').toLowerCase();
      const pure = { type };
      if (type === 'uri') pure.uri = Utils.cleanURI(action.uri || '');
      else if (type === 'message') pure.text = Utils.text(action.text);
      else if (type === 'postback') {
        pure.data = Utils.text(action.data);
        if (action.displayText) pure.displayText = Utils.text(action.displayText);
      } else if (type === 'richmenuswitch') {
        pure.richMenuAliasId = Utils.text(action.richMenuAliasId);
        pure.data = Utils.text(action.data);
      } else {
        pure.type = 'uri';
        pure.uri = '';
      }
      return {
        bounds: {
          x: Math.max(0, Math.round(Number(bounds.x) || 0)),
          y: Math.max(0, Math.round(Number(bounds.y) || 0)),
          width: Math.max(1, Math.round(Number(bounds.width) || 1)),
          height: Math.max(1, Math.round(Number(bounds.height) || 1))
        },
        action: pure
      };
    });
    return cleaned;
  },

  validateMenu(menu, imageBase64) {
    if (!menu.name) throw new Error('Rich Menu name is required');
    if (!menu.chatBarText) throw new Error('Rich Menu chatBarText is required');
    if (!Array.isArray(menu.areas) || menu.areas.length === 0) throw new Error('Rich Menu requires at least one tappable area');
    if (!imageBase64 || !String(imageBase64).startsWith('data:image')) throw new Error('Rich Menu image is required');
    menu.areas.forEach((area, index) => {
      const action = area.action || {};
      if (action.type === 'uri' && !action.uri) throw new Error(`Area #${index + 1} missing URI`);
      if (action.type === 'message' && !action.text) throw new Error(`Area #${index + 1} missing message text`);
      if (action.type === 'postback' && !action.data) throw new Error(`Area #${index + 1} missing postback data`);
      if (action.type === 'richmenuswitch' && (!action.richMenuAliasId || !action.data)) throw new Error(`Area #${index + 1} missing switch alias or data`);
    });
  },

  base64ToBytes(imageBase64) {
    const body = String(imageBase64).split(',')[1] || '';
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  },

  async deployRichMenu(payload, env) {
    if (!env.LINE_CHANNEL_ACCESS_TOKEN) throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN');
    const menu = this.cleanMenu(payload.menuObject || payload.richMenuConfig || payload);
    const imageBase64 = payload.imageBase64 || payload.image || payload.base64Image;
    this.validateMenu(menu, imageBase64);

    const createRes = await fetch('https://api.line.me/v2/bot/richmenu', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(menu)
    });
    if (!createRes.ok) throw new Error('Create LINE rich menu failed: ' + await createRes.text());
    const richMenuId = (await createRes.json()).richMenuId;

    const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, 'Content-Type': 'image/jpeg' },
      body: this.base64ToBytes(imageBase64)
    });
    if (!uploadRes.ok) throw new Error('Upload rich menu image failed: ' + await uploadRes.text());

    const defaultRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }
    });
    if (!defaultRes.ok) throw new Error('Set default rich menu failed: ' + await defaultRes.text());

    return { success: true, data: { richMenuId, menu } };
  },

  extractUrls(text) {
    const found = new Set();
    const pattern = /https?:\/\/[^\s"'<>)\]]+/gi;
    let match;
    while ((match = pattern.exec(String(text || '')))) {
      found.add(match[0].replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/[),.;]+$/g, ''));
    }
    return Array.from(found);
  },

  classifyMedia(urls) {
    const images = [];
    let video = null;
    urls.forEach(url => {
      if (/(\.mp4|\/video\/|videoUrl|videoplayback)/i.test(url)) video = video || { videoUrl: url };
      else if (/(\.jpg|\.jpeg|\.png|\.webp|\/image\/|\/photo\/|thumbnail)/i.test(url)) images.push({ url });
    });
    return { video, images };
  },

  async extractLineVoomMedia(payload) {
    const target = Utils.text(payload.url);
    if (!/^https:\/\/(linevoom\.line\.me|line\.me)\//i.test(target)) throw new Error('Only LINE VOOM URLs are supported');
    const res = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LINEOA-Extractor/1.0)', 'Accept': 'text/html,application/xhtml+xml,application/json' } });
    if (!res.ok) throw new Error(`Fetch LINE VOOM failed: HTTP ${res.status}`);
    const html = await res.text();
    const urls = this.extractUrls(html);
    const media = this.classifyMedia(urls);
    const ogImage = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] || html.match(/content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
    const ogVideo = html.match(/property=["']og:video(?::url)?["'][^>]+content=["']([^"']+)/i)?.[1] || html.match(/content=["']([^"']+)["'][^>]+property=["']og:video(?::url)?["']/i)?.[1];
    if (ogImage && !media.images.some(img => img.url === ogImage)) media.images.unshift({ url: ogImage });
    if (ogVideo && !media.video) media.video = { videoUrl: ogVideo, thumbnailUrl: ogImage || '' };
    if (media.video && ogImage && !media.video.thumbnailUrl) media.video.thumbnailUrl = ogImage;
    const type = media.video && media.images.length ? 'MIXED' : media.video ? 'VIDEO' : media.images.length ? 'IMAGE' : 'UNKNOWN';
    return { success: true, data: { success: true, sourceUrl: target, type, video: media.video, images: media.images.slice(0, 20), urls: urls.slice(0, 100) } };
  }
};
// ==================== Point Service Module ====================
const PointModule = {
  apiUrl: 'https://aiwe.cc/index.php/wp-json/wetw-point/v1/query-user-point-list',
  insertApiUrl: 'https://aiwe.cc/index.php/wp-json/wetw-point/v1/insert-user-point',

  number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  },

  time(value) {
    const text = String(value || '').trim();
    if (!text) return 0;
    const parsed = Date.parse(text.replace(' ', 'T'));
    return Number.isFinite(parsed) ? parsed : 0;
  },

  latestBalance(list) {
    if (!Array.isArray(list) || !list.length) return 0;
    const rowsWithBalance = list.filter(item => item.point_balance !== undefined && item.point_balance !== null && String(item.point_balance).trim() !== '');
    if (!rowsWithBalance.length) return list.reduce((sum, item) => sum + this.number(item.get_point), 0);
    const sorted = rowsWithBalance.slice().sort((a, b) => {
      const byTime = this.time(b.created_at) - this.time(a.created_at);
      if (byTime !== 0) return byTime;
      return this.number(b.id) - this.number(a.id);
    });
    return this.number(sorted[0].point_balance);
  },

  balancesByType(list) {
    const groups = {};
    (Array.isArray(list) ? list : []).forEach(item => {
      const type = String(item.point_type || 'unknown').trim() || 'unknown';
      if (!groups[type]) groups[type] = [];
      groups[type].push(item);
    });
    return Object.keys(groups).reduce((acc, type) => {
      acc[type] = this.latestBalance(groups[type]);
      return acc;
    }, {});
  },

  async fetchPointPage(body) {
    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      return { error: data.message || data.code || ('Point API HTTP ' + res.status), code: data.code || '', data };
    }
    return { data };
  },

  async insertUserPoint(payload, env) {
    const apiKey = env.POINT_API_KEY || env.WETW_POINT_API_KEY;
    if (!apiKey) return { success: false, error: 'Missing POINT_API_KEY' };
    const lineUserId = String(payload.LINE_user_id || payload.lineUserId || payload.userId || '').trim();
    if (!lineUserId) return { success: false, error: 'Missing LINE user id' };

    const body = {
      api_key: apiKey,
      LINE_user_id: lineUserId,
      shop_id: Number(payload.shop_id || payload.shopId || env.POINT_SHOP_ID || 35),
      event_name: String(payload.event_name || payload.eventName || '掃描名片贈點'),
      event_content: String(payload.event_content || payload.eventContent || '新增不重複名片，系統自動贈點'),
      point_type: String(payload.point_type || payload.pointType || 'system_point'),
      get_point: Number(payload.get_point || payload.points || 0),
      shop_user_lineid: String(payload.shop_user_lineid || ''),
      child_shop_name: String(payload.child_shop_name || ''),
      child_shop_renew: Number(payload.child_shop_renew || 0),
      shop_remark: String(payload.shop_remark || '')
    };
    if (!body.get_point) return { success: false, error: 'Missing point amount' };

    const res = await fetch(this.insertApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      return { success: false, error: data.message || data.code || ('Point insert API HTTP ' + res.status), data };
    }
    return { success: true, data };
  },

  async enrichPointRowsWithCashierLogs(env, lineUserId, rows) {
    if (!env.ACTMASTER_DB || !lineUserId || !Array.isArray(rows) || !rows.length) return rows;
    await this.ensureCashierLedgerTable(env);

    const logs = await D1ReadModule.all(env, `
      SELECT *
      FROM store_point_cashier_logs
      WHERE customer_point_user_id = ? OR customer_user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `, [lineUserId, lineUserId]).catch(() => []);
    if (!logs.length) return rows;

    const actorNames = {};
    for (const log of logs) {
      const actorId = D1ReadModule.text(log.actor_user_id);
      if (!actorId || actorNames[actorId]) continue;
      const actor = await D1ReadModule.findUserByIdentity(env, actorId).catch(() => null);
      const user = actor && actor.user ? D1ReadModule.userRow(actor.user) : null;
      actorNames[actorId] = D1ReadModule.text(user && user.name)
        || D1ReadModule.text(user && user.storeId)
        || D1ReadModule.text(user && user.phone)
        || actorId;
    }

    const usedLogIds = new Set();
    const rowAmount = row => Number(row.get_point ?? row.point ?? row.amount ?? row.points ?? 0) || 0;
    const rowTime = row => Date.parse(String(row.created_at || row.createdAt || row.time || row.date || '').replace(' ', 'T'));
    const logTime = log => Date.parse(String(log.created_at || '').replace(' ', 'T'));
    const hasSource = row => Boolean(
      D1ReadModule.text(row.event_content || row.eventContent || row.child_shop_name || row.childShopName || row.shop_remark || row.shopRemark)
    );
    const makeDetail = (log, sourceName) => {
      const amount = Number(log.amount || 0) || 0;
      const points = Math.abs(Number(log.points || 0) || 0);
      const payable = Number(log.payable_amount || 0) || 0;
      if (D1ReadModule.text(log.mode) === 'reward') {
        return `來源：${sourceName}；消費 NT$${amount.toLocaleString('zh-TW')}，1:1 贈送 ${points.toLocaleString('zh-TW')} 點`;
      }
      return `來源：${sourceName}；消費 NT$${amount.toLocaleString('zh-TW')}，折抵 ${points.toLocaleString('zh-TW')} 點，應收 NT$${payable.toLocaleString('zh-TW')}`;
    };

    const enrichedRows = rows.map(row => {
      if (hasSource(row)) return row;
      const amount = rowAmount(row);
      const timeMs = rowTime(row);
      const matched = logs.find(log => {
        const logId = D1ReadModule.text(log.log_id);
        if (!logId || usedLogIds.has(logId)) return false;
        const points = Number(log.points || 0) || 0;
        if (points !== amount) return false;
        const lTime = logTime(log);
        if (!Number.isNaN(timeMs) && !Number.isNaN(lTime)) {
          // D1 stores CURRENT_TIMESTAMP in UTC while the point service may return Taiwan-local time.
          // Keep this wide enough for timezone differences and delayed external ledger writes.
          return Math.abs(timeMs - lTime) <= 36 * 60 * 60 * 1000;
        }
        return true;
      });
      if (!matched) return row;

      const logId = D1ReadModule.text(matched.log_id);
      usedLogIds.add(logId);
      const sourceName = actorNames[D1ReadModule.text(matched.actor_user_id)] || '店家';
      const eventContent = makeDetail(matched, sourceName);
      const originalTitle = D1ReadModule.text(row.event_name || row.eventName || row.title || row.name);
      const sourceTitle = originalTitle.includes(sourceName)
        ? originalTitle
        : `${sourceName}｜${originalTitle || (D1ReadModule.text(matched.mode) === 'reward' ? '消費贈點' : '消費折抵')}`;
      return {
        ...row,
        event_name: sourceTitle,
        eventName: sourceTitle,
        event_content: eventContent,
        eventContent,
        child_shop_name: sourceName,
        childShopName: sourceName,
        shop_remark: `source=${sourceName}; store_cashier_log=${logId}`,
        storeCashierLogId: logId
      };
    });

    const sourceRowForLog = (log) => {
      const logId = D1ReadModule.text(log.log_id);
      const sourceName = actorNames[D1ReadModule.text(log.actor_user_id)] || '店家';
      const eventContent = makeDetail(log, sourceName);
      const mode = D1ReadModule.text(log.mode);
      return {
        id: logId,
        localLedger: true,
        event_name: `${sourceName}｜${mode === 'reward' ? '消費贈點' : '消費折抵'}`,
        eventName: `${sourceName}｜${mode === 'reward' ? '消費贈點' : '消費折抵'}`,
        event_content: eventContent,
        eventContent,
        child_shop_name: sourceName,
        childShopName: sourceName,
        shop_remark: `source=${sourceName}; store_cashier_log=${logId}`,
        get_point: Number(log.points || 0) || 0,
        point: Number(log.points || 0) || 0,
        created_at: D1ReadModule.text(log.created_at),
        createdAt: D1ReadModule.text(log.created_at),
        storeCashierLogId: logId
      };
    };
    const combined = enrichedRows.concat(
      logs
        .filter(log => !usedLogIds.has(D1ReadModule.text(log.log_id)))
        .slice(0, 20)
        .map(sourceRowForLog)
    );
    return combined.sort((a, b) => {
      const at = Date.parse(String(a.created_at || a.createdAt || '').replace(' ', 'T')) || 0;
      const bt = Date.parse(String(b.created_at || b.createdAt || '').replace(' ', 'T')) || 0;
      return bt - at;
    });
  },

  async queryUserPoints(payload, env) {
    const apiKey = env.POINT_API_KEY || env.WETW_POINT_API_KEY;
    if (!apiKey) return { success: false, error: 'Missing POINT_API_KEY' };

    const lineUserId = String(payload.pointUserId || payload.pt_uid || payload.LINE_user_id || payload.authenticatedUserId || payload.userId || '').trim();
    if (!lineUserId) return { success: false, error: 'Missing LINE user id' };

    const baseBody = {
      api_key: apiKey,
      LINE_user_id: lineUserId,
      page: Math.max(1, Number(payload.page || 1)),
      per_page: 100
    };
    if (payload.shop_id || payload.shopId) baseBody.shop_id = Number(payload.shop_id || payload.shopId);
    if (payload.date_start || payload.dateStart) baseBody.date_start = String(payload.date_start || payload.dateStart);
    if (payload.date_end || payload.dateEnd) baseBody.date_end = String(payload.date_end || payload.dateEnd);

    const collectPages = async (body) => {
      const firstPage = await this.fetchPointPage(body);
      if (firstPage.error) return { error: firstPage.error, code: firstPage.code };

      const data = firstPage.data;
      const pagination = data.data?.pagination || {};
      const totalPages = Math.max(1, this.number(pagination.total_pages));
      let combinedList = Array.isArray(data.data?.list) ? data.data.list.slice() : [];

      if (totalPages > 1) {
        const seenPages = new Set([1]);
        const pages = [];
        for (let page = 2; page <= Math.min(totalPages, 20); page++) pages.push(page);
        if (totalPages > 20) {
          const tailStart = Math.max(21, totalPages - 4);
          for (let page = tailStart; page <= totalPages; page++) pages.push(page);
        }

        for (const page of pages) {
          if (seenPages.has(page)) continue;
          seenPages.add(page);
          const pageResult = await this.fetchPointPage({ ...body, page });
          if (!pageResult.error && Array.isArray(pageResult.data?.data?.list)) {
            combinedList = combinedList.concat(pageResult.data.data.list);
          }
        }
      }

      return {
        body,
        pagination,
        total: this.number(pagination.total),
        list: combinedList,
        latestBalance: this.latestBalance(combinedList),
        balanceByType: this.balancesByType(combinedList)
      };
    };

    const requestedType = String(payload.point_type || payload.pointType || '').trim();
    const typedBody = { ...baseBody, point_type: requestedType || 'gift_money' };
    const typedResult = await collectPages(typedBody);
    if (typedResult.error) return { success: false, error: typedResult.error, code: typedResult.code };

    const allTypeResult = await collectPages(baseBody);
    const balanceByType = allTypeResult.error ? typedResult.balanceByType : allTypeResult.balanceByType;
    const balance = typedResult.latestBalance;
    const enrichedList = await this.enrichPointRowsWithCashierLogs(
      env,
      lineUserId,
      typedResult.list.slice(0, baseBody.per_page)
    );

    return {
      success: true,
      data: {
        balance,
        latestBalance: typedResult.latestBalance,
        typedBalance: typedResult.latestBalance,
        allTypeBalance: allTypeResult.error ? null : allTypeResult.latestBalance,
        balanceByType,
        queriedLineUserId: lineUserId,
        sampledRows: typedResult.list.length,
        pointType: typedResult.body.point_type || 'gift_money',
        requestedPointType: typedBody.point_type,
        total: typedResult.total,
        pagination: typedResult.pagination,
        list: enrichedList
      }
    };
  }
,

  async resolvePointUserId(env, userId) {
    const id = String(userId || '').trim();
    if (!id || !env || !env.ACTMASTER_DB) return id;
    const identity = await D1ReadModule.findUserByIdentity(env, id).catch(() => null);
    const row = identity && identity.user;
    return D1ReadModule.text(row && row.point_line_id)
      || D1ReadModule.text(identity && identity.canonicalId)
      || D1ReadModule.text(row && row.line_id)
      || id;
  },

  async ensureAwardTable(env) {
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS point_awards (
        award_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '',
        card_id TEXT NOT NULL DEFAULT '',
        award_type TEXT NOT NULL DEFAULT 'card_scan_create',
        points REAL NOT NULL DEFAULT 0,
        point_type TEXT NOT NULL DEFAULT 'gift_money',
        status TEXT NOT NULL DEFAULT 'pending',
        response_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_point_awards_unique_card_scan
      ON point_awards(user_id, card_id, award_type)
      WHERE user_id <> '' AND card_id <> ''
    `).run();
  },

  taipeiDate() {
    return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  },

  async dailyCheckin(payload, env) {
    if (!env.ACTMASTER_DB) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    await this.ensureAwardTable(env);
    const rawUserId = String(payload.authenticatedUserId || payload.userId || '').trim();
    const pointUserId = await this.resolvePointUserId(env, rawUserId);
    if (!pointUserId) return { success: false, error: 'Missing userId' };

    const today = this.taipeiDate();
    const awardId = `AWD_DAILY_${pointUserId}_${today}`;
    await env.ACTMASTER_DB.prepare(`
      INSERT OR IGNORE INTO point_awards (award_id,user_id,card_id,award_type,points,point_type,status,response_json,updated_at)
      VALUES (?, ?, ?, 'daily_checkin', 10, 'gift_money', 'pending', '{}', CURRENT_TIMESTAMP)
    `).bind(awardId, pointUserId, today).run();

    const existing = await D1ReadModule.first(env, 'SELECT * FROM point_awards WHERE award_id = ? LIMIT 1', [awardId]);
    if (existing && existing.status === 'sent') {
      return { success: true, data: { awarded: false, alreadyChecked: true, points: 0, date: today, message: '今天已領取過點數家族簽到獎勵' } };
    }

    const result = await this.insertUserPoint({
      userId: pointUserId,
      points: 10,
      pointType: 'gift_money',
      eventName: '點數家族每日簽到',
      eventContent: `點數家族 ${today} 每日簽到贈點`,
      shop_remark: `daily_checkin=${today}`
    }, env);

    await env.ACTMASTER_DB.prepare(`
      UPDATE point_awards
      SET status = ?, response_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE award_id = ?
    `).bind(result && result.success ? 'sent' : 'failed', JSON.stringify(result || {}), awardId).run();

    if (!result || !result.success) {
      return { success: false, error: result && result.error ? result.error : '每日簽到贈點失敗', data: { date: today } };
    }
    return { success: true, data: { awarded: true, alreadyChecked: false, points: 10, date: today, message: '點數家族簽到成功，已獲得 10 點' } };
  },

  async findCustomerByPhone(env, phoneRaw) {
    if (!env.ACTMASTER_DB) return { match: null, error: '' };
    const phone = SecurityModule.normalizePhone(phoneRaw);
    if (phone.length < 7) return { match: null, error: '' };
    const tail = phone.slice(-9);
    const userRows = await D1ReadModule.all(env, `
      SELECT * FROM users
      WHERE phone LIKE ? OR phone LIKE ?
      ORDER BY row_id DESC
      LIMIT 20
    `, [`%${phone}%`, `%${tail}%`]).catch(() => []);
    const cardRows = await D1ReadModule.all(env, `
      SELECT * FROM card_contacts
      WHERE mobile LIKE ? OR mobile LIKE ? OR office_phone LIKE ? OR office_phone LIKE ?
      ORDER BY COALESCE(updated_at, created_at) DESC
      LIMIT 20
    `, [`%${phone}%`, `%${tail}%`, `%${phone}%`, `%${tail}%`]).catch(() => []);

    const candidates = [];
    const pushMatch = (kind, row, rawPhone) => {
      const normalized = SecurityModule.normalizePhone(rawPhone);
      if (!normalized || (normalized !== phone && !normalized.endsWith(tail) && !phone.endsWith(normalized.slice(-9)))) return;
      const id = kind === 'card'
        ? D1ReadModule.text(row.line_id)
        : D1ReadModule.text(row.line_id || row.row_id);
      if (!id) return;
      candidates.push({ kind, id, row });
    };
    userRows.forEach(row => pushMatch('user', row, row.phone));
    cardRows.forEach(row => pushMatch('card', row, row.mobile || row.office_phone));

    const canonicalMatches = [];
    for (const item of candidates) {
      const identity = await D1ReadModule.findUserByIdentity(env, item.id).catch(() => null);
      const canonicalId = D1ReadModule.text(identity && identity.canonicalId, item.id);
      const user = identity && identity.user ? identity.user : null;
      const preferredRow = user || item.row;
      if (!canonicalMatches.some(match => match.id === canonicalId)) {
        canonicalMatches.push({
          kind: user ? 'user' : item.kind,
          id: canonicalId,
          row: preferredRow
        });
      }
    }

    if (canonicalMatches.length > 1) {
      return { match: null, error: '此手機號碼對應多位用戶，請改掃 QR 或貼上 UID' };
    }
    return { match: canonicalMatches[0] || null, error: '' };
  },

  async resolveStorePointCustomer(env, rawCustomerId) {
    const raw = D1ReadModule.text(rawCustomerId);
    if (!raw) return { customerPointUserId: '', rawCustomerId: raw, identity: null, user: null, card: null };

    let matchedId = raw;
    let matchedUser = null;
    let matchedCard = null;
    const looksLikePhone = !/^U[0-9a-fA-F]{20,64}$/.test(raw) && SecurityModule.normalizePhone(raw).length >= 7;
    if (looksLikePhone) {
      const phoneMatch = await this.findCustomerByPhone(env, raw);
      if (phoneMatch.error) return { error: phoneMatch.error };
      if (phoneMatch.match) {
        matchedId = phoneMatch.match.id;
        if (phoneMatch.match.kind === 'user') matchedUser = D1ReadModule.userRow(phoneMatch.match.row);
        if (phoneMatch.match.kind === 'card') matchedCard = D1ReadModule.cardRow(phoneMatch.match.row);
      }
    }

    const customerPointUserId = await this.resolvePointUserId(env, matchedId);
    const identity = env.ACTMASTER_DB
      ? await D1ReadModule.findUserByIdentity(env, matchedId).catch(() => null)
      : null;
    const user = matchedUser || (identity && identity.user ? D1ReadModule.userRow(identity.user) : null);
    let card = matchedCard;
    if (env.ACTMASTER_DB && customerPointUserId && !card) {
      const row = await D1ReadModule.first(env, `
        SELECT * FROM card_contacts
        WHERE line_id = ? OR creator_id = ?
        ORDER BY COALESCE(updated_at, created_at) DESC
        LIMIT 1
      `, [customerPointUserId, customerPointUserId]).catch(() => null);
      card = D1ReadModule.cardRow(row);
    }

    return { customerPointUserId, rawCustomerId: raw, matchedId, identity, user, card };
  },

  async getStorePointCustomer(payload, env) {
    const rawCustomerId = String(
      payload.customerUserId ||
      payload.targetUserId ||
      payload.pointUserId ||
      payload.LINE_user_id ||
      payload.uid ||
      ''
    ).trim();
    const resolved = await this.resolveStorePointCustomer(env, rawCustomerId);
    if (resolved.error) return { success: false, error: resolved.error };
    const customerPointUserId = resolved.customerPointUserId;
    if (!customerPointUserId) return { success: false, error: 'Missing customer user id' };

    let identity = resolved.identity;
    let user = resolved.user;
    let mappedCard = resolved.card;
    if (env.ACTMASTER_DB && !mappedCard && rawCustomerId !== customerPointUserId) {
      const card = await D1ReadModule.first(env, `
          SELECT * FROM card_contacts
          WHERE line_id = ? OR creator_id = ?
          ORDER BY COALESCE(updated_at, created_at) DESC
          LIMIT 1
        `, [rawCustomerId, rawCustomerId]).catch(() => null);
      mappedCard = D1ReadModule.cardRow(card);
    }
    if (env.ACTMASTER_DB && !identity) {
      identity = await D1ReadModule.findUserByIdentity(env, customerPointUserId).catch(() => null);
      user = identity && identity.user ? D1ReadModule.userRow(identity.user) : user;
    }
    if (env.ACTMASTER_DB && !mappedCard) {
      const card = await D1ReadModule.first(env, `
        SELECT * FROM card_contacts
        WHERE line_id = ? OR creator_id = ?
        ORDER BY COALESCE(updated_at, created_at) DESC
        LIMIT 1
      `, [customerPointUserId, customerPointUserId]).catch(() => null);
      mappedCard = D1ReadModule.cardRow(card);
      if (!card && rawCustomerId !== customerPointUserId) {
        const fallbackCard = await D1ReadModule.first(env, `
          SELECT * FROM card_contacts
          WHERE line_id = ? OR creator_id = ?
          ORDER BY COALESCE(updated_at, created_at) DESC
          LIMIT 1
        `, [rawCustomerId, rawCustomerId]).catch(() => null);
        mappedCard = D1ReadModule.cardRow(fallbackCard);
      }
    }

    const wallet = await this.queryUserPoints({
      pointUserId: customerPointUserId,
      point_type: 'gift_money',
      page: 1,
      per_page: 20
    }, env);
    if (!wallet || !wallet.success) {
      return { success: false, error: wallet && wallet.error ? wallet.error : '無法取得客戶點數' };
    }

    const displayName = D1ReadModule.text(user && user.name)
      || D1ReadModule.text(mappedCard && mappedCard.name)
      || D1ReadModule.text(mappedCard && mappedCard['姓名'])
      || '未命名用戶';
    const phone = D1ReadModule.text(user && user.phone)
      || D1ReadModule.text(mappedCard && (mappedCard.mobile || mappedCard['手機號碼']));
    const industry = D1ReadModule.text(user && user.industry)
      || D1ReadModule.text(mappedCard && (mappedCard.title || mappedCard.companyName || mappedCard['職稱'] || mappedCard['公司名稱']));

    return {
      success: true,
      data: {
        customerUserId: rawCustomerId,
        customerPointUserId,
        canonicalUserId: D1ReadModule.text(identity && identity.canonicalId, customerPointUserId),
        matchedBy: rawCustomerId === customerPointUserId ? 'uid' : 'phone_or_identity',
        name: displayName,
        phone,
        industry,
        role: D1ReadModule.text(user && user.role, 'user'),
        avatarUrl: D1ReadModule.text(mappedCard && mappedCard.imageUrl),
        balance: Number(wallet.data?.balance || 0) || 0,
        pointType: 'gift_money',
        user,
        card: mappedCard
      }
    };
  },

  async ensureCashierLedgerTable(env) {
    if (!env.ACTMASTER_DB) return false;
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS store_point_cashier_logs (
        log_id TEXT PRIMARY KEY,
        actor_user_id TEXT NOT NULL DEFAULT '',
        customer_user_id TEXT NOT NULL DEFAULT '',
        customer_point_user_id TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL DEFAULT '',
        amount REAL NOT NULL DEFAULT 0,
        points REAL NOT NULL DEFAULT 0,
        payable_amount REAL NOT NULL DEFAULT 0,
        balance_before REAL NOT NULL DEFAULT 0,
        balance_after_estimate REAL NOT NULL DEFAULT 0,
        point_type TEXT NOT NULL DEFAULT 'gift_money',
        point_response_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_store_point_cashier_actor_time
      ON store_point_cashier_logs(actor_user_id, created_at)
    `).run();
    await env.ACTMASTER_DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_store_point_cashier_customer_time
      ON store_point_cashier_logs(customer_point_user_id, created_at)
    `).run();
    return true;
  },

  async storeAdjustCustomerPoints(payload, env) {
    const operatorFee = 10;
    const actorId = String(payload.authenticatedUserId || payload.userId || '').trim();
    const rawCustomerId = String(
      payload.customerUserId ||
      payload.targetUserId ||
      payload.pointUserId ||
      payload.LINE_user_id ||
      payload.uid ||
      ''
    ).trim();
    const resolvedCustomer = await this.resolveStorePointCustomer(env, rawCustomerId);
    if (resolvedCustomer.error) return { success: false, error: resolvedCustomer.error };
    const customerPointUserId = resolvedCustomer.customerPointUserId;
    const amount = Math.floor(Number(payload.amount || payload.spendAmount || payload.total || 0));
    const mode = String(payload.mode || payload.operation || 'redeem').trim().toLowerCase();

    if (!actorId) return { success: false, error: 'Missing operator user id' };
    if (!customerPointUserId) return { success: false, error: 'Missing customer user id' };
    if (!amount || amount <= 0) return { success: false, error: '消費金額必須大於 0' };

    const actorPointUserId = await this.resolvePointUserId(env, actorId);
    const actorWallet = await this.queryUserPoints({
      pointUserId: actorPointUserId,
      point_type: 'gift_money',
      page: 1,
      per_page: 20
    }, env);
    if (!actorWallet || !actorWallet.success) {
      return { success: false, error: actorWallet && actorWallet.error ? actorWallet.error : '無法取得店家操作點數' };
    }
    const actorBalance = Math.floor(Number(actorWallet.data?.balance || 0));
    if (actorBalance < operatorFee) {
      return { success: false, error: `店家操作點數不足，贈扣點功能每次需要 ${operatorFee} 點` };
    }

    const wallet = await this.queryUserPoints({
      pointUserId: customerPointUserId,
      point_type: 'gift_money',
      page: 1,
      per_page: 100
    }, env);
    if (!wallet || !wallet.success) {
      return { success: false, error: wallet && wallet.error ? wallet.error : '無法取得客戶點數' };
    }

    const balanceBefore = Math.max(0, Math.floor(Number(wallet.data?.balance || 0)));
    const isReward = mode === 'reward' || mode === 'earn' || mode === 'add';
    let points = 0;
    let payableAmount = amount;
    let eventName = '';
    let eventContent = '';
    const actorIdentity = env.ACTMASTER_DB
      ? await D1ReadModule.findUserByIdentity(env, actorId).catch(() => null)
      : null;
    const actorProfile = actorIdentity && actorIdentity.user ? D1ReadModule.userRow(actorIdentity.user) : null;
    const sourceName = D1ReadModule.text(actorProfile && actorProfile.name)
      || D1ReadModule.text(actorProfile && actorProfile.storeId)
      || D1ReadModule.text(actorProfile && actorProfile.phone)
      || actorId;
    const sourceLabel = sourceName.length > 28 ? sourceName.slice(0, 28) + '...' : sourceName;

    if (isReward) {
      points = amount;
      eventName = '店家消費贈點';
      eventContent = `來源：${sourceLabel}；消費 NT$${amount.toLocaleString('zh-TW')}，1:1 贈送 ${points.toLocaleString('zh-TW')} 點`;
    } else {
      const requestedDeduction = Math.floor(amount * 0.1);
      const deductPoints = Math.min(requestedDeduction, balanceBefore);
      if (!deductPoints || deductPoints <= 0) {
        return {
          success: false,
          error: '客戶可用點數不足，無法折抵',
          data: { amount, balanceBefore, requestedDeduction, payableAmount: amount }
        };
      }
      points = -deductPoints;
      payableAmount = Math.max(0, amount - deductPoints);
      eventName = '店家消費折抵';
      eventContent = `來源：${sourceLabel}；消費 NT$${amount.toLocaleString('zh-TW')}，折抵 ${deductPoints.toLocaleString('zh-TW')} 點，應收 NT$${payableAmount.toLocaleString('zh-TW')}`;
    }

    const operatorDebit = await this.insertUserPoint({
      userId: actorPointUserId,
      points: -operatorFee,
      pointType: 'gift_money',
      eventName: '店家點數操作扣點',
      eventContent: `執行${isReward ? '消費贈點' : '消費折抵'}，扣除 ${operatorFee} 點操作費`,
      shop_user_lineid: actorId,
      child_shop_name: sourceLabel,
      shop_remark: `source=${sourceLabel}; store_cashier_fee operator=${actorId}; customer=${customerPointUserId}; amount=${amount}; mode=${isReward ? 'reward' : 'redeem'}`
    }, env);
    if (!operatorDebit || !operatorDebit.success) {
      return { success: false, error: operatorDebit && operatorDebit.error ? operatorDebit.error : '店家操作扣點失敗，交易未送出', data: operatorDebit };
    }

    const result = await this.insertUserPoint({
      userId: customerPointUserId,
      points,
      pointType: 'gift_money',
      eventName,
      eventContent,
      shop_user_lineid: actorId,
      child_shop_name: sourceLabel,
      shop_remark: `source=${sourceLabel}; store_cashier operator=${actorId}; customer=${customerPointUserId}; amount=${amount}; mode=${isReward ? 'reward' : 'redeem'}`
    }, env);

    if (!result || !result.success) {
      await this.insertUserPoint({
        userId: actorPointUserId,
        points: operatorFee,
        pointType: 'gift_money',
        eventName: '店家點數操作退點',
        eventContent: `客戶${isReward ? '消費贈點' : '消費折抵'}寫入失敗，退回 ${operatorFee} 點操作費`,
        shop_user_lineid: actorId,
        child_shop_name: sourceLabel,
        shop_remark: `source=${sourceLabel}; store_cashier_fee_refund operator=${actorId}; customer=${customerPointUserId}; amount=${amount}; mode=${isReward ? 'reward' : 'redeem'}`
      }, env).catch(() => null);
      return { success: false, error: result && result.error ? result.error : '點數流水寫入失敗', data: result };
    }

    const changedPoints = Math.abs(points);
    const ledgerId = `SPC_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (await this.ensureCashierLedgerTable(env)) {
      await env.ACTMASTER_DB.prepare(`
        INSERT INTO store_point_cashier_logs (
          log_id, actor_user_id, customer_user_id, customer_point_user_id,
          mode, amount, points, payable_amount, balance_before, balance_after_estimate,
          point_type, point_response_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'gift_money', ?)
      `).bind(
        ledgerId,
        actorId,
        rawCustomerId,
        customerPointUserId,
        isReward ? 'reward' : 'redeem',
        amount,
        points,
        payableAmount,
        balanceBefore,
        balanceBefore + points,
        JSON.stringify(result.data || result)
      ).run();
    }

    return {
      success: true,
      data: {
        ledgerId,
        mode: isReward ? 'reward' : 'redeem',
        customerPointUserId,
        amount,
        points,
        changedPoints,
        payableAmount,
        requestedDeduction: isReward ? 0 : Math.floor(amount * 0.1),
        balanceBefore,
        balanceAfterEstimate: balanceBefore + points,
        eventName,
        eventContent,
        operatorFee,
        operatorFeeResult: operatorDebit.data || operatorDebit,
        insertResult: result.data || result
      }
    };
  },

  async listStorePointCashierLogs(payload, env) {
    if (!env.ACTMASTER_DB) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    await this.ensureCashierLedgerTable(env);

    const actorId = String(payload.authenticatedUserId || payload.userId || '').trim();
    const role = SecurityModule.normalizeRole(payload.authenticatedRole || payload.role || '');
    const limit = Math.min(50, Math.max(1, Math.floor(Number(payload.limit || 10))));
    if (!actorId) return { success: false, error: 'Missing operator user id' };

    const binds = role === 'admin' ? [limit] : [actorId, limit];
    const where = role === 'admin' ? '' : 'WHERE actor_user_id = ?';
    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM store_point_cashier_logs
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `, binds);

    const list = [];
    for (const row of rows) {
      const customerId = D1ReadModule.text(row.customer_point_user_id || row.customer_user_id);
      const identity = customerId ? await D1ReadModule.findUserByIdentity(env, customerId).catch(() => null) : null;
      const user = identity && identity.user ? D1ReadModule.userRow(identity.user) : null;
      let card = null;
      if (customerId) {
        card = await D1ReadModule.first(env, `
          SELECT * FROM card_contacts
          WHERE line_id = ? OR creator_id = ?
          ORDER BY COALESCE(updated_at, created_at) DESC
          LIMIT 1
        `, [customerId, customerId]).catch(() => null);
      }
      const mappedCard = D1ReadModule.cardRow(card);
      const customerName = D1ReadModule.text(user && user.name)
        || D1ReadModule.text(mappedCard && mappedCard.name)
        || D1ReadModule.text(row.customer_point_user_id, '客戶');
      const customerPhone = D1ReadModule.text(user && user.phone)
        || D1ReadModule.text(mappedCard && mappedCard.mobile);

      list.push({
        logId: D1ReadModule.text(row.log_id),
        actorUserId: D1ReadModule.text(row.actor_user_id),
        customerUserId: D1ReadModule.text(row.customer_user_id),
        customerPointUserId: customerId,
        customerName,
        customerPhone,
        customerAvatarUrl: D1ReadModule.text(mappedCard && mappedCard.imageUrl),
        mode: D1ReadModule.text(row.mode),
        amount: Number(row.amount || 0) || 0,
        points: Number(row.points || 0) || 0,
        payableAmount: Number(row.payable_amount || 0) || 0,
        balanceBefore: Number(row.balance_before || 0) || 0,
        balanceAfterEstimate: Number(row.balance_after_estimate || 0) || 0,
        pointType: D1ReadModule.text(row.point_type, 'gift_money'),
        createdAt: D1ReadModule.text(row.created_at)
      });
    }

    return {
      success: true,
      data: {
        role,
        scope: role === 'admin' ? 'all' : 'own_store',
        list
      }
    };
  }
};

const AIModule = {
  getOpenAIKeys(env) {
    return [
      env.OPENAI_API_KEY,
      env.OPENAI_API_KEY_2,
      env.OPENAI_API_KEY_BACKUP,
      env.OPENAI_BACKUP_API_KEY
    ].filter((key, index, list) => key && list.indexOf(key) === index);
  },

  async callOpenAI(env, body) {
    const keys = this.getOpenAIKeys(env);
    if (!keys.length) throw new Error("Missing OPENAI_API_KEY");

    let lastError = '';
    for (let i = 0; i < keys.length; i++) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + keys[i], 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.error) {
          lastError = result.error?.message || ('OpenAI HTTP ' + response.status);
          console.warn('[OpenAI fallback]', 'key', i + 1, lastError);
          continue;
        }
        if (!result.choices?.[0]?.message) {
          lastError = 'OpenAI did not return choices';
          continue;
        }
        return result;
      } catch (e) {
        lastError = e.message || String(e);
        console.warn('[OpenAI fallback]', 'key', i + 1, lastError);
      }
    }

    throw new Error(lastError || 'OpenAI request failed');
  },

  async callGemini(env, prompt, temperature = 0.2) {
    if (!env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
    const model = env.GEMINI_MODEL || 'gemini-1.5-flash';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature }
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      throw new Error(result.error?.message || ('Gemini HTTP ' + response.status));
    }
    const text = (result.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || '')
      .join('');
    if (!text) throw new Error('Gemini did not return text');
    return text;
  },

  dataUriParts(base64Image) {
    const raw = String(base64Image || '');
    const match = raw.match(/^data:([^;]+);base64,(.+)$/);
    if (match) return { mimeType: match[1] || 'image/jpeg', data: match[2] || '' };
    return { mimeType: 'image/jpeg', data: raw };
  },

  async callGeminiVision(env, base64Image, prompt, temperature = 0.2) {
    if (!env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
    const model = env.GEMINI_VISION_MODEL || env.GEMINI_MODEL;
    if (!model) throw new Error('Missing GEMINI_VISION_MODEL');
    const image = this.dataUriParts(base64Image);
    if (!image.data) throw new Error('Missing image data');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inline_data: { mime_type: image.mimeType, data: image.data } }
          ]
        }],
        generationConfig: { temperature }
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      throw new Error(result.error?.message || ('Gemini HTTP ' + response.status));
    }
    const text = (result.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || '')
      .join('');
    if (!text) throw new Error('Gemini did not return text');
    return text;
  },

  parseJsonObject(text) {
    const raw = String(text || '').replace(/```json/gi, '```');
    const fence = raw.match(/```\s*([\s\S]*?)```/);
    const source = fence && fence[1] ? fence[1] : raw;
    const jsonMatch = source.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  },

  parseJsonArray(text) {
    const raw = String(text || '').replace(/```json/gi, '```');
    const fence = raw.match(/```\s*([\s\S]*?)```/);
    const source = fence && fence[1] ? fence[1] : raw;
    const jsonMatch = source.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  },

  openAITextModel(env) {
    return env.OPENAI_TEXT_MODEL || env.OPENAI_MODEL || 'gpt-4o';
  },

  localMatchmakingFallback(query, contacts) {
    const tokens = String(query || '')
      .toLowerCase()
      .split(/[\s,，。;；、/\\|]+/)
      .map(token => token.trim())
      .filter(token => token.length >= 2);

    return contacts
      .map(contact => {
        const text = [contact.Name, contact.Company, contact.Title, contact.Tags].filter(Boolean).join(' ').toLowerCase();
        const hitCount = tokens.reduce((count, token) => count + (text.includes(token) ? 1 : 0), 0);
        const score = Math.max(55, Math.min(88, 60 + hitCount * 8));
        return {
          rowId: contact.rowId,
          score,
          reason: hitCount
            ? 'AI 暫時無法完成深度配對，先依需求關鍵字與名片標籤排序。'
            : 'AI 暫時無法完成深度配對，先提供公開配對池中的可交流名片。'
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  },

  async recognize(payload, env) {
    try {
      const uploadedImgUrl = await StorageModule.upload(payload.base64Image, env);
      const prompt = '請解析這張名片並提取資訊。支援多國語言（如英文、日文等），若無中文請直接保留原文。輸出JSON格式：{"姓名":"","英文名":"","職稱":"","公司名稱":"","手機號碼":"","公司電話":"","電子郵件":"","公司網址":"","公司地址":"","統一編號":"","分機":"","傳真":"","部門":"","社群帳號":"","服務項目":""}\n所有欄位必須是字串，保留開頭的 0。若名片上沒有清楚服務項目，請依公司名稱、職稱、地址、網站合理推估，替「服務項目」生成 3 到 5 行簡短商務介紹；每行 12 到 18 字，避免誇大，不要寫「未知」。';

      let text = '';
      let openaiError = null;
      try {
        const result = await this.callOpenAI(env, {
          model: env.OPENAI_VISION_MODEL || env.OPENAI_MODEL || 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: payload.base64Image, detail: 'high' } },
              { type: 'text', text: prompt }
            ]
          }]
        });
        text = result.choices?.[0]?.message?.content || '';
      } catch (err) {
        openaiError = err;
        console.warn('[AI OCR] GPT vision failed:', err.message);
      }

      if (!text && String(env.OCR_FALLBACK_PROVIDER || '').toLowerCase() === 'gemini') {
        try {
          console.warn('[AI fallback] recognize GPT failed, trying Gemini:', openaiError && openaiError.message);
          text = await this.callGeminiVision(env, payload.base64Image, prompt, 0.2);
        } catch (geminiError) {
          console.warn('[AI fallback] Gemini OCR failed:', geminiError.message);
          throw new Error('GPT OCR 失敗: ' + ((openaiError && openaiError.message) || '無法取得辨識結果'));
        }
      }

      if (!text) {
        throw new Error('GPT OCR 失敗: ' + ((openaiError && openaiError.message) || '無法取得辨識結果'));
      }
      
      let cardData = this.parseJsonObject(text);
      
      cardData['名片圖檔'] = uploadedImgUrl;
      
      let autoButtons = [];
      if (cardData['手機號碼']) autoButtons.push({ l: '撥打手機', u: 'tel:' + cardData['手機號碼'].replace(/[^0-9+]/g, ''), c: '#06C755' });
      if (cardData['公司電話']) autoButtons.push({ l: '撥打市話', u: 'tel:' + cardData['公司電話'].replace(/[^0-9+]/g, ''), c: '#3b82f6' });
      if (cardData['公司地址']) autoButtons.push({ l: '地圖導航', u: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(cardData['公司地址']), c: '#ef4444' });
      if (cardData['電子郵件']) autoButtons.push({ l: '發送郵件', u: 'mailto:' + cardData['電子郵件'], c: '#f59e0b' });
      if (cardData['公司網址']) {
          let url = cardData['公司網址'].trim();
          if (!url.startsWith('http')) url = 'https://' + url;
          autoButtons.push({ l: '官方網站', u: url, c: '#64748b' });
      }
      
      const config = {
        cardType: 'v1', imgUrl: uploadedImgUrl, title: cardData['姓名'] || cardData['英文名'] || '數字名片',
        desc: cardData['服務項目'] || cardData['職稱'] || cardData['公司名稱'] || '',
        buttons: autoButtons, isPrivate: false, descAlign: 'center', descColor: '#666666'
      };
      cardData['自訂名片設定'] = JSON.stringify(config);
      
      return { success: true, data: cardData };
    } catch (e) {
      return { success: false, error: "AI 辨識失敗: " + e.message };
    }
  },

  async matchmaking(payload, env) {
    try {
      const { currentUser, query, contacts } = payload;
      const safeContacts = (Array.isArray(contacts) ? contacts : []).filter(c => {
        const visibility = String(c.visibility || '').toLowerCase();
        const sourceType = String(c.sourceType || '').toLowerCase();
        const poolEligible = c.poolEligible === true || c.poolEligible === 1 || c.poolEligible === '1' || c.poolEligible === 'true';
        const isPrivate = c.isPrivate === true || visibility === 'private';
        return !isPrivate && visibility === 'public' && poolEligible && sourceType === 'self_profile';
      });
      if (!safeContacts.length) return { success: false, error: '目前沒有可配對的公開名片' };
      const contactsList = safeContacts.map((c, i) => `${i+1}. ${c.Name||'未知'} (${c.Company||'無'}) \n標籤: ${c.Tags||'無'}`).join('\n');
      const prompt = `尋求者：${currentUser.name}，需求：${query}\n候選人：\n${contactsList}\n請選前3位，返回純 JSON 陣列: [{"index":0,"score":95,"reason":"結合標籤與需求，給出20字內的推薦理由"}]`;
      
      let items = [];
      try {
        const result = await this.callOpenAI(env, { model: this.openAITextModel(env), messages: [{ role: 'user', content: prompt }], temperature: 0.2 });
        items = this.parseJsonArray(result.choices?.[0]?.message?.content || '[]');
      } catch (aiError) {
        console.warn('[AI matchmaking] GPT failed, using local fallback:', aiError.message);
        return { success: true, data: this.localMatchmakingFallback(query, safeContacts), fallback: true };
      }

      const used = new Set();
      const matches = items.map(item => {
        let index = Number(item.index);
        if (!Number.isFinite(index)) index = Number(item.no || item.number || item.id);
        if (!Number.isFinite(index)) return null;
        const zeroBased = index > 0 ? index - 1 : index;
        const contact = safeContacts[zeroBased] || safeContacts[index];
        if (!contact || used.has(contact.rowId)) return null;
        used.add(contact.rowId);
        return {
          rowId: contact.rowId,
          score: Math.max(0, Math.min(100, Number(item.score || 0) || 0)),
          reason: String(item.reason || '符合您的配對需求').slice(0, 80)
        };
      }).filter(Boolean);
      return { success: true, data: matches.length ? matches : this.localMatchmakingFallback(query, safeContacts), fallback: matches.length === 0 };
    } catch (e) { return { success: false, error: e.message }; }
  },

  async reviewCardSafety(payload, env) {
    try {
      const card = payload.card || {};
      const prompt = `你是名片公開搜尋前的安全審核員。請檢查文字與圖片是否包含色情、性交易、裸露暗示、犯罪、詐騙、毒品、武器、賭博、暴力或其他高風險內容。
只回傳純 JSON，不要解釋在 JSON 外。
格式：{"pass":true,"riskLevel":"low","reasons":[],"suggestions":[]}
若有疑慮 pass=false，reasons 用繁體中文列出原因，suggestions 提供可修改方向。
名片資料：${JSON.stringify(card).slice(0, 6000)}`;
      const content = [{ type: 'text', text: prompt }];
      if (card.imageUrl && /^https?:\/\//i.test(card.imageUrl)) {
        content.push({ type: 'image_url', image_url: { url: card.imageUrl, detail: 'low' } });
      }

      let text = '';
      try {
        const result = await this.callOpenAI(env, { model: 'gpt-4o', messages: [{ role: 'user', content }], temperature: 0 });
        text = result.choices?.[0]?.message?.content || '{}';
      } catch (openaiError) {
        console.warn('[AI fallback] reviewCardSafety OpenAI failed, trying Gemini:', openaiError.message);
        text = await this.callGemini(env, prompt, 0);
      }
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const data = jsonMatch ? JSON.parse(jsonMatch[0]) : { pass: false, reasons: ['AI 健檢沒有回傳有效結果'], suggestions: ['請稍後再試'] };
      return { success: true, data };
    } catch (e) {
      return { success: false, error: 'AI 名片健檢失敗: ' + e.message };
    }
  },

  async generateCardCopy(payload, env) {
    try {
      const card = payload.card || {};
      const brief = payload.brief || '';
      const prompt = `你是商務名片文案顧問。請根據名片資料與使用者補充，產生適合數位名片的服務介紹。
要求：
1. 使用繁體中文。
2. 4 到 5 行，每行盡量 16 字內。
3. 具體、可信、不要誇大療效或保證收益。
4. 不得產生色情、犯罪、詐騙、賭博、毒品、武器等違規內容。
只回傳純 JSON：{"service":"第一行\\n第二行\\n第三行","headline":"","tips":[]}
名片資料：${JSON.stringify(card).slice(0, 5000)}
補充需求：${brief}`;

      let text = '';
      try {
        const result = await this.callOpenAI(env, { model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], temperature: 0.7 });
        text = result.choices?.[0]?.message?.content || '{}';
      } catch (openaiError) {
        console.warn('[AI fallback] generateCardCopy OpenAI failed, trying Gemini:', openaiError.message);
        text = await this.callGemini(env, prompt, 0.7);
      }
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      return { success: true, data };
    } catch (e) {
      return { success: false, error: 'AI 名片代寫失敗: ' + e.message };
    }
  },

  async fateTags(payload, env) {
    try {
      const prompt = `你是一位專業的商務AI心理與命理分析專家。請根據以下資料（姓名用字、手機號碼頻率與尾數、生日），進行深度商務人格分析。
姓名：${payload.Name || '未知'}
手機：${payload.Mobile || '未知'}
生日：${payload.Birthday || '未知'}
公司：${payload.Company || '未知'}
職稱：${payload.Title || '未知'}

分析邏輯與必含維度參考：
1. 姓名：字形判斷行動/思考型，發音判斷外向/內斂，結構判斷主導/依附。
2. 手機號碼：數字頻率(1領導,2協調...9理想)，尾數判斷決策模式(快攻/慢養)，奇偶比判斷衝動/保守。
3. 生日（若有填寫）：請立即啟動並融合「八字」、「紫微斗數」、「生命靈數」與「東西方星座學」的運算模型，疊加分析其先天命格、潛能與流年運勢。
4. 【重點要求】分析結果必須明確判斷並結合以下商務特徵：
   - 感官接收偏好 (VAK)：視覺型、聽覺型、或觸覺型。
   - 思考與決策模式：分析型、數據型、或直覺型。
   - 行為與風險偏好：積極/消極、冒險/保守。

【強制要求】：請輸出純 JSON 格式。五大維度（Personality, Hobbies, Wealth, Health, Career）的值，每個都「必須」是一段 20 到 40 字的完整情境描述，請直接給出具體特徵與商務應對建議（例如：此人為視覺數據型，決策保守，建議提供圖表數據...），絕對不要只給單詞。
JSON格式：{"Personality":"","Hobbies":"","Wealth":"","Health":"","Career":""}`;

      const result = await this.callOpenAI(env, { model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] });
      const jsonMatch = result.choices[0].message.content.match(/\{[\s\S]*\}/);
      return { success: true, data: jsonMatch ? JSON.parse(jsonMatch[0]) : {} };
    } catch (e) { return { success: false, error: e.message }; }
  }
};

// ==================== 模組 4: 訊息構建 (Messaging Module) ====================
const MessagingModule = {
  buildFlex(payload) {
    const { card, config, referrerId, networkId, liffId } = payload;
    
    const activeLiffId = liffId || '1660923784-vViMTZ1y';
    let badgeUrl = 'https://liff.line.me/' + activeLiffId + '?shareCardId=' + card.rowId;
    if (referrerId) badgeUrl += '&ref=' + referrerId;
    if (networkId) badgeUrl += '&net=' + networkId;
    const shareActionUrl = badgeUrl + '&share=1';

    const layoutStyle = String(config.layoutStyle || config.layout || 'landscape').trim();
    const imgUrl = (
      layoutStyle === 'portrait' ? (config.imgUrlPortrait || config.imgUrl || card['名片圖檔']) :
      layoutStyle === 'square' ? (config.imgUrlSquare || config.imgUrl || card['名片圖檔']) :
      (config.imgUrl || config.imgUrlLandscape || card['名片圖檔'])
    ) || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80';
    const aspectRatio = layoutStyle === 'portrait'
      ? (config.imgRatioPortrait || '2:3')
      : (layoutStyle === 'square' ? (config.imgRatioSquare || '1:1') : (config.imgRatioLandscape || '20:13'));
    const bubbleSize = layoutStyle === 'portrait' ? 'giga' : 'mega';
    
    let buttons = (config.buttons || []).map(b => ({ l: b.l, u: Utils.cleanURI(b.u), c: b.c }))
      .filter(b => b.l && b.u)
      .map(btn => ({
        type: "button", style: "primary", color: btn.c || "#06C755", height: "sm",
        action: { type: "uri", label: btn.l.substring(0, 40), uri: btn.u }
      }));

    let hero = { type: "image", url: imgUrl, size: "full", aspectRatio: aspectRatio, aspectMode: "cover", action: { type: "uri", uri: badgeUrl } };
    if (config.cardType === 'video' && config.videoUrl) {
      hero = { type: "video", url: config.videoUrl, previewUrl: imgUrl, aspectRatio: aspectRatio, altContent: { type: "image", size: "full", aspectRatio: aspectRatio, aspectMode: "cover", url: imgUrl, action: { type: "uri", uri: badgeUrl } } };
    }

    const titleText = (config.title || card['姓名'] || ' ').trim() || ' ';
    const descText = (config.desc || card['服務項目'] || ' ').trim() || ' ';

    return {
      type: "bubble", size: bubbleSize,
      header: {
        type: "box", layout: "horizontal", justifyContent: "flex-end", paddingAll: "8px",
        contents: [{
          type: "box", layout: "vertical", justifyContent: "center", backgroundColor: "#FF0000", width: "65px", height: "25px", cornerRadius: "25px",
          contents: [{ type: "text", text: "分享", weight: "bold", align: "center", color: "#FFFFFF", size: "xs" }],
          action: { type: "uri", uri: shareActionUrl }
        }]
      },
      hero: hero,
      body: {
        type: "box", layout: "vertical", paddingAll: "15px",
        contents: [
          { type: "text", text: titleText, weight: "bold", size: "xl", align: "center", wrap: true },
          { type: "text", text: descText, size: "sm", margin: "md", color: config.descColor || "#666666", wrap: true, align: config.descAlign || "center" }
        ]
      },
      footer: buttons.length > 0 ? { type: "box", layout: "vertical", spacing: "sm", paddingAll: "10px", contents: buttons } : undefined
    };
  }
};

// ==================== 模組 5: 資料庫轉發 (Database Module) ====================
const DBModule = {
  async forward(action, payload, env) {
    try {
      const response = await fetch(env.GAS_WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload })
      });
      if (response.status === 302) {
        const loc = response.headers.get('location');
        const res2 = await fetch(loc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) });
        return await res2.json();
      }
      return await response.json();
    } catch (e) { return { success: false, error: "GAS Connection Failed" }; }
  }
};

const D1BackfillModule = {
  listFromResult(result, keys = []) {
    if (Array.isArray(result)) return result;
    if (!result || typeof result !== 'object') return [];
    for (const key of ['data', 'rows', 'items', ...keys]) {
      if (Array.isArray(result[key])) return result[key];
    }
    return [];
  },

  str(value) {
    return String(value ?? '').trim();
  },

  boolInt(value) {
    if (value === true) return 1;
    const text = String(value ?? '').trim().toLowerCase();
    return ['true', '1', 'yes', 'y', '已綁定', '已公開'].includes(text) ? 1 : 0;
  },

  json(value) {
    try { return JSON.stringify(value ?? {}); } catch (e) { return '{}'; }
  },

  id(prefix, row, index) {
    return this.str(row.rowId || row.id || row.ID || row[`${prefix}ID`] || row['活動ID'] || row['報名ID']) ||
      `${prefix}_${Date.now()}_${index}`;
  },

  normalizeUser(row, index) {
    const userId = this.str(row.userId || row['LINE ID'] || row.lineId || row['User ID']);
    if (!userId) return null;
    return {
      user_id: userId,
      line_id: userId,
      name: this.str(row.name || row['姓名'] || row.displayName || '待補資料'),
      phone: this.str(row.phone || row['手機'] || row['手機號碼']),
      industry: this.str(row.industry || row['主要業種'] || row.title || row['職稱']),
      birthday: this.str(row.birthday || row['出生年月日']),
      company_name: this.str(row.companyName || row.company || row['公司名稱']),
      title: this.str(row.title || row['職稱']),
      role: this.str(row.role || row['權限級別'] || 'user').toLowerCase(),
      network_id: this.str(row.networkId || row['歸屬網'] || 'admin') || 'admin',
      store_id: this.str(row.storeid || row.storeId || row['店代碼']),
      referrer_id: this.str(row.referrerId || row['推薦人']),
      profile_status: this.str(row.profileStatus || row.status || 'active'),
      source: this.str(row.source || 'gas_backfill'),
      claimed_card_id: this.str(row.claimedCardRowId || row.claimRowId),
      socials_json: this.str(row.socials) || '[]',
      telegram_token: this.str(row.tgToken),
      telegram_chat_id: this.str(row.tgChatId),
      raw_json: this.json(row)
    };
  },

  normalizeUserFromCard(card) {
    const userId = this.str(card['LINE ID'] || card.userId || card.lineId || card['User ID']);
    if (!userId) return null;
    return this.normalizeUser({
      userId,
      name: card['姓名'] || card['英文名'] || '待補資料',
      phone: card['手機號碼'] || card['公司電話'] || '',
      industry: card['職稱'] || card['公司名稱'] || '已綁定名片',
      companyName: card['公司名稱'] || '',
      title: card['職稱'] || '',
      role: 'user',
      networkId: card['歸屬網'] || 'admin',
      profileStatus: 'bound_card',
      source: 'bound_card',
      claimedCardRowId: card.rowId || card.id || ''
    });
  },

  normalizeCard(row, index) {
    const cfgRaw = this.str(row['自訂名片設定'] || row['電子名片設定'] || row.cardConfig || row.config);
    let cfg = {};
    try { cfg = cfgRaw ? JSON.parse(cfgRaw) : {}; } catch (e) {}
    const cardId = this.str(row.rowId || row.id || row['Row ID']) || `CARD_${Date.now()}_${index}`;
    const owner = this.str(row['LINE ID'] || row.userId || row.lineId || row['User ID']);
    return {
      card_id: cardId,
      owner_user_id: owner,
      creator_user_id: this.str(row.creatorId || row['建檔者ID']),
      network_id: this.str(row.networkId || row['歸屬網'] || 'admin') || 'admin',
      name: this.str(row['姓名'] || row.name),
      english_name: this.str(row['英文名']),
      company_name: this.str(row['公司名稱']),
      title: this.str(row['職稱']),
      department: this.str(row['部門']),
      mobile: this.str(row['手機號碼'] || row['手機']),
      company_phone: this.str(row['公司電話']),
      extension: this.str(row['分機']),
      fax: this.str(row['傳真']),
      email: this.str(row['電子郵件']),
      website: this.str(row['公司網址']),
      address: this.str(row['公司地址']),
      tax_id: this.str(row['統一編號']),
      social_accounts: this.str(row['社群帳號']),
      service: this.str(row['服務項目'] || cfg.desc),
      note: this.str(row['建檔人/備註']),
      image_url: this.str(row['名片圖檔'] || cfg.imgUrl),
      config_json: cfgRaw || this.json(cfg),
      tags: this.str(row['標籤']),
      is_bound: owner ? 1 : 0,
      is_private: this.boolInt(cfg.isPrivate),
      template_draft: this.boolInt(cfg.templateDraft),
      safety_status: cfg.safetyReview ? (cfg.safetyReview.pass ? 'passed' : 'failed') : 'pending',
      source: this.str(row.source || 'gas_backfill'),
      raw_json: this.json(row)
    };
  },

  normalizeActivity(row, index) {
    const activityId = this.str(row.activityId || row['活動ID'] || row.rowId || row.id) || `ACT_${Date.now()}_${index}`;
    return {
      activity_id: activityId,
      owner_user_id: this.str(row.userId || row.ownerUserId || row['建立者ID']),
      network_id: this.str(row.networkId || row['歸屬網'] || 'admin') || 'admin',
      name: this.str(row.activityName || row['活動名稱'] || row.name || '未命名活動'),
      type: this.str(row.activityType || row['活動類型'] || '例會'),
      default_identity: this.str(row.defaultIdentity || row['預設身份'] || '會員'),
      fee_type: this.str(row.feeType || row['收費方式'] || '免費'),
      price: Number(row.price || row['金額'] || 0) || 0,
      start_time: this.str(row.startTime || row['開始時間']),
      end_time: this.str(row.endTime || row['結束時間']),
      description: this.str(row.description || row['活動說明']),
      image_url: this.str(row.imageUrl || row['宣傳圖']),
      status: this.str(row.status || row['狀態'] || 'published'),
      is_batch: this.boolInt(row.isBatch || row['是否系列']),
      parent_activity_id: this.str(row.parentActivityId || row['父活動ID']),
      nfc_checkin_start: this.str(row.nfcCheckinStart || row['NFC簽到開始']),
      nfc_checkin_end: this.str(row.nfcCheckinEnd || row['NFC簽到結束']),
      nfc_same_day_only: row.nfcCheckinSameDayOnly === false ? 0 : 1,
      raw_json: this.json(row)
    };
  },

  normalizeRegistration(row, activityId, index) {
    const regId = this.str(row.registrationId || row.rowId || row.id || row['報名ID']) || `REG_${activityId}_${index}`;
    return {
      registration_id: regId,
      activity_id: this.str(row.activityId || row['活動ID'] || activityId),
      user_id: this.str(row.userId || row['LINE ID']),
      name: this.str(row.name || row['姓名'] || row.userName),
      phone: this.str(row.phone || row['手機'] || row['手機號碼'] || row.userPhone),
      identity: this.str(row.identity || row['身份'] || row['預設身份'] || '會員'),
      payment_status: this.str(row.paymentStatus || row['繳費狀態']),
      checkin_status: this.boolInt(row.checkinStatus || row['簽到']),
      checked_in_at: this.str(row.checkedInAt || row['簽到時間']),
      cancelled_at: this.str(row.cancelledAt || row['取消時間']),
      raw_json: this.json(row)
    };
  },

  async upsertUser(env, user) {
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO users (row_id,line_id,name,industry,phone,birthday,socials,role,store_id,referrer_id,network_id,tg_token,tg_chat_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(line_id) DO UPDATE SET
        name=excluded.name,industry=excluded.industry,phone=excluded.phone,birthday=excluded.birthday,socials=excluded.socials,
        role=CASE
          WHEN users.role = 'admin' OR excluded.role = 'admin' THEN 'admin'
          WHEN users.role = 'store' OR excluded.role = 'store' THEN 'store'
          ELSE excluded.role
        END,
        store_id=excluded.store_id,referrer_id=excluded.referrer_id,network_id=excluded.network_id,
        tg_token=excluded.tg_token,tg_chat_id=excluded.tg_chat_id
    `).bind(user.user_id,user.line_id,user.name,user.industry,user.phone,user.birthday,user.socials_json,user.role,user.store_id,user.referrer_id,user.network_id,user.telegram_token,user.telegram_chat_id).run();
  },

  async upsertCard(env, card) {
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO card_contacts (row_id,line_id,name,english_name,company_name,title,department,tax_id,mobile,office_phone,extension,fax,email,website,socials,address,services,notes,creator_id,image_url,custom_config,network_id,tags,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(row_id) DO UPDATE SET
        line_id=excluded.line_id,name=excluded.name,english_name=excluded.english_name,company_name=excluded.company_name,title=excluded.title,
        department=excluded.department,tax_id=excluded.tax_id,mobile=excluded.mobile,office_phone=excluded.office_phone,
        extension=excluded.extension,fax=excluded.fax,email=excluded.email,website=excluded.website,socials=excluded.socials,
        address=excluded.address,services=excluded.services,notes=excluded.notes,creator_id=excluded.creator_id,
        image_url=excluded.image_url,custom_config=excluded.custom_config,network_id=excluded.network_id,tags=excluded.tags,updated_at=CURRENT_TIMESTAMP
    `).bind(card.card_id,card.owner_user_id,card.name,card.english_name,card.company_name,card.title,card.department,card.tax_id,card.mobile,card.company_phone,card.extension,card.fax,card.email,card.website,card.social_accounts,card.address,card.service,card.note,card.creator_user_id,card.image_url,card.config_json,card.network_id,card.tags).run();
  },

  async upsertActivity(env, activity) {
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO activities (activity_id,name,type,fee_type,price,start_time,end_time,description,image_url,creator_id,status,is_series)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(activity_id) DO UPDATE SET
        name=excluded.name,type=excluded.type,fee_type=excluded.fee_type,price=excluded.price,start_time=excluded.start_time,
        end_time=excluded.end_time,description=excluded.description,image_url=excluded.image_url,creator_id=excluded.creator_id,
        status=excluded.status,is_series=excluded.is_series
    `).bind(activity.activity_id,activity.name,activity.type,activity.fee_type,activity.price,activity.start_time,activity.end_time,activity.description,activity.image_url,activity.owner_user_id,activity.status,activity.is_batch).run();
  },

  async upsertRegistration(env, reg) {
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO registrants (row_id,line_id,activity_name,name,phone,identity,checked_in,payment_status,activity_id,nfc_checkin_time)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(row_id) DO UPDATE SET
        line_id=excluded.line_id,activity_name=excluded.activity_name,name=excluded.name,phone=excluded.phone,identity=excluded.identity,
        checked_in=excluded.checked_in,payment_status=excluded.payment_status,activity_id=excluded.activity_id,nfc_checkin_time=excluded.nfc_checkin_time
    `).bind(reg.registration_id,reg.user_id,'',reg.name,reg.phone,reg.identity,reg.checkin_status,reg.payment_status,reg.activity_id,reg.checked_in_at).run();
  },

  assertCanWrite(payload, env) {
    if (payload.dryRun !== false) return;
    if (!env.MIGRATION_TOKEN || payload.migrationToken !== env.MIGRATION_TOKEN) {
      throw new Error('Missing or invalid MIGRATION_TOKEN');
    }
    if (payload.confirm !== 'BACKFILL_D1') throw new Error('Missing confirm=BACKFILL_D1');
  },

  async backfillFromGas(payload, env) {
    if (!env.ACTMASTER_DB) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    this.assertCanWrite(payload || {}, env);

    const dryRun = payload.dryRun !== false;
    const includeRegistrations = payload.includeRegistrations === true;
    const summary = { dryRun, users: 0, boundUsers: 0, cards: 0, activities: 0, registrations: 0, errors: [] };

    const users = this.listFromResult(await DBModule.forward('getAllUsers', {}, env));
    for (let i = 0; i < users.length; i++) {
      const user = this.normalizeUser(users[i], i);
      if (!user) continue;
      summary.users++;
      if (!dryRun) await this.upsertUser(env, user);
    }

    const cards = this.listFromResult(await DBModule.forward('getCardContacts', { role: 'admin', networkId: 'admin' }, env));
    const seenUsers = new Set(users.map(u => this.str(u.userId || u['LINE ID'] || u.lineId)).filter(Boolean));
    for (let i = 0; i < cards.length; i++) {
      const card = this.normalizeCard(cards[i], i);
      if (!card.card_id) continue;
      summary.cards++;
      if (!dryRun) await this.upsertCard(env, card);

      const boundUser = this.normalizeUserFromCard(cards[i]);
      if (boundUser && !seenUsers.has(boundUser.user_id)) {
        seenUsers.add(boundUser.user_id);
        summary.boundUsers++;
        if (!dryRun) await this.upsertUser(env, boundUser);
      }
    }

    const activities = this.listFromResult(await DBModule.forward('getPublicActivities', {}, env), ['activities']);
    for (let i = 0; i < activities.length; i++) {
      const activity = this.normalizeActivity(activities[i], i);
      if (!activity.activity_id) continue;
      summary.activities++;
      if (!dryRun) await this.upsertActivity(env, activity);

      if (includeRegistrations) {
        try {
          const regs = this.listFromResult(await DBModule.forward('getActivityRegistrants', { activityId: activity.activity_id }, env), ['registrations']);
          for (let r = 0; r < regs.length; r++) {
            const reg = this.normalizeRegistration(regs[r], activity.activity_id, r);
            if (!reg.registration_id || !reg.activity_id) continue;
            summary.registrations++;
            if (!dryRun) await this.upsertRegistration(env, reg);
          }
        } catch (e) {
          summary.errors.push({ activityId: activity.activity_id, error: e.message });
        }
      }
    }

    return { success: true, data: summary };
  }
};

// ==================== 模組 6: 邊緣快取驗證 (Edge Auth KV Module) ====================
const D1ReadModule = {
  cardAccessSchemaReady: false,

  hasD1(env) {
    return !!(env && env.ACTMASTER_DB);
  },

  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  role(value) {
    const next = this.text(value, 'user').toLowerCase();
    if (next === 'admin' || next === '總管') return 'admin';
    if (next === 'store' || next === 'tenant' || next === '店長' || next === '租戶') return 'store';
    return 'user';
  },

  jsonObject(value) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : (value || {});
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};
    }
  },

  async ensureCardAccessColumns(env) {
    if (!this.hasD1(env) || this.cardAccessSchemaReady) return;
    const alters = [
      "ALTER TABLE card_contacts ADD COLUMN owner_user_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN profile_user_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN source_type TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN visibility TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN pool_eligible INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE card_contacts ADD COLUMN ai_review_status TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN crm_status TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN crm_type TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN crm_next_action TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN crm_next_followup_at TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE card_contacts ADD COLUMN crm_ai_suggestion TEXT NOT NULL DEFAULT ''"
    ];
    for (const sql of alters) {
      try {
        await env.ACTMASTER_DB.prepare(sql).run();
      } catch (e) {
        const msg = String(e && e.message || e).toLowerCase();
        if (!msg.includes('duplicate column')) throw e;
      }
    }
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_card_contacts_owner ON card_contacts(owner_user_id)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_card_contacts_profile ON card_contacts(profile_user_id)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_card_contacts_pool ON card_contacts(pool_eligible, visibility)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_card_contacts_crm_status ON card_contacts(owner_user_id, crm_status, updated_at)').run();
    this.cardAccessSchemaReady = true;
  },

  async first(env, sql, binds = []) {
    const stmt = env.ACTMASTER_DB.prepare(sql);
    return binds.length ? await stmt.bind(...binds).first() : await stmt.first();
  },

  async all(env, sql, binds = []) {
    const stmt = env.ACTMASTER_DB.prepare(sql);
    const result = binds.length ? await stmt.bind(...binds).all() : await stmt.all();
    return result && Array.isArray(result.results) ? result.results : [];
  },

  async getIdentityLink(env, userId) {
    const id = this.text(userId);
    if (!id) return null;
    try {
      return await this.first(env, `
        SELECT * FROM user_identity_links
        WHERE (new_line_id = ? OR old_line_id = ?)
          AND status IN ('active', 'replaced')
        ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, updated_at DESC, id DESC
        LIMIT 1
      `, [id, id]);
    } catch (e) {
      return null;
    }
  },

  async identityIdsForUser(env, userId) {
    const ids = [];
    const add = value => {
      const id = this.text(value);
      if (id && !ids.includes(id)) ids.push(id);
    };
    add(userId);
    const link = await this.getIdentityLink(env, userId).catch(() => null);
    if (link) {
      add(link.new_line_id);
      add(link.old_line_id);
    }
    return ids;
  },

  async findUserByIdentity(env, userId) {
    const id = this.text(userId);
    if (!id) return { user: null, link: null, canonicalId: '' };
    const link = await this.getIdentityLink(env, id);
    const ids = [];
    const addId = value => {
      const next = this.text(value);
      if (next && !ids.includes(next)) ids.push(next);
    };
    addId(link && link.new_line_id);
    addId(id);
    addId(link && link.old_line_id);

    for (const candidate of ids) {
      const user = await this.first(env, `
        SELECT * FROM users
        WHERE line_id = ? OR row_id = ? OR point_line_id = ? OR legacy_line_id = ?
        LIMIT 1
      `, [candidate, candidate, candidate, candidate]);
      if (user) {
        return {
          user,
          link,
          canonicalId: this.text(link && link.new_line_id, this.text(user.line_id || user.row_id, candidate))
        };
      }
    }
    return { user: null, link, canonicalId: this.text(link && link.new_line_id, id) };
  },

  userRow(row, source = 'd1_user') {
    if (!row) return null;
    const userId = this.text(row.line_id || row.row_id);
    if (!userId) return null;
    const role = SecurityModule.sanitizeRole(userId, row.role, row);
    const networkId = SecurityModule.effectiveNetworkId(userId, role, row);
    const socials = this.jsonObject(row.socials);
    const dealerProfile = socials.dealerProfile && typeof socials.dealerProfile === 'object' ? socials.dealerProfile : {};
    return {
      rowId: this.text(row.row_id, userId),
      userId,
      lineId: userId,
      name: this.text(row.name, '未命名'),
      phone: this.text(row.phone),
      industry: this.text(row.industry || row.title || row.company_name),
      birthday: this.text(row.birthday),
      role,
      roleLabel: role === 'admin' ? '總管' : (role === 'store' ? '店長' : '一般'),
      storeid: this.text(row.store_id),
      storeId: this.text(row.store_id),
      referrerId: this.text(row.referrer_id),
      networkId,
      tgToken: this.text(row.tg_token),
      tgChatId: this.text(row.tg_chat_id),
      legacyLineId: this.text(row.legacy_line_id),
      pointLineId: this.text(row.point_line_id),
      identitySource: this.text(row.identity_source),
      migratedAt: this.text(row.migrated_at),
      socials: this.text(row.socials),
      dealerProfile,
      kycStatus: this.text(dealerProfile.kycStatus),
      dealerType: this.text(dealerProfile.dealerType),
      taxId: this.text(dealerProfile.taxId),
      legalCompanyName: this.text(dealerProfile.legalCompanyName),
      points: Number(row.points || 0) || 0,
      source,
      profileStatus: source === 'bound_card' ? 'bound_card' : 'active'
    };
  },

  inferCardAccess(row, options = {}) {
    const cfg = this.jsonObject(row && (row.custom_config || row.customConfig || row['自訂名片設定']));
    const creatorId = this.text(row && (row.creator_id || row.creatorId || row['建檔者ID']));
    const lineId = this.text(row && (row.line_id || row.lineId || row['LINE ID']));
    const actorId = this.text(options.actorId);
    const ownerUserId = this.text(row && (row.owner_user_id || row.ownerUserId), creatorId || actorId || lineId);
    const profileUserId = this.text(row && (row.profile_user_id || row.profileUserId), lineId);
    const explicitSource = this.text(row && (row.source_type || row.sourceType || cfg.sourceType));
    const explicitVisibility = this.text(row && (row.visibility || cfg.visibility)).toLowerCase();
    const safetyStatus = this.text(row && (row.ai_review_status || row.aiReviewStatus), cfg.safetyReview ? (cfg.safetyReview.pass ? 'passed' : 'failed') : '');
    const isSelfProfile = explicitSource === 'self_profile'
      || (!!lineId && !!creatorId && lineId === creatorId)
      || (!!lineId && !!ownerUserId && lineId === ownerUserId && (cfg.templateVersion || cfg.cardType || cfg.buttons));
    const sourceType = explicitSource || (isSelfProfile ? 'self_profile' : 'private_import');
    const cfgPrivate = cfg.isPrivate === true || cfg.private === true;
    const visibility = explicitVisibility || ((isSelfProfile && !cfgPrivate) ? 'public' : 'private');
    const hasStoredAccess = !!(explicitSource || explicitVisibility || this.text(row && row.ai_review_status));
    const storedPool = hasStoredAccess && row && row.pool_eligible !== undefined && row.pool_eligible !== null && String(row.pool_eligible).trim() !== ''
      ? Number(row.pool_eligible) === 1
      : null;
    const aiPassed = safetyStatus ? safetyStatus === 'passed' : true;
    const poolEligible = storedPool !== null
      ? storedPool
      : !!(isSelfProfile && visibility === 'public' && !cfg.templateDraft && aiPassed);
    return {
      ownerUserId,
      profileUserId,
      sourceType,
      visibility,
      poolEligible,
      aiReviewStatus: safetyStatus || (aiPassed ? 'passed' : 'pending'),
      isPrivate: visibility !== 'public',
      isSelfProfile
    };
  },

  inferCrmType(row) {
    const text = [
      row && row.title,
      row && row.company_name,
      row && row.department,
      row && row.services,
      row && row.notes,
      row && row.tags
    ].map(v => this.text(v).toLowerCase()).join(' ');
    if (!text.trim()) return '待判斷';
    if (/保險|房仲|不動產|地產|租|建設|投資|理財|貸款|金融/.test(text)) return '潛在客戶';
    if (/董事|總經理|負責人|創辦|店長|經理|協會|理事|主任|總監/.test(text)) return '合作夥伴';
    if (/通路|行銷|媒體|廣告|社群|電商|直播|業務|銷售/.test(text)) return '通路資源';
    if (/教育|講師|顧問|課程|教練|培訓/.test(text)) return '課程合作';
    if (/供應|製造|印刷|設計|工程|系統|開發|科技/.test(text)) return '供應商';
    return '待判斷';
  },

  inferCrmNextAction(row, crmType) {
    const phone = this.text(row && (row.mobile || row.office_phone));
    if (!phone) return '補齊聯絡方式';
    if (crmType === '通路資源') return '傳送合作說明';
    if (crmType === '課程合作') return '邀請課程或訪談';
    if (crmType === '合作夥伴') return '安排 1 對 1 訪談';
    if (crmType === '供應商') return '詢問合作條件';
    return '初次聯繫';
  },

  inferCrmSuggestion(row, crmType, nextAction) {
    const name = this.text(row && row.name, '此客戶');
    const company = this.text(row && row.company_name);
    const title = this.text(row && row.title);
    const identity = [company, title].filter(Boolean).join(' / ');
    if (crmType === '待判斷') return `${name}${identity ? '（' + identity + '）' : ''}已建立，建議先補上備註與客戶類型，再安排下一步。`;
    return `${name}${identity ? '（' + identity + '）' : ''}被歸類為${crmType}，建議下一步：${nextAction}。`;
  },

  cardRow(row) {
    if (!row) return null;
    const config = this.text(row.custom_config);
    const access = this.inferCardAccess(row);
    return {
      rowId: this.text(row.row_id),
      id: this.text(row.row_id),
      lineId: this.text(row.line_id),
      userId: this.text(row.line_id),
      creatorId: this.text(row.creator_id),
      ownerUserId: access.ownerUserId,
      profileUserId: access.profileUserId,
      sourceType: access.sourceType,
      visibility: access.visibility,
      poolEligible: access.poolEligible,
      aiReviewStatus: access.aiReviewStatus,
      crmStatus: this.text(row.crm_status, access.isSelfProfile ? '個人名片' : '新名片'),
      crmType: this.text(row.crm_type, this.inferCrmType(row)),
      crmNextAction: this.text(row.crm_next_action, this.inferCrmNextAction(row, this.inferCrmType(row))),
      crmNextFollowupAt: this.text(row.crm_next_followup_at),
      crmAiSuggestion: this.text(row.crm_ai_suggestion, this.inferCrmSuggestion(row, this.inferCrmType(row), this.inferCrmNextAction(row, this.inferCrmType(row)))),
      isPrivate: access.isPrivate,
      isSelfProfile: access.isSelfProfile,
      networkId: this.text(row.network_id, 'admin'),
      name: this.text(row.name, '未命名'),
      englishName: this.text(row.english_name),
      companyName: this.text(row.company_name),
      title: this.text(row.title),
      department: this.text(row.department),
      taxId: this.text(row.tax_id),
      mobile: this.text(row.mobile),
      officePhone: this.text(row.office_phone),
      extension: this.text(row.extension),
      fax: this.text(row.fax),
      email: this.text(row.email),
      website: this.text(row.website),
      socials: this.text(row.socials),
      address: this.text(row.address),
      birthday: this.text(row.birthday),
      services: this.text(row.services),
      notes: this.text(row.notes),
      imageUrl: this.text(row.image_url),
      customConfig: config,
      tags: this.text(row.tags),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at),
      'LINE ID': this.text(row.line_id),
      '姓名': this.text(row.name, '未命名'),
      '英文名': this.text(row.english_name),
      '公司名稱': this.text(row.company_name),
      '職稱': this.text(row.title),
      '部門': this.text(row.department),
      '統一編號': this.text(row.tax_id),
      '手機號碼': this.text(row.mobile),
      '公司電話': this.text(row.office_phone),
      '分機': this.text(row.extension),
      '傳真': this.text(row.fax),
      '電子郵件': this.text(row.email),
      '公司網址': this.text(row.website),
      '社群帳號': this.text(row.socials),
      '公司地址': this.text(row.address),
      '生日': this.text(row.birthday),
      '服務項目': this.text(row.services),
      '建檔人/備註': this.text(row.notes),
      '建檔者ID': this.text(row.creator_id),
      '擁有人ID': access.ownerUserId,
      '名片來源': access.sourceType,
      '公開狀態': access.visibility,
      '客戶狀態': this.text(row.crm_status, access.isSelfProfile ? '個人名片' : '新名片'),
      '客戶類型': this.text(row.crm_type, this.inferCrmType(row)),
      '建議下一步': this.text(row.crm_next_action, this.inferCrmNextAction(row, this.inferCrmType(row))),
      '下次跟進時間': this.text(row.crm_next_followup_at),
      'AI建議': this.text(row.crm_ai_suggestion, this.inferCrmSuggestion(row, this.inferCrmType(row), this.inferCrmNextAction(row, this.inferCrmType(row)))),
      '名片圖檔': this.text(row.image_url),
      '自訂名片設定': config,
      '電子名片設定': config,
      '歸屬網': this.text(row.network_id, 'admin'),
      '標籤': this.text(row.tags)
    };
  },

  userFromCard(row) {
    if (!row || !this.text(row.line_id)) return null;
    return {
      user_id: this.text(row.line_id),
      line_id: this.text(row.line_id),
      name: this.text(row.name, '未命名'),
      phone: this.text(row.mobile || row.office_phone),
      industry: this.text(row.title || row.company_name, '名片會員'),
      birthday: this.text(row.birthday),
      socials_json: this.text(row.socials) || '[]',
      role: 'user',
      store_id: '',
      referrer_id: '',
      network_id: this.text(row.network_id, 'admin'),
      telegram_token: '',
      telegram_chat_id: ''
    };
  },

  cardMatchesHardAdmin(card, account) {
    if (!card || !account) return false;
    const name = this.text(card.name);
    const phone = SecurityModule.normalizePhone(card.mobile || card.office_phone);
    const phoneMatch = !!phone && account.phones.includes(phone);
    const nameMatch = !!name && account.names.some(allowed => name.includes(allowed));
    return phoneMatch && nameMatch;
  },

  hardAdminAccountFromIdentity(userId, link) {
    const ids = [
      userId,
      link && link.old_line_id,
      link && link.new_line_id
    ].map(value => this.text(value)).filter(Boolean);
    return SecurityModule.hardAdminAccounts.find(account => ids.some(id => account.ids.includes(id))) || null;
  },

  async findBestBoundCard(env, userId, identity = {}) {
    const id = this.text(userId);
    const link = identity && identity.link;
    const ids = [];
    const addId = value => {
      const next = this.text(value);
      if (next && !ids.includes(next)) ids.push(next);
    };
    addId(id);
    addId(link && link.new_line_id);
    addId(link && link.old_line_id);
    if (!ids.length) return null;

    const placeholders = ids.map(() => '?').join(',');
    const cards = await this.all(env, `
      SELECT * FROM card_contacts
      WHERE line_id IN (${placeholders}) OR creator_id IN (${placeholders})
      ORDER BY row_id DESC
      LIMIT 50
    `, [...ids, ...ids]).catch(() => []);

    const account = this.hardAdminAccountFromIdentity(id, link);
    if (account) {
      const ownCard = cards.find(card => this.cardMatchesHardAdmin(card, account));
      if (ownCard) return ownCard;
    }
    return cards.find(card => this.text(card.line_id) === id) || cards[0] || null;
  },

  async upsertBoundUserFromCard(env, card, options = {}) {
    const user = this.userFromCard(card);
    if (!user) return null;
    if (options.userId) {
      user.user_id = this.text(options.userId);
      user.line_id = this.text(options.userId);
    }
    if (options.role) user.role = this.text(options.role, user.role);
    if (options.networkId) user.network_id = this.text(options.networkId, user.network_id);
    await D1BackfillModule.upsertUser(env, user);
    if (options.legacyLineId || options.pointLineId || options.identitySource || options.role) {
      await env.ACTMASTER_DB.prepare(`
        UPDATE users
        SET role = CASE
              WHEN ? = 'admin' OR role = 'admin' THEN 'admin'
              WHEN ? = 'store' OR role = 'store' THEN 'store'
              ELSE role
            END,
            legacy_line_id = CASE WHEN ? <> '' THEN ? ELSE legacy_line_id END,
            point_line_id = CASE WHEN ? <> '' THEN ? ELSE point_line_id END,
            identity_source = CASE WHEN ? <> '' THEN ? ELSE identity_source END,
            migrated_at = CASE WHEN ? <> '' THEN CURRENT_TIMESTAMP ELSE migrated_at END
        WHERE line_id = ? OR row_id = ?
      `).bind(
        this.text(options.role),
        this.text(options.role),
        this.text(options.legacyLineId), this.text(options.legacyLineId),
        this.text(options.pointLineId), this.text(options.pointLineId),
        this.text(options.identitySource), this.text(options.identitySource),
        this.text(options.identitySource),
        user.line_id,
        user.user_id
      ).run().catch(e => console.error('bound user identity update skipped', e));
    }
    const saved = await this.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? LIMIT 1', [user.line_id, user.user_id]).catch(() => null);
    if (saved) return this.userRow(saved, options.source || 'bound_card');
    return this.userRow({
      row_id: user.user_id,
      line_id: user.line_id,
      name: user.name,
      phone: user.phone,
      industry: user.industry,
      birthday: user.birthday,
      role: user.role,
      network_id: user.network_id
    }, options.source || 'bound_card');
  },

  async checkUser(payload, env) {
    if (!this.hasD1(env)) return null;
    const userId = this.text(payload.userId || payload.lineId);
    if (!userId) return { success: false, error: 'Missing userId' };

    const identity = await this.findUserByIdentity(env, userId);
    const user = identity.user;
    if (user) {
      const profile = this.userRow(user);
      profile.requestedUserId = userId;
      profile.canonicalUserId = identity.canonicalId || profile.userId;
      if (identity.link) {
        profile.identityLink = {
          oldLineId: this.text(identity.link.old_line_id),
          newLineId: this.text(identity.link.new_line_id),
          matchMethod: this.text(identity.link.match_method),
          confidence: this.text(identity.link.confidence)
        };
      }
      if (env.ACTMASTER_KV) {
        await env.ACTMASTER_KV.put(`U_PROFILE_${userId}`, JSON.stringify(profile), { expirationTtl: 600 });
      }
      return { success: true, data: { isRegistered: true, info: profile, source: identity.link ? 'identity_link' : 'd1_user' } };
    }

    const card = await this.findBestBoundCard(env, userId, identity);
    if (card) {
      const account = this.hardAdminAccountFromIdentity(userId, identity.link);
      const isLinkedHardAdmin = !!(account && this.cardMatchesHardAdmin(card, account));
      const profile = await this.upsertBoundUserFromCard(env, card, {
        userId,
        role: isLinkedHardAdmin ? 'admin' : 'user',
        networkId: isLinkedHardAdmin ? 'admin' : this.text(card.network_id, 'admin'),
        legacyLineId: identity.link && identity.link.old_line_id,
        pointLineId: identity.link && identity.link.new_line_id,
        identitySource: identity.link ? 'identity_bound_card' : '',
        source: isLinkedHardAdmin ? 'hard_admin_bound_card' : 'bound_card'
      });
      if (profile && env.ACTMASTER_KV) {
        await env.ACTMASTER_KV.put(`U_PROFILE_${userId}`, JSON.stringify(profile), { expirationTtl: 600 });
      }
      return { success: true, data: { isRegistered: true, info: profile, source: 'bound_card' } };
    }

    return { success: true, data: { isRegistered: false, info: null, source: 'd1' } };
  },

  async linkUserIdentity(payload, env) {
    if (!this.hasD1(env)) return null;
    const oldUserId = this.text(payload.oldUserId || payload.previousUserId || payload.legacyUserId);
    const newUserId = this.text(payload.newUserId || payload.authenticatedUserId || payload.userId);
    if (!oldUserId || !newUserId) return { success: false, error: 'Missing identity ids' };
    if (oldUserId === newUserId) return await this.checkUser({ userId: newUserId }, env);

    const existingNew = await this.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? LIMIT 1', [newUserId, newUserId]);
    if (existingNew) {
      const profile = this.userRow(existingNew);
      if (env.ACTMASTER_KV) await env.ACTMASTER_KV.put(`U_PROFILE_${newUserId}`, JSON.stringify(profile), { expirationTtl: 600 });
      return { success: true, data: { isRegistered: true, info: profile, source: 'identity_existing' } };
    }

    const oldUser = await this.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? LIMIT 1', [oldUserId, oldUserId]);
    if (!oldUser) return { success: false, error: '找不到舊會員資料' };

    const cachedName = this.text(payload.name || payload.cachedName);
    const cachedPhone = this.text(payload.phone || payload.cachedPhone);
    const oldName = this.text(oldUser.name);
    const oldPhone = this.text(oldUser.phone);
    const isHardAdmin = SecurityModule.isHardAdmin(oldUserId, oldUser);
    const nameOk = cachedName && oldName && cachedName === oldName;
    const phoneOk = cachedPhone && oldPhone && cachedPhone === oldPhone;
    if (!isHardAdmin && !nameOk && !phoneOk) {
      return { success: false, error: '舊帳號驗證不足，請由管理員合併身份' };
    }

    try {
      await env.ACTMASTER_DB.prepare('DELETE FROM user_identity_links WHERE old_line_id = ? OR new_line_id = ?').bind(oldUserId, newUserId).run();
      await env.ACTMASTER_DB.prepare(`
        INSERT INTO user_identity_links (old_line_id,new_line_id,match_method,confidence,status,note,updated_at)
        VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
      `).bind(
        oldUserId,
        newUserId,
        phoneOk ? 'phone_cache' : (nameOk ? 'name_cache' : 'hard_admin'),
        phoneOk || isHardAdmin ? 'high' : 'medium',
        'active',
        'linked during LIFF identity recovery'
      ).run();
    } catch (e) {
      console.error('identity link write skipped', e);
    }

    await env.ACTMASTER_DB.prepare(`
      INSERT INTO users (row_id,line_id,name,industry,gender,phone,birthday,region,address,socials,role,store_id,referrer_id,network_id,tg_token,tg_chat_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(line_id) DO UPDATE SET
        name=excluded.name,industry=excluded.industry,gender=excluded.gender,phone=excluded.phone,birthday=excluded.birthday,
        region=excluded.region,address=excluded.address,socials=excluded.socials,role=excluded.role,store_id=excluded.store_id,
        referrer_id=excluded.referrer_id,network_id=excluded.network_id,tg_token=excluded.tg_token,tg_chat_id=excluded.tg_chat_id
    `).bind(
      `USR_${newUserId}`,
      newUserId,
      oldUser.name || cachedName || '',
      oldUser.industry || '',
      oldUser.gender || '',
      oldUser.phone || cachedPhone || '',
      oldUser.birthday || '',
      oldUser.region || '',
      oldUser.address || '',
      oldUser.socials || '',
      isHardAdmin ? 'admin' : (oldUser.role || 'user'),
      oldUser.store_id || '',
      oldUser.referrer_id || '',
      oldUser.network_id || 'admin',
      oldUser.tg_token || '',
      oldUser.tg_chat_id || ''
    ).run();

    try {
      await env.ACTMASTER_DB.prepare(`
        UPDATE users
        SET legacy_line_id = ?, point_line_id = ?, identity_source = 'point_liff', migrated_at = CURRENT_TIMESTAMP
        WHERE line_id = ? OR row_id = ?
      `).bind(oldUserId, newUserId, newUserId, `USR_${newUserId}`).run();
    } catch (e) {
      console.error('identity columns update skipped', e);
    }

    await env.ACTMASTER_DB.prepare('UPDATE card_contacts SET line_id = ?, updated_at = CURRENT_TIMESTAMP WHERE line_id = ?').bind(newUserId, oldUserId).run();
    await env.ACTMASTER_DB.prepare('UPDATE registrants SET line_id = ? WHERE line_id = ?').bind(newUserId, oldUserId).run().catch(() => null);
    if (env.ACTMASTER_KV) {
      await env.ACTMASTER_KV.delete(`U_PROFILE_${oldUserId}`).catch(() => null);
      await env.ACTMASTER_KV.delete(`U_PROFILE_${newUserId}`).catch(() => null);
    }

    const migrated = await this.first(env, 'SELECT * FROM users WHERE line_id = ? LIMIT 1', [newUserId]);
    const profile = this.userRow(migrated);
    if (env.ACTMASTER_KV) await env.ACTMASTER_KV.put(`U_PROFILE_${newUserId}`, JSON.stringify(profile), { expirationTtl: 600 });
    return { success: true, data: { isRegistered: true, info: profile, oldUserId, newUserId, source: 'identity_linked' } };
  },

  async getAllUsers(payload, env) {
    if (!this.hasD1(env)) return null;
    const users = await this.all(env, 'SELECT * FROM users ORDER BY created_at DESC, row_id DESC LIMIT 500');
    const merged = [];
    const seen = new Set();
    const seenIdentity = new Set();
    const identityKey = (profile) => {
      const phone = this.text(profile.phone).replace(/\D/g, '');
      if (phone.length >= 7) return `phone:${phone}`;
      const name = this.text(profile.name).toLowerCase();
      const network = this.text(profile.networkId, 'admin').toLowerCase();
      return name ? `name:${network}:${name}` : '';
    };
    const addProfile = (profile) => {
      if (!profile || seen.has(profile.userId)) return;
      const key = identityKey(profile);
      if (key && seenIdentity.has(key)) return;
      seen.add(profile.userId);
      if (key) seenIdentity.add(key);
      merged.push(profile);
    };

    users.forEach(row => {
      const profile = this.userRow(row);
      addProfile(profile);
    });

    const cards = await this.all(env, "SELECT * FROM card_contacts WHERE line_id IS NOT NULL AND TRIM(line_id) <> '' ORDER BY created_at DESC LIMIT 500");
    cards.forEach(row => {
      const userId = this.text(row.line_id);
      if (!userId || seen.has(userId)) return;
      const profile = this.userRow({
        row_id: userId,
        line_id: userId,
        name: row.name,
        phone: row.mobile || row.office_phone,
        industry: row.title || row.company_name,
        role: 'user',
        network_id: row.network_id
      }, 'bound_card');
      addProfile(profile);
    });

    return { success: true, data: merged };
  },

  async getCardContacts(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureCardAccessColumns(env);
    const limit = Math.min(Math.max(Number(payload.limit || 200) || 200, 1), 500);
    const role = this.role(payload.authenticatedRole || payload.role);
    const actorId = this.text(payload.authenticatedUserId || payload.userId);
    let rows = [];
    if (role === 'admin') {
      rows = await this.all(env, `SELECT * FROM card_contacts ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC LIMIT ${limit}`);
    } else if (actorId) {
      const ids = await this.identityIdsForUser(env, actorId);
      const placeholders = ids.map(() => '?').join(',');
      rows = await this.all(env, `
        SELECT * FROM card_contacts
        WHERE line_id IN (${placeholders}) OR creator_id IN (${placeholders})
           OR owner_user_id IN (${placeholders}) OR profile_user_id IN (${placeholders})
        ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC
        LIMIT ${limit}
      `, [...ids, ...ids, ...ids, ...ids]);
    }
    return { success: true, data: rows.map(row => this.cardRow(row)).filter(Boolean) };
  },

  crmContactRow(row) {
    if (!row) return null;
    const card = this.cardRow(row);
    const phone = this.text(card.mobile || card.officePhone);
    return {
      rowId: card.rowId,
      cardRowId: card.rowId,
      userId: card.lineId,
      ownerUserId: card.ownerUserId,
      profileUserId: card.profileUserId,
      name: card.name,
      phone,
      email: card.email,
      company: card.companyName,
      title: card.title,
      tags: card.tags,
      sourceType: card.sourceType,
      visibility: card.visibility,
      poolEligible: card.poolEligible,
      crmStatus: card.crmStatus,
      crmType: card.crmType,
      crmNextAction: card.crmNextAction,
      crmNextFollowupAt: card.crmNextFollowupAt,
      crmAiSuggestion: card.crmAiSuggestion,
      ownerNetwork: card.networkId,
      ownerName: this.text(row.owner_name),
      ownerStoreId: this.text(row.owner_store_id),
      activityCount: 0,
      activities: [],
      lastActivityTime: this.text(row.updated_at || row.created_at)
    };
  },

  async getCrmContacts(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureCardAccessColumns(env);
    const role = this.role(payload.authenticatedRole || payload.role);
    const actorId = this.text(payload.authenticatedUserId || payload.userId);
    const limit = Math.min(Math.max(Number(payload.limit || 200) || 200, 1), 500);
    const baseSelect = `
      SELECT c.*, u.name AS owner_name, u.store_id AS owner_store_id
      FROM card_contacts c
      LEFT JOIN users u ON u.line_id = COALESCE(NULLIF(c.owner_user_id,''), NULLIF(c.creator_id,''), NULLIF(c.line_id,''))
    `;
    let rows = [];
    if (role === 'admin') {
      rows = await this.all(env, `${baseSelect} ORDER BY COALESCE(c.updated_at, c.created_at) DESC, c.row_id DESC LIMIT ${limit}`);
    } else if (actorId) {
      const ids = await this.identityIdsForUser(env, actorId);
      const placeholders = ids.map(() => '?').join(',');
      rows = await this.all(env, `
        ${baseSelect}
        WHERE c.owner_user_id IN (${placeholders}) OR c.creator_id IN (${placeholders})
           OR c.line_id IN (${placeholders}) OR c.profile_user_id IN (${placeholders})
        ORDER BY COALESCE(c.updated_at, c.created_at) DESC, c.row_id DESC
        LIMIT ${limit}
      `, [...ids, ...ids, ...ids, ...ids]);
    }
    return { success: true, data: rows.map(row => this.crmContactRow(row)).filter(Boolean) };
  },

  async updateCrmContact(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureCardAccessColumns(env);
    const rowId = this.text(payload.rowId || payload.cardRowId);
    const actorId = this.text(payload.authenticatedUserId || payload.userId);
    const role = this.role(payload.authenticatedRole || payload.role);
    if (!rowId) return { success: false, error: 'Missing card row id' };
    const row = await this.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]);
    if (!row) return { success: false, error: '找不到名片資料' };
    if (role !== 'admin') {
      const ids = actorId ? await this.identityIdsForUser(env, actorId) : [];
      const ownerId = this.text(row.owner_user_id || row.creator_id || row.line_id);
      if (!ids.includes(ownerId) && !ids.includes(this.text(row.creator_id)) && !ids.includes(this.text(row.profile_user_id))) {
        return { success: false, error: '無權限更新此客戶資料' };
      }
    }
    const allowedStatuses = new Set(['新名片', '已初次聯繫', '已發送資料', '已邀約', '已報名活動', '已到場', '已成交', '已流失', '暫緩追蹤', '個人名片']);
    const status = this.text(payload.crmStatus || payload.status || row.crm_status, row.crm_status || '新名片');
    const crmType = this.text(payload.crmType || payload.type || row.crm_type, row.crm_type || this.inferCrmType(row));
    const nextAction = this.text(payload.crmNextAction || payload.nextAction || row.crm_next_action, row.crm_next_action || this.inferCrmNextAction(row, crmType));
    const nextFollowupAt = this.text(payload.crmNextFollowupAt || payload.nextFollowupAt || row.crm_next_followup_at);
    const suggestion = this.text(payload.crmAiSuggestion || payload.aiSuggestion || row.crm_ai_suggestion, row.crm_ai_suggestion || this.inferCrmSuggestion(row, crmType, nextAction));
    if (!allowedStatuses.has(status)) return { success: false, error: '不支援的客戶狀態' };
    await env.ACTMASTER_DB.prepare(`
      UPDATE card_contacts
      SET crm_status = ?, crm_type = ?, crm_next_action = ?, crm_next_followup_at = ?, crm_ai_suggestion = ?, updated_at = CURRENT_TIMESTAMP
      WHERE row_id = ?
    `).bind(status, crmType, nextAction, nextFollowupAt, suggestion, rowId).run();
    const updated = await this.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]);
    return { success: true, data: this.crmContactRow(updated) };
  },

  async previewIdentityMigration(payload, env) {
    if (!this.hasD1(env)) return null;
    const limit = Math.min(Math.max(Number(payload.limit || 100) || 100, 1), 500);
    let links = [];
    let linksTableReady = true;
    try {
      links = await this.all(env, 'SELECT * FROM user_identity_links ORDER BY updated_at DESC, id DESC LIMIT ?', [limit]);
    } catch (e) {
      linksTableReady = false;
    }

    const users = await this.all(env, 'SELECT * FROM users ORDER BY created_at DESC, row_id DESC LIMIT ?', [limit]);
    const cards = await this.all(env, `
      SELECT * FROM card_contacts
      WHERE line_id IS NOT NULL AND TRIM(line_id) <> ''
      ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC
      LIMIT ?
    `, [limit]);

    const linkedOld = new Set(links.map(row => this.text(row.old_line_id)).filter(Boolean));
    const linkedNew = new Set(links.map(row => this.text(row.new_line_id)).filter(Boolean));
    const canonicalMap = new Map();
    const setCanonical = (from, to) => {
      const source = this.text(from);
      const target = this.text(to);
      if (source && target) canonicalMap.set(source, target);
    };
    links.forEach(row => {
      setCanonical(row.old_line_id, row.new_line_id);
      setCanonical(row.new_line_id, row.new_line_id);
    });
    users.forEach(row => {
      const lineId = this.text(row.line_id || row.row_id);
      const pointId = this.text(row.point_line_id);
      const legacyId = this.text(row.legacy_line_id);
      if (pointId) {
        setCanonical(lineId, pointId);
        setCanonical(pointId, pointId);
        setCanonical(legacyId, pointId);
      }
    });
    const canonicalId = value => {
      let id = this.text(value);
      const seen = new Set();
      for (let i = 0; i < 8 && id && canonicalMap.has(id) && !seen.has(id); i++) {
        seen.add(id);
        id = canonicalMap.get(id);
      }
      return id;
    };
    const phoneMap = new Map();
    const phoneItemKeys = new Map();
    const normalizePhone = value => this.text(value).replace(/\D/g, '');
    const pushPhoneItem = (phone, item) => {
      const canonicalUserId = canonicalId(item.userId);
      const key = [canonicalUserId || item.userId || item.cardId, item.type].join(':');
      if (!phoneMap.has(phone)) {
        phoneMap.set(phone, []);
        phoneItemKeys.set(phone, new Set());
      }
      const keys = phoneItemKeys.get(phone);
      if (keys.has(key)) return;
      keys.add(key);
      phoneMap.get(phone).push({ ...item, canonicalUserId });
    };
    users.forEach(row => {
      const phone = normalizePhone(row.phone);
      if (phone.length < 7) return;
      pushPhoneItem(phone, { type: 'user', userId: this.text(row.line_id || row.row_id), name: this.text(row.name), phone });
    });
    cards.forEach(row => {
      const phone = normalizePhone(row.mobile || row.office_phone);
      if (phone.length < 7) return;
      pushPhoneItem(phone, { type: 'card', userId: this.text(row.line_id), cardId: this.text(row.row_id), name: this.text(row.name), phone });
    });

    const duplicatePhones = Array.from(phoneMap.entries())
      .filter(([, items]) => new Set(items.map(item => item.canonicalUserId || item.userId).filter(Boolean)).size > 1)
      .slice(0, 50)
      .map(([phone, items]) => ({ phone, items }));

    const usersWithoutPointId = users
      .map(row => this.userRow(row))
      .filter(profile => profile && !this.text(profile.pointLineId) && !linkedNew.has(profile.userId) && !linkedOld.has(profile.userId) && canonicalId(profile.userId) === profile.userId)
      .slice(0, 50);

    const boundCardsWithoutUser = cards
      .filter(card => !users.some(user => canonicalId(user.line_id || user.row_id) === canonicalId(card.line_id)))
      .slice(0, 50)
      .map(row => this.cardRow(row));

    return {
      success: true,
      data: {
        linksTableReady,
        existingLinks: links.map(row => ({
          oldLineId: this.text(row.old_line_id),
          newLineId: this.text(row.new_line_id),
          matchMethod: this.text(row.match_method),
          confidence: this.text(row.confidence),
          status: this.text(row.status),
          note: this.text(row.note),
          updatedAt: this.text(row.updated_at)
        })),
        counts: {
          sampledUsers: users.length,
          sampledBoundCards: cards.length,
          existingLinks: links.length,
          usersWithoutPointId: usersWithoutPointId.length,
          boundCardsWithoutUser: boundCardsWithoutUser.length,
          duplicatePhones: duplicatePhones.length
        },
        usersWithoutPointId,
        boundCardsWithoutUser,
        duplicatePhones,
        hardAdminIds: Array.from(SecurityModule.hardAdminIds || [])
      }
    };
  }
};

const D1WriteModule = {
  hasD1(env) {
    return !!(env && env.ACTMASTER_DB);
  },

  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  pick(source, keys, fallback = '') {
    for (const key of keys) {
      const value = source && source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return fallback;
  },

  role(value) {
    const next = this.text(value, 'user').toLowerCase();
    if (next === 'admin' || next === '總管') return 'admin';
    if (next === 'store' || next === 'tenant' || next === '店長' || next === '租戶') return 'store';
    return 'user';
  },

  jsonObject(value) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : (value || {});
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      return {};
    }
  },

  buildSocials(data = {}) {
    const raw = this.pick(data, ['socials', 'socials_json', '社群帳號']);
    if (!raw && !(data.dealerProfile && typeof data.dealerProfile === 'object')) return '';
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return JSON.stringify(parsed.filter(Boolean));
      } catch (e) {}
    }
    const socials = this.jsonObject(raw || '{}');
    if (data.dealerProfile && typeof data.dealerProfile === 'object') {
      socials.dealerProfile = data.dealerProfile;
    }
    return JSON.stringify(socials);
  },

  async clearUserCache(env, userId) {
    if (!env.ACTMASTER_KV || !userId) return;
    try { await env.ACTMASTER_KV.delete(`U_PROFILE_${userId}`); } catch (e) { console.error('KV Delete Error', e); }
  },

  normalizeUser(payload = {}) {
    const data = payload.data || payload.profile || payload;
    const userId = this.pick(data, ['userId', 'lineId', 'line_id', 'LINE ID'], this.pick(payload, ['userId', 'lineId', 'targetUserId']));
    if (!userId) return null;
    return {
      row_id: this.pick(data, ['rowId', 'row_id'], `USR_${userId}`),
      line_id: userId,
      name: this.pick(data, ['name', 'displayName', '姓名', '真實姓名']),
      industry: this.pick(data, ['industry', 'title', '職稱', '主要業種', '公司名稱']),
      gender: this.pick(data, ['gender', '性別']),
      phone: this.pick(data, ['phone', 'mobile', '手機', '手機號碼']),
      birthday: this.pick(data, ['birthday', 'birthdate', '出生年月日']),
      region: this.pick(data, ['region', '地區']),
      address: this.pick(data, ['address', '地址', '公司地址']),
      socials: this.buildSocials(data),
      role: this.role(this.pick(data, ['role', '權限級別'], 'user')),
      store_id: this.pick(data, ['storeid', 'storeId', 'store_id', '店代碼']),
      referrer_id: this.pick(data, ['referrerId', 'referrer_id', '推薦人']),
      network_id: this.pick(data, ['networkId', 'network_id', '歸屬網'], 'admin'),
      tg_token: this.pick(data, ['tgToken', 'tg_token']),
      tg_chat_id: this.pick(data, ['tgChatId', 'tg_chat_id'])
    };
  },

  normalizeCard(payload = {}) {
    const data = payload.data || payload.card || payload;
    const config = this.pick(data, ['customConfig', 'custom_config', 'cardConfig', '電子名片設定', '自訂名片設定'], '{}');
    const rowId = this.pick(data, ['rowId', 'row_id', 'id'], this.pick(payload, ['rowId']));
    return {
      row_id: rowId || `CARD_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      line_id: this.pick(data, ['lineId', 'line_id', 'LINE ID', 'User ID']),
      name: this.pick(data, ['name', '姓名']),
      english_name: this.pick(data, ['englishName', 'english_name', '英文名']),
      company_name: this.pick(data, ['companyName', 'company_name', '公司名稱']),
      title: this.pick(data, ['title', '職稱']),
      department: this.pick(data, ['department', '部門']),
      tax_id: this.pick(data, ['taxId', 'tax_id', '統一編號']),
      mobile: this.pick(data, ['mobile', 'phone', '手機號碼', '手機']),
      office_phone: this.pick(data, ['officePhone', 'office_phone', '公司電話']),
      extension: this.pick(data, ['extension', '分機']),
      fax: this.pick(data, ['fax', '傳真']),
      email: this.pick(data, ['email', '電子郵件']),
      website: this.pick(data, ['website', '公司網址']),
      socials: this.pick(data, ['socials', '社群帳號']),
      address: this.pick(data, ['address', '公司地址']),
      birthday: this.pick(data, ['birthday', '生日']),
      personality: this.pick(data, ['personality', '個性']),
      hobbies: this.pick(data, ['hobbies', '興趣']),
      wealth: this.pick(data, ['wealth', '財富']),
      health: this.pick(data, ['health', '健康']),
      career: this.pick(data, ['career', '事業']),
      services: this.pick(data, ['services', 'service', '服務項目']),
      notes: this.pick(data, ['notes', '建檔人/備註']),
      creator_id: this.pick(data, ['creatorId', 'creator_id', '建檔者ID'], this.pick(payload, ['creatorId', 'userId'])),
      image_url: this.pick(data, ['imageUrl', 'image_url', '名片圖檔']),
      custom_config: config,
      network_id: this.pick(data, ['networkId', 'network_id', '歸屬網'], 'admin'),
      tags: this.pick(data, ['tags', '標籤']),
      owner_user_id: this.pick(data, ['ownerUserId', 'owner_user_id', '擁有人ID']),
      profile_user_id: this.pick(data, ['profileUserId', 'profile_user_id']),
      source_type: this.pick(data, ['sourceType', 'source_type', '名片來源']),
      visibility: this.pick(data, ['visibility', '公開狀態']),
      pool_eligible: this.pick(data, ['poolEligible', 'pool_eligible']),
      ai_review_status: this.pick(data, ['aiReviewStatus', 'ai_review_status']),
      crm_status: this.pick(data, ['crmStatus', 'crm_status', '客戶狀態']),
      crm_type: this.pick(data, ['crmType', 'crm_type', '客戶類型']),
      crm_next_action: this.pick(data, ['crmNextAction', 'crm_next_action', '建議下一步']),
      crm_next_followup_at: this.pick(data, ['crmNextFollowupAt', 'crm_next_followup_at', '下次跟進時間']),
      crm_ai_suggestion: this.pick(data, ['crmAiSuggestion', 'crm_ai_suggestion', 'AI建議'])
    };
  },

  async upsertUser(payload, env) {
    if (!this.hasD1(env)) return null;
    const user = this.normalizeUser(payload);
    if (!user) return { success: false, error: 'Missing userId' };
    const data = payload.data || payload.profile || payload;
    const existing = await D1ReadModule.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? LIMIT 1', [user.line_id, user.line_id]);
    const hasRoleInput = ['role', '權限級別'].some(key => data && data[key] !== undefined && data[key] !== null && String(data[key]).trim() !== '');
    if (existing) {
      ['name','industry','gender','phone','birthday','region','address','socials','store_id','referrer_id','network_id','tg_token','tg_chat_id'].forEach(key => {
        if (user[key] === '' || user[key] === undefined || user[key] === null || user[key] === '未命名') user[key] = existing[key] || '';
      });
      if (existing.referrer_id && String(existing.referrer_id).trim()) {
        user.referrer_id = existing.referrer_id;
        user.network_id = existing.network_id || user.network_id;
      }
      if (user.referrer_id && user.referrer_id === user.line_id) user.referrer_id = existing.referrer_id || '';
      if (existing.role === 'store' && user.role === 'user') user.role = existing.role;
      if (!hasRoleInput) user.role = existing.role || user.role;
    }
    user.role = SecurityModule.sanitizeRole(user.line_id, user.role, user);
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO users (row_id,line_id,name,industry,gender,phone,birthday,region,address,socials,role,store_id,referrer_id,network_id,tg_token,tg_chat_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(line_id) DO UPDATE SET
        name=excluded.name,industry=excluded.industry,gender=excluded.gender,phone=excluded.phone,birthday=excluded.birthday,
        region=excluded.region,address=excluded.address,socials=excluded.socials,
        role=CASE
          WHEN users.role = 'admin' OR excluded.role = 'admin' THEN 'admin'
          WHEN users.role = 'store' OR excluded.role = 'store' THEN 'store'
          ELSE excluded.role
        END,
        store_id=excluded.store_id,
        referrer_id=excluded.referrer_id,network_id=excluded.network_id,tg_token=excluded.tg_token,tg_chat_id=excluded.tg_chat_id
    `).bind(user.row_id,user.line_id,user.name,user.industry,user.gender,user.phone,user.birthday,user.region,user.address,user.socials,user.role,user.store_id,user.referrer_id,user.network_id,user.tg_token,user.tg_chat_id).run();
    await this.clearUserCache(env, user.line_id);
    const info = D1ReadModule.userRow({
      row_id: user.row_id,
      line_id: user.line_id,
      name: user.name,
      industry: user.industry,
      phone: user.phone,
      birthday: user.birthday,
      role: user.role,
      store_id: user.store_id,
      referrer_id: user.referrer_id,
      network_id: user.network_id,
      tg_token: user.tg_token,
      tg_chat_id: user.tg_chat_id
    });
    return { success: true, data: { isRegistered: true, info, source: 'd1_write' } };
  },

  async updateUserRoleLegacy(payload, env) {
    if (!this.hasD1(env)) return null;
    const targetUserId = this.pick(payload, ['targetUserId', 'targetLineId', 'lineId', 'userId']);
    const role = this.role(this.pick(payload, ['newRole', 'targetRole', 'permission', 'role']));
    if (!targetUserId) return { success: false, error: 'Missing targetUserId' };
    if (role === 'admin') return { success: false, error: 'Admin role cannot be assigned from role editor' };
    const existing = await D1ReadModule.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? LIMIT 1', [targetUserId, targetUserId]);
    if (!existing) return { success: false, error: '找不到指定用戶' };
    if (SecurityModule.isHardAdmin(targetUserId, existing)) return { success: false, error: 'Hard admin role cannot be modified' };
    await env.ACTMASTER_DB.prepare('UPDATE users SET role = ? WHERE line_id = ? OR row_id = ?').bind(role, targetUserId, targetUserId).run();
    await this.clearUserCache(env, targetUserId);
    return { success: true, data: { userId: targetUserId, role, source: 'd1_write' } };
  },

  async updateUserRole(payload, env) {
    if (!this.hasD1(env)) return null;
    const targetUserId = this.pick(payload, ['targetUserId', 'targetLineId', 'lineId', 'userId']);
    const role = this.role(this.pick(payload, ['newRole', 'targetRole', 'permission', 'role']));
    if (!targetUserId) return { success: false, error: 'Missing targetUserId' };
    if (role === 'admin') return { success: false, error: 'Admin role cannot be assigned from role editor' };

    let existing = await D1ReadModule.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? OR point_line_id = ? OR legacy_line_id = ? LIMIT 1', [targetUserId, targetUserId, targetUserId, targetUserId]).catch(() => null);
    if (existing && SecurityModule.isHardAdmin(targetUserId, existing)) return { success: false, error: 'Hard admin role cannot be modified' };
    if (!existing) {
      const card = await D1ReadModule.first(env, `
        SELECT * FROM card_contacts
        WHERE line_id = ? OR creator_id = ?
        ORDER BY COALESCE(updated_at, created_at) DESC
        LIMIT 1
      `, [targetUserId, targetUserId]).catch(() => null);
      if (card) {
        await this.upsertUser({
          userId: targetUserId,
          name: card.name || '',
          phone: card.mobile || card.office_phone || '',
          industry: card.title || card.company_name || '',
          networkId: card.network_id || 'admin',
          role: 'user'
        }, env);
        existing = await D1ReadModule.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? LIMIT 1', [targetUserId, targetUserId]).catch(() => null);
      }
    }
    if (!existing) return { success: false, error: '找不到指定用戶' };

    const targetLineId = this.text(existing.line_id || targetUserId);
    await env.ACTMASTER_DB.prepare('UPDATE users SET role = ? WHERE line_id = ? OR row_id = ? OR point_line_id = ? OR legacy_line_id = ?').bind(role, targetLineId, targetUserId, targetUserId, targetUserId).run();
    await this.clearUserCache(env, targetLineId);
    await this.clearUserCache(env, targetUserId);
    return { success: true, data: { userId: targetLineId, role, source: 'd1_write' } };
  },

  async runCount(env, sql, binds = []) {
    const res = await env.ACTMASTER_DB.prepare(sql).bind(...binds).run();
    return Number(res && res.meta && res.meta.changes) || 0;
  },

  bestRole(...roles) {
    const normalized = roles.map(role => this.role(role));
    if (normalized.includes('admin')) return 'admin';
    if (normalized.includes('store')) return 'store';
    return 'user';
  },

  firstText(...values) {
    for (const value of values) {
      const next = this.text(value);
      if (next) return next;
    }
    return '';
  },

  normalizePhone(value) {
    return this.text(value).replace(/\D/g, '');
  },

  jsonSafe(value) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : (value || {});
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  },

  async resolvePointAwardUserId(env, userId) {
    const id = this.text(userId);
    if (!id || !env || !env.ACTMASTER_DB) return id;
    const identity = await D1ReadModule.findUserByIdentity(env, id).catch(() => null);
    const row = identity && identity.user;
    return this.text(row && row.point_line_id)
      || this.text(identity && identity.canonicalId)
      || this.text(row && row.line_id)
      || id;
  },

  async ensurePointAwardTable(env) {
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS point_awards (
        award_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '',
        card_id TEXT NOT NULL DEFAULT '',
        award_type TEXT NOT NULL DEFAULT 'card_scan_create',
        points REAL NOT NULL DEFAULT 0,
        point_type TEXT NOT NULL DEFAULT 'gift_money',
        status TEXT NOT NULL DEFAULT 'pending',
        response_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_point_awards_unique_card_scan
      ON point_awards(user_id, card_id, award_type)
      WHERE user_id <> '' AND card_id <> ''
    `).run();
  },

  async hasDuplicateCardForOwner(env, ownerId, card, rowId) {
    if (!ownerId) return false;
    const phone = this.normalizePhone(card.mobile || card.office_phone);
    const name = this.text(card.name).toLowerCase();
    if (!phone && !name) return false;
    const rows = await D1ReadModule.all(env, `
      SELECT row_id,name,mobile,office_phone
      FROM card_contacts
      WHERE creator_id = ? AND row_id <> ?
      ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC
      LIMIT 300
    `, [ownerId, rowId]).catch(() => []);
    return rows.some(row => {
      const rowPhone = this.normalizePhone(row.mobile || row.office_phone);
      if (phone && rowPhone && phone === rowPhone) return true;
      const rowName = this.text(row.name).toLowerCase();
      return !!(name && rowName && name === rowName);
    });
  },

  async awardCardScanPoints(env, userId, cardId, card, eligible) {
    if (!eligible || !userId || !cardId) return null;
    await this.ensurePointAwardTable(env);
    const awardUserId = await this.resolvePointAwardUserId(env, userId);
    if (!awardUserId) return null;
    const awardId = 'AWD_CARD_SCAN_' + awardUserId + '_' + cardId;
    const eventName = '\u6383\u63cf\u540d\u7247\u8d08\u9ede';
    const correctionEventName = '\u6383\u63cf\u540d\u7247\u8d08\u9ede\u88dc\u6b63';
    const eventContent = '\u65b0\u589e\u4e0d\u91cd\u8907\u540d\u7247\uff1a' + (this.text(card.name) || cardId);
    const existingAward = await D1ReadModule.first(env, `
      SELECT * FROM point_awards
      WHERE user_id = ? AND card_id = ? AND award_type = 'card_scan_create'
      LIMIT 1
    `, [awardUserId, cardId]).catch(() => null);

    if (existingAward) {
      const existingJson = this.jsonSafe(existingAward.response_json);
      const insertRow = existingJson && existingJson.data && existingJson.data.data && existingJson.data.data.insert_row;
      const alreadyGiftMoney = this.text(existingAward.point_type) === 'gift_money'
        && this.text(existingAward.status) === 'sent';
      const alreadyCorrected = !!(existingJson.correctedGiftMoneyInsertId || (insertRow && this.text(insertRow.point_type) === 'gift_money'));
      if (alreadyGiftMoney || alreadyCorrected) {
        return { awarded: false, reason: 'already_awarded' };
      }

      const retryResult = await PointModule.insertUserPoint({
        userId: awardUserId,
        points: 10,
        pointType: 'gift_money',
        eventName: this.text(existingAward.point_type) === 'system_point' ? correctionEventName : eventName,
        eventContent,
        shop_remark: 'cardId=' + cardId + ';correct=' + (this.text(existingAward.point_type) || 'retry')
      }, env).catch(e => ({ success: false, error: e.message || 'Point API failed' }));

      const nextJson = {
        previous: existingJson,
        correctedGiftMoneyInsertId: retryResult && retryResult.data && retryResult.data.data && retryResult.data.data.insert_id,
        correctedAt: new Date().toISOString(),
        retryResult
      };
      await env.ACTMASTER_DB.prepare(`
        UPDATE point_awards
        SET user_id = ?, point_type = 'gift_money', status = ?, response_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE award_id = ?
      `).bind(awardUserId, retryResult && retryResult.success ? 'sent' : 'failed', JSON.stringify(nextJson), existingAward.award_id).run();

      return retryResult && retryResult.success
        ? { awarded: true, points: 10, corrected: true, response: retryResult.data }
        : { awarded: false, points: 10, error: (retryResult && retryResult.error) || 'Point award failed' };
    }

    const inserted = await env.ACTMASTER_DB.prepare(`
      INSERT OR IGNORE INTO point_awards (award_id,user_id,card_id,award_type,points,point_type,status,response_json,updated_at)
      VALUES (?,?,?,?,?,?,?, '{}', CURRENT_TIMESTAMP)
    `).bind(awardId, awardUserId, cardId, 'card_scan_create', 10, 'gift_money', 'pending').run();
    if (!inserted || !inserted.meta || Number(inserted.meta.changes || 0) === 0) {
      return { awarded: false, reason: 'already_awarded' };
    }

    const result = await PointModule.insertUserPoint({
      userId: awardUserId,
      points: 10,
      pointType: 'gift_money',
      eventName,
      eventContent,
      shop_remark: 'cardId=' + cardId
    }, env).catch(e => ({ success: false, error: e.message || 'Point API failed' }));

    await env.ACTMASTER_DB.prepare(`
      UPDATE point_awards
      SET status = ?, response_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE award_id = ?
    `).bind(result && result.success ? 'sent' : 'failed', JSON.stringify(result || {}), awardId).run();

    return result && result.success
      ? { awarded: true, points: 10, response: result.data }
      : { awarded: false, points: 10, error: (result && result.error) || 'Point award failed' };
  },

  async confirmIdentityMerge(payload, env) {
    if (!this.hasD1(env)) return null;
    const oldLineId = this.pick(payload, ['oldLineId', 'oldUserId', 'legacyLineId']);
    const newLineId = this.pick(payload, ['newLineId', 'newUserId', 'pointLineId']);
    const confirm = this.pick(payload, ['confirm']);
    if (!oldLineId || !newLineId) return { success: false, error: 'Missing oldLineId or newLineId' };
    if (oldLineId === newLineId) return { success: false, error: 'Old and new LINE IDs are the same' };
    if (confirm !== 'MERGE_IDENTITY') return { success: false, error: 'Missing merge confirmation' };

    const activeOld = await D1ReadModule.first(env, `
      SELECT * FROM user_identity_links
      WHERE old_line_id = ? AND status = 'active'
      LIMIT 1
    `, [oldLineId]).catch(() => null);
    if (activeOld && this.text(activeOld.new_line_id) && this.text(activeOld.new_line_id) !== newLineId) {
      return { success: false, error: 'Old LINE ID is already linked to another point UID' };
    }
    const activeNew = await D1ReadModule.first(env, `
      SELECT * FROM user_identity_links
      WHERE new_line_id = ? AND status = 'active'
      LIMIT 1
    `, [newLineId]).catch(() => null);
    if (activeNew && this.text(activeNew.old_line_id) && this.text(activeNew.old_line_id) !== oldLineId) {
      return { success: false, error: 'Point UID is already linked to another old LINE ID' };
    }

    const oldUser = await D1ReadModule.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? OR legacy_line_id = ? OR point_line_id = ? LIMIT 1', [oldLineId, oldLineId, oldLineId, oldLineId]).catch(() => null);
    const newUser = await D1ReadModule.first(env, 'SELECT * FROM users WHERE line_id = ? OR row_id = ? OR legacy_line_id = ? OR point_line_id = ? LIMIT 1', [newLineId, newLineId, newLineId, newLineId]).catch(() => null);
    const oldCard = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE line_id = ? OR creator_id = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 1', [oldLineId, oldLineId]).catch(() => null);
    const newCard = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE line_id = ? OR creator_id = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 1', [newLineId, newLineId]).catch(() => null);

    if (!oldUser && !newUser && !oldCard && !newCard) {
      return { success: false, error: 'No matching user or card found for either LINE ID' };
    }

    const canonical = {
      row_id: this.firstText(newUser && newUser.row_id, `USR_${newLineId}`),
      line_id: newLineId,
      name: this.firstText(newUser && newUser.name, oldUser && oldUser.name, newCard && newCard.name, oldCard && oldCard.name),
      industry: this.firstText(newUser && newUser.industry, oldUser && oldUser.industry, newCard && (newCard.title || newCard.company_name), oldCard && (oldCard.title || oldCard.company_name)),
      gender: this.firstText(newUser && newUser.gender, oldUser && oldUser.gender),
      phone: this.firstText(newUser && newUser.phone, oldUser && oldUser.phone, newCard && (newCard.mobile || newCard.office_phone), oldCard && (oldCard.mobile || oldCard.office_phone)),
      birthday: this.firstText(newUser && newUser.birthday, oldUser && oldUser.birthday),
      region: this.firstText(newUser && newUser.region, oldUser && oldUser.region),
      address: this.firstText(newUser && newUser.address, oldUser && oldUser.address, newCard && newCard.address, oldCard && oldCard.address),
      socials: this.firstText(newUser && newUser.socials, oldUser && oldUser.socials),
      role: SecurityModule.sanitizeRole(newLineId, this.bestRole(newUser && newUser.role, oldUser && oldUser.role), {
        name: this.firstText(newUser && newUser.name, oldUser && oldUser.name, newCard && newCard.name, oldCard && oldCard.name),
        phone: this.firstText(newUser && newUser.phone, oldUser && oldUser.phone, newCard && (newCard.mobile || newCard.office_phone), oldCard && (oldCard.mobile || oldCard.office_phone)),
        legacy_line_id: oldLineId,
        point_line_id: newLineId
      }),
      store_id: this.firstText(newUser && newUser.store_id, oldUser && oldUser.store_id),
      referrer_id: this.firstText(newUser && newUser.referrer_id, oldUser && oldUser.referrer_id),
      network_id: this.firstText(newUser && newUser.network_id, oldUser && oldUser.network_id, newCard && newCard.network_id, oldCard && oldCard.network_id, 'admin'),
      tg_token: this.firstText(newUser && newUser.tg_token, oldUser && oldUser.tg_token),
      tg_chat_id: this.firstText(newUser && newUser.tg_chat_id, oldUser && oldUser.tg_chat_id)
    };

    await env.ACTMASTER_DB.prepare(`
      INSERT INTO users (row_id,line_id,name,industry,gender,phone,birthday,region,address,socials,role,store_id,referrer_id,network_id,tg_token,tg_chat_id,legacy_line_id,point_line_id,identity_source,migrated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(line_id) DO UPDATE SET
        name=CASE WHEN users.name <> '' THEN users.name ELSE excluded.name END,
        industry=CASE WHEN users.industry <> '' THEN users.industry ELSE excluded.industry END,
        gender=CASE WHEN users.gender <> '' THEN users.gender ELSE excluded.gender END,
        phone=CASE WHEN users.phone <> '' THEN users.phone ELSE excluded.phone END,
        birthday=CASE WHEN users.birthday <> '' THEN users.birthday ELSE excluded.birthday END,
        region=CASE WHEN users.region <> '' THEN users.region ELSE excluded.region END,
        address=CASE WHEN users.address <> '' THEN users.address ELSE excluded.address END,
        socials=CASE WHEN users.socials <> '' THEN users.socials ELSE excluded.socials END,
        role=CASE
          WHEN users.role = 'admin' OR excluded.role = 'admin' THEN 'admin'
          WHEN users.role = 'store' OR excluded.role = 'store' THEN 'store'
          ELSE excluded.role
        END,
        store_id=CASE WHEN users.store_id <> '' THEN users.store_id ELSE excluded.store_id END,
        referrer_id=CASE WHEN users.referrer_id <> '' THEN users.referrer_id ELSE excluded.referrer_id END,
        network_id=CASE WHEN users.network_id <> '' THEN users.network_id ELSE excluded.network_id END,
        tg_token=CASE WHEN users.tg_token <> '' THEN users.tg_token ELSE excluded.tg_token END,
        tg_chat_id=CASE WHEN users.tg_chat_id <> '' THEN users.tg_chat_id ELSE excluded.tg_chat_id END,
        legacy_line_id=excluded.legacy_line_id,
        point_line_id=excluded.point_line_id,
        identity_source='manual_confirm',
        migrated_at=CURRENT_TIMESTAMP
    `).bind(
      canonical.row_id,
      canonical.line_id,
      canonical.name,
      canonical.industry,
      canonical.gender,
      canonical.phone,
      canonical.birthday,
      canonical.region,
      canonical.address,
      canonical.socials,
      canonical.role,
      canonical.store_id,
      canonical.referrer_id,
      canonical.network_id,
      canonical.tg_token,
      canonical.tg_chat_id,
      oldLineId,
      newLineId,
      'manual_confirm'
    ).run();

    await env.ACTMASTER_DB.prepare(`
      UPDATE user_identity_links
      SET status = 'replaced', note = 'replaced by manual merge', updated_at = CURRENT_TIMESTAMP
      WHERE (old_line_id = ? OR new_line_id = ?)
        AND NOT (old_line_id = ? AND new_line_id = ?)
    `).bind(oldLineId, newLineId, oldLineId, newLineId).run().catch(() => null);
    const linkUpdate = await env.ACTMASTER_DB.prepare(`
      UPDATE user_identity_links
      SET match_method = ?, confidence = ?, status = 'active', note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE old_line_id = ? AND new_line_id = ?
    `).bind('manual_confirm', 'confirmed', this.firstText(payload.note, 'admin confirmed identity merge'), oldLineId, newLineId).run().catch(() => null);
    const linkUpdated = Number(linkUpdate && linkUpdate.meta && linkUpdate.meta.changes || 0);
    if (!linkUpdated) {
      await env.ACTMASTER_DB.prepare(`
        INSERT INTO user_identity_links (old_line_id,new_line_id,match_method,confidence,status,note,updated_at)
        VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
      `).bind(oldLineId, newLineId, 'manual_confirm', 'confirmed', 'active', this.firstText(payload.note, 'admin confirmed identity merge')).run();
    }

    const updated = {};
    updated.cardsLineId = await this.runCount(env, 'UPDATE card_contacts SET line_id = ?, updated_at = CURRENT_TIMESTAMP WHERE line_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.cardsCreatorId = await this.runCount(env, 'UPDATE card_contacts SET creator_id = ?, updated_at = CURRENT_TIMESTAMP WHERE creator_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.registrants = await this.runCount(env, 'UPDATE registrants SET line_id = ? WHERE line_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.userReferrers = await this.runCount(env, 'UPDATE users SET referrer_id = ? WHERE referrer_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.ordersBuyer = await this.runCount(env, 'UPDATE orders SET buyer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE buyer_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.ordersSponsor = await this.runCount(env, 'UPDATE orders SET sponsor_id = ?, updated_at = CURRENT_TIMESTAMP WHERE sponsor_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.ordersRecruiter = await this.runCount(env, 'UPDATE orders SET recruiter_id = ?, updated_at = CURRENT_TIMESTAMP WHERE recruiter_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.ordersPlacement = await this.runCount(env, 'UPDATE orders SET placement_parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE placement_parent_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.bonusBeneficiary = await this.runCount(env, 'UPDATE bonus_transactions SET beneficiary_id = ?, updated_at = CURRENT_TIMESTAMP WHERE beneficiary_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.bonusSource = await this.runCount(env, 'UPDATE bonus_transactions SET source_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE source_user_id = ?', [newLineId, oldLineId]).catch(() => 0);
    updated.removedLegacyUsers = await this.runCount(env, 'DELETE FROM users WHERE (line_id = ? OR row_id = ?) AND line_id <> ?', [oldLineId, oldLineId, newLineId]).catch(() => 0);

    await this.clearUserCache(env, oldLineId);
    await this.clearUserCache(env, newLineId);
    const merged = await D1ReadModule.first(env, 'SELECT * FROM users WHERE line_id = ? LIMIT 1', [newLineId]);
    return {
      success: true,
      data: {
        oldLineId,
        newLineId,
        updated,
        info: D1ReadModule.userRow(merged, 'identity_merged')
      }
    };
  },

  async upsertCard(payload, env) {
    if (!this.hasD1(env)) return null;
    await D1ReadModule.ensureCardAccessColumns(env);
    const card = this.normalizeCard(payload);
    if (!card.row_id) return { success: false, error: 'Missing card rowId' };
    const existing = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [card.row_id]);
    if (existing) {
      const actorId = this.text(payload.authenticatedUserId || payload.userId);
      const role = this.role(payload.authenticatedRole || payload.role);
      const networkId = this.text(payload.authenticatedNetworkId || payload.networkId);
      const existingLineId = this.text(existing.line_id);
      const existingCreatorId = this.text(existing.creator_id);
      const existingOwnerId = this.text(existing.owner_user_id);
      const existingNetworkId = this.text(existing.network_id);
      const isBoundToActor = !!(actorId && existingLineId && existingLineId === actorId);
      const isUnboundAdmin = role === 'admin' && !existingLineId;
      const isUnboundOwner = !!(actorId && !existingLineId && (existingCreatorId === actorId || existingOwnerId === actorId));
      const isUnboundStoreManager = !!(role === 'store' && !existingLineId && networkId && existingNetworkId && networkId === existingNetworkId);

      if (!isBoundToActor && !isUnboundAdmin && !isUnboundOwner && !isUnboundStoreManager) {
        return { success: false, error: 'Access Denied: cannot update this card' };
      }
    }
    const rawAwardUserId = this.text(payload.authenticatedUserId || card.creator_id || payload.creatorId || payload.userId);
    const awardUserId = await this.resolvePointAwardUserId(env, rawAwardUserId);
    const cardLineId = await this.resolvePointAwardUserId(env, card.line_id);
    const isOwnCard = !!(cardLineId && awardUserId && cardLineId === awardUserId);
    const duplicateForAward = !existing && !isOwnCard && await this.hasDuplicateCardForOwner(env, awardUserId, card, card.row_id);
    if (existing) {
      [
        'line_id','name','english_name','company_name','title','department','tax_id','mobile','office_phone',
        'extension','fax','email','website','socials','address','birthday','personality','hobbies','wealth',
        'health','career','services','notes','creator_id','image_url','custom_config','network_id','tags',
        'crm_status','crm_type','crm_next_action','crm_next_followup_at','crm_ai_suggestion'
      ].forEach(key => {
        if (card[key] === '' || card[key] === undefined || card[key] === null) card[key] = existing[key] || '';
      });
    }
    const access = D1ReadModule.inferCardAccess(card, { actorId: awardUserId });
    card.owner_user_id = access.ownerUserId;
    card.profile_user_id = access.profileUserId;
    card.source_type = access.sourceType;
    card.visibility = access.visibility;
    card.pool_eligible = access.poolEligible ? 1 : 0;
    card.ai_review_status = access.aiReviewStatus;
    card.crm_status = card.crm_status || (access.isSelfProfile ? '個人名片' : '新名片');
    card.crm_type = card.crm_type || D1ReadModule.inferCrmType(card);
    card.crm_next_action = card.crm_next_action || D1ReadModule.inferCrmNextAction(card, card.crm_type);
    card.crm_ai_suggestion = card.crm_ai_suggestion || D1ReadModule.inferCrmSuggestion(card, card.crm_type, card.crm_next_action);
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO card_contacts (row_id,line_id,name,english_name,company_name,title,department,tax_id,mobile,office_phone,extension,fax,email,website,socials,address,birthday,personality,hobbies,wealth,health,career,services,notes,creator_id,image_url,custom_config,network_id,tags,owner_user_id,profile_user_id,source_type,visibility,pool_eligible,ai_review_status,crm_status,crm_type,crm_next_action,crm_next_followup_at,crm_ai_suggestion,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(row_id) DO UPDATE SET
        line_id=excluded.line_id,name=excluded.name,english_name=excluded.english_name,company_name=excluded.company_name,title=excluded.title,
        department=excluded.department,tax_id=excluded.tax_id,mobile=excluded.mobile,office_phone=excluded.office_phone,
        extension=excluded.extension,fax=excluded.fax,email=excluded.email,website=excluded.website,socials=excluded.socials,
        address=excluded.address,birthday=excluded.birthday,personality=excluded.personality,hobbies=excluded.hobbies,
        wealth=excluded.wealth,health=excluded.health,career=excluded.career,services=excluded.services,notes=excluded.notes,
        creator_id=excluded.creator_id,image_url=excluded.image_url,custom_config=excluded.custom_config,network_id=excluded.network_id,
        tags=excluded.tags,owner_user_id=excluded.owner_user_id,profile_user_id=excluded.profile_user_id,source_type=excluded.source_type,
        visibility=excluded.visibility,pool_eligible=excluded.pool_eligible,ai_review_status=excluded.ai_review_status,
        crm_status=excluded.crm_status,crm_type=excluded.crm_type,crm_next_action=excluded.crm_next_action,
        crm_next_followup_at=excluded.crm_next_followup_at,crm_ai_suggestion=excluded.crm_ai_suggestion,
        updated_at=CURRENT_TIMESTAMP
    `).bind(card.row_id,card.line_id,card.name,card.english_name,card.company_name,card.title,card.department,card.tax_id,card.mobile,card.office_phone,card.extension,card.fax,card.email,card.website,card.socials,card.address,card.birthday,card.personality,card.hobbies,card.wealth,card.health,card.career,card.services,card.notes,card.creator_id,card.image_url,card.custom_config,card.network_id,card.tags,card.owner_user_id,card.profile_user_id,card.source_type,card.visibility,card.pool_eligible,card.ai_review_status,card.crm_status,card.crm_type,card.crm_next_action,card.crm_next_followup_at,card.crm_ai_suggestion).run();
    if (card.line_id) await this.upsertUser({ userId: card.line_id, name: card.name, phone: card.mobile || card.office_phone, industry: card.title || card.company_name, networkId: card.network_id, role: 'user' }, env);
    const pointAward = await this.awardCardScanPoints(env, awardUserId, card.row_id, card, !existing && !duplicateForAward && !isOwnCard);
    const awardedPoints = pointAward && pointAward.awarded ? pointAward.points : 0;
    const responseCard = D1ReadModule.cardRow(card);
    responseCard.awardedPoints = awardedPoints;
    responseCard.pointAward = pointAward;
    responseCard.rowId = card.row_id;
    return {
      success: true,
      data: responseCard,
      rowId: card.row_id,
      awardedPoints,
      pointAward
    };
  },

  async deleteCard(payload, env) {
    if (!this.hasD1(env)) return null;
    const rowId = this.pick(payload, ['rowId', 'row_id', 'id']);
    if (!rowId) return { success: false, error: 'Missing card rowId' };
    const card = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]);
    if (!card) return { success: false, error: 'Card not found' };
    const actorId = this.text(payload.authenticatedUserId || payload.userId);
    const role = this.role(payload.authenticatedRole || payload.role);
    const networkId = this.text(payload.authenticatedNetworkId || payload.networkId);
    const isOwner = actorId && (actorId === this.text(card.creator_id) || actorId === this.text(card.line_id));
    const isStoreManager = role === 'store' && networkId && networkId === this.text(card.network_id);
    if (role !== 'admin' && !isStoreManager && !isOwner) {
      return { success: false, error: 'Access Denied: cannot delete this card' };
    }
    await env.ACTMASTER_DB.prepare('DELETE FROM card_contacts WHERE row_id = ?').bind(rowId).run();
    return { success: true, rowId, deleted: true };
  },

  async unlinkCard(payload, env) {
    if (!this.hasD1(env)) return null;
    const rowId = this.pick(payload, ['rowId', 'row_id', 'id']);
    if (!rowId) return { success: false, error: 'Missing card rowId' };
    const card = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]);
    if (!card) return { success: false, error: 'Card not found' };
    const actorId = this.text(payload.authenticatedUserId || payload.userId);
    const role = this.role(payload.authenticatedRole || payload.role);
    const isOwner = actorId && (actorId === this.text(card.creator_id) || actorId === this.text(card.line_id));
    if (role !== 'admin' && !isOwner) {
      return { success: false, error: 'Access Denied: cannot unlink this card' };
    }
    await env.ACTMASTER_DB.prepare('UPDATE card_contacts SET line_id = "", updated_at = CURRENT_TIMESTAMP WHERE row_id = ?').bind(rowId).run();
    return { success: true, rowId, unlinked: true };
  }
};

const D1ConsistencyModule = {
  hasD1(env) {
    return !!(env && env.ACTMASTER_DB);
  },

  text(value) {
    return String(value ?? '').trim();
  },

  isPlaceholder(value) {
    const next = this.text(value);
    return !next || next === '未命名' || next === '姓名';
  },

  async first(env, sql, binds = []) {
    return await D1ReadModule.first(env, sql, binds);
  },

  async all(env, sql, binds = []) {
    return await D1ReadModule.all(env, sql, binds);
  },

  async ensureIndexes(env) {
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_line_id ON users(line_id)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_cards_line_id ON card_contacts(line_id)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_cards_creator_id ON card_contacts(creator_id)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_cards_updated_at ON card_contacts(updated_at)').run();
  },

  async audit(payload, env) {
    if (!this.hasD1(env)) return { success: false, error: 'D1 is not configured' };
    await this.ensureIndexes(env);
    const missingUsers = await this.all(env, `
      SELECT c.row_id AS card_row_id, c.line_id, c.name, c.mobile, c.office_phone, c.title, c.company_name, c.network_id
      FROM card_contacts c
      LEFT JOIN users u ON u.line_id = c.line_id
      WHERE c.line_id IS NOT NULL AND TRIM(c.line_id) <> '' AND u.line_id IS NULL
      ORDER BY c.updated_at DESC
      LIMIT 200
    `);
    const duplicateCards = await this.all(env, `
      SELECT line_id, COUNT(*) AS count, GROUP_CONCAT(row_id) AS card_row_ids
      FROM card_contacts
      WHERE line_id IS NOT NULL AND TRIM(line_id) <> ''
      GROUP BY line_id
      HAVING COUNT(*) > 1
      LIMIT 200
    `);
    const placeholderUsers = await this.all(env, `
      SELECT row_id, line_id, name, phone, role, network_id
      FROM users
      WHERE TRIM(COALESCE(name,'')) = '' OR name = '未命名' OR name = '姓名'
      LIMIT 200
    `);
    const placeholderCards = await this.all(env, `
      SELECT row_id, line_id, name, mobile, office_phone, network_id
      FROM card_contacts
      WHERE TRIM(COALESCE(name,'')) = '' OR name = '未命名' OR name = '姓名'
      LIMIT 200
    `);
    const mismatches = await this.all(env, `
      SELECT u.line_id, u.name AS user_name, c.name AS card_name, u.phone AS user_phone,
             COALESCE(c.mobile, c.office_phone, '') AS card_phone, u.industry AS user_industry,
             COALESCE(c.title, c.company_name, '') AS card_industry, u.role, c.row_id AS card_row_id
      FROM users u
      JOIN card_contacts c ON c.line_id = u.line_id
      WHERE (
        (TRIM(COALESCE(u.name,'')) = '' OR u.name = '未命名' OR u.name = '姓名') AND TRIM(COALESCE(c.name,'')) <> '' AND c.name NOT IN ('未命名','姓名')
      ) OR (
        (TRIM(COALESCE(c.name,'')) = '' OR c.name = '未命名' OR c.name = '姓名') AND TRIM(COALESCE(u.name,'')) <> '' AND u.name NOT IN ('未命名','姓名')
      ) OR (
        TRIM(COALESCE(u.phone,'')) = '' AND TRIM(COALESCE(c.mobile, c.office_phone, '')) <> ''
      ) OR (
        TRIM(COALESCE(c.mobile, c.office_phone, '')) = '' AND TRIM(COALESCE(u.phone,'')) <> ''
      )
      LIMIT 200
    `);
    return {
      success: true,
      data: {
        counts: {
          missingUsers: missingUsers.length,
          duplicateCardLineIds: duplicateCards.length,
          placeholderUsers: placeholderUsers.length,
          placeholderCards: placeholderCards.length,
          repairableMismatches: mismatches.length
        },
        missingUsers,
        duplicateCards,
        placeholderUsers,
        placeholderCards,
        mismatches
      }
    };
  },

  async clearUserCache(env, userId) {
    if (!env.ACTMASTER_KV || !userId) return;
    try { await env.ACTMASTER_KV.delete(`U_PROFILE_${userId}`); } catch (e) { console.error('KV consistency clear error', e); }
  },

  async repair(payload, env) {
    if (!this.hasD1(env)) return { success: false, error: 'D1 is not configured' };
    await this.ensureIndexes(env);
    const before = await this.audit(payload, env);
    const repaired = {
      createdUsersFromBoundCards: 0,
      updatedUsersFromCards: 0,
      updatedCardsFromUsers: 0,
      cacheCleared: 0
    };
    const touchedUsers = new Set();

    const missingUsers = before.data.missingUsers || [];
    for (const card of missingUsers) {
      const lineId = this.text(card.line_id);
      if (!lineId) continue;
      await env.ACTMASTER_DB.prepare(`
        INSERT INTO users (row_id,line_id,name,industry,phone,role,network_id)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(line_id) DO NOTHING
      `).bind(
        `USR_${lineId}`,
        lineId,
        this.text(card.name) || '未命名',
        this.text(card.title || card.company_name),
        this.text(card.mobile || card.office_phone),
        'user',
        this.text(card.network_id) || 'admin'
      ).run();
      repaired.createdUsersFromBoundCards += 1;
      touchedUsers.add(lineId);
    }

    const mismatches = before.data.mismatches || [];
    for (const row of mismatches) {
      const lineId = this.text(row.line_id);
      if (!lineId) continue;
      const userName = this.text(row.user_name);
      const cardName = this.text(row.card_name);
      const userPhone = this.text(row.user_phone);
      const cardPhone = this.text(row.card_phone);
      const userIndustry = this.text(row.user_industry);
      const cardIndustry = this.text(row.card_industry);

      if ((this.isPlaceholder(userName) || !userPhone || !userIndustry) && (!this.isPlaceholder(cardName) || cardPhone || cardIndustry)) {
        await env.ACTMASTER_DB.prepare(`
          UPDATE users
          SET name = CASE WHEN (TRIM(COALESCE(name,'')) = '' OR name IN ('未命名','姓名')) AND ? <> '' THEN ? ELSE name END,
              phone = CASE WHEN TRIM(COALESCE(phone,'')) = '' AND ? <> '' THEN ? ELSE phone END,
              industry = CASE WHEN TRIM(COALESCE(industry,'')) = '' AND ? <> '' THEN ? ELSE industry END
          WHERE line_id = ?
        `).bind(cardName, cardName, cardPhone, cardPhone, cardIndustry, cardIndustry, lineId).run();
        repaired.updatedUsersFromCards += 1;
        touchedUsers.add(lineId);
      }

      if ((this.isPlaceholder(cardName) || !cardPhone) && (!this.isPlaceholder(userName) || userPhone)) {
        await env.ACTMASTER_DB.prepare(`
          UPDATE card_contacts
          SET name = CASE WHEN (TRIM(COALESCE(name,'')) = '' OR name IN ('未命名','姓名')) AND ? <> '' THEN ? ELSE name END,
              mobile = CASE WHEN TRIM(COALESCE(mobile,'')) = '' AND TRIM(COALESCE(office_phone,'')) = '' AND ? <> '' THEN ? ELSE mobile END,
              updated_at = CURRENT_TIMESTAMP
          WHERE row_id = ?
        `).bind(userName, userName, userPhone, userPhone, row.card_row_id).run();
        repaired.updatedCardsFromUsers += 1;
        touchedUsers.add(lineId);
      }
    }

    for (const userId of touchedUsers) {
      await this.clearUserCache(env, userId);
      repaired.cacheCleared += 1;
    }
    const after = await this.audit(payload, env);
    return { success: true, data: { repaired, before: before.data.counts, after: after.data.counts } };
  },

  async listDuplicateBindings(payload, env) {
    if (!this.hasD1(env)) return { success: false, error: 'D1 is not configured' };
    await this.ensureIndexes(env);
    const limit = Math.min(Math.max(Number(payload.limit || 100) || 100, 1), 300);
    const groups = await this.all(env, `
      SELECT line_id, COUNT(*) AS count
      FROM card_contacts
      WHERE line_id IS NOT NULL AND TRIM(line_id) <> ''
      GROUP BY line_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC, line_id
      LIMIT ?
    `, [limit]);
    const data = [];
    for (const group of groups) {
      const lineId = this.text(group.line_id);
      const cards = await this.all(env, `
        SELECT row_id, line_id, name, company_name, title, mobile, office_phone,
               creator_id, network_id, created_at, updated_at
        FROM card_contacts
        WHERE line_id = ?
        ORDER BY
          CASE WHEN creator_id = line_id THEN 0 ELSE 1 END,
          updated_at DESC,
          created_at DESC,
          row_id DESC
      `, [lineId]);
      data.push({ lineId, count: Number(group.count || cards.length), cards });
    }
    return { success: true, data };
  },

  async resolveDuplicateBinding(payload, env) {
    if (!this.hasD1(env)) return { success: false, error: 'D1 is not configured' };
    await this.ensureIndexes(env);
    const lineId = this.text(payload.lineId);
    const keepRowId = this.text(payload.keepRowId);
    const confirmed = payload.confirmResolve === true || String(payload.confirmResolve || '').toLowerCase() === 'true';
    if (!confirmed) return { success: false, error: 'Missing duplicate binding confirmation' };
    if (!lineId || !keepRowId) return { success: false, error: 'Missing lineId or keepRowId' };

    const cards = await this.all(env, `
      SELECT row_id, line_id, name, company_name, title, mobile, office_phone, creator_id, network_id
      FROM card_contacts
      WHERE line_id = ?
      ORDER BY updated_at DESC, created_at DESC
    `, [lineId]);
    if (cards.length <= 1) return { success: false, error: 'This LINE ID is not duplicated' };
    if (!cards.some(card => this.text(card.row_id) === keepRowId)) {
      return { success: false, error: 'Keep card is not in this duplicate group' };
    }

    const requested = Array.isArray(payload.unlinkRowIds)
      ? payload.unlinkRowIds.map(id => this.text(id)).filter(Boolean)
      : cards.map(card => this.text(card.row_id)).filter(id => id && id !== keepRowId);
    const unlinkRowIds = Array.from(new Set(requested)).filter(id => id !== keepRowId && cards.some(card => this.text(card.row_id) === id));
    if (!unlinkRowIds.length) return { success: false, error: 'No duplicate card selected to unlink' };

    const placeholders = unlinkRowIds.map(() => '?').join(',');
    const result = await env.ACTMASTER_DB.prepare(`
      UPDATE card_contacts
      SET line_id = '', updated_at = CURRENT_TIMESTAMP
      WHERE line_id = ? AND row_id IN (${placeholders}) AND row_id <> ?
    `).bind(lineId, ...unlinkRowIds, keepRowId).run();
    await this.clearUserCache(env, lineId);
    const remaining = await this.first(env, `
      SELECT COUNT(*) AS count
      FROM card_contacts
      WHERE line_id = ?
    `, [lineId]);
    return {
      success: true,
      data: {
        lineId,
        keepRowId,
        unlinkedRowIds,
        changed: result?.meta?.changes || unlinkRowIds.length,
        remainingCount: Number(remaining?.count || 0)
      }
    };
  }
};

const D1ActivityModule = {
  hasD1(env) {
    return !!(env && env.ACTMASTER_DB);
  },

  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  pick(source, keys, fallback = '') {
    for (const key of keys) {
      const value = source && source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return fallback;
  },

  bool(value) {
    return value === true || String(value ?? '').toLowerCase() === 'true' || String(value ?? '') === '1';
  },

  activityRow(row) {
    if (!row) return null;
    return {
      rowId: this.text(row.activity_id),
      activityId: this.text(row.activity_id),
      userId: this.text(row.creator_id),
      name: this.text(row.name, '未命名活動'),
      activityName: this.text(row.name, '未命名活動'),
      activityType: this.text(row.type, '活動'),
      feeType: this.text(row.fee_type, '免費'),
      price: Number(row.price || 0) || 0,
      startTime: this.text(row.start_time),
      endTime: this.text(row.end_time),
      description: this.text(row.description),
      imageUrl: this.text(row.image_url),
      status: this.text(row.status, '上架'),
      networkId: this.text(row.network_id, 'admin'),
      network_id: this.text(row.network_id, 'admin'),
      nfcCheckinStart: this.text(row.nfc_checkin_start),
      nfcCheckinEnd: this.text(row.nfc_checkin_end),
      nfcCheckinSameDayOnly: row.nfc_same_day_only !== 0,
      createdAt: this.text(row.created_at),
      '活動ID': this.text(row.activity_id),
      '活動名稱': this.text(row.name, '未命名活動'),
      '活動類型': this.text(row.type, '活動'),
      '收費方式': this.text(row.fee_type, '免費'),
      '金額': Number(row.price || 0) || 0,
      '開始時間': this.text(row.start_time),
      '結束時間': this.text(row.end_time),
      '活動說明': this.text(row.description),
      '宣傳圖': this.text(row.image_url),
      '狀態': this.text(row.status, '上架'),
      '歸屬網': this.text(row.network_id, 'admin'),
      'NFC簽到開始': this.text(row.nfc_checkin_start),
      'NFC簽到結束': this.text(row.nfc_checkin_end),
      'NFC限當日': row.nfc_same_day_only !== 0
    };
  },

  registrantRow(row) {
    if (!row) return null;
    const checked = Number(row.checked_in || 0) === 1;
    const cancelled = this.text(row.status) === 'cancelled';
    return {
      rowId: this.text(row.row_id),
      registrationId: this.text(row.row_id),
      lineId: this.text(row.line_id),
      userId: this.text(row.line_id),
      activityId: this.text(row.activity_id),
      activityName: this.text(row.activity_name),
      name: this.text(row.name, '未命名'),
      phone: this.text(row.phone),
      identity: this.text(row.identity, '會員'),
      checkedIn: checked,
      checkinStatus: checked,
      paymentStatus: this.text(row.payment_status),
      status: cancelled ? 'cancelled' : (checked ? 'checkedin' : 'active'),
      amount: Number(row.amount || 0) || 0,
      startTime: this.text(row.start_time),
      description: this.text(row.description),
      imageUrl: this.text(row.image_url),
      nfcCheckinTime: this.text(row.nfc_checkin_time),
      createdAt: this.text(row.created_at),
      cancelledAt: this.text(row.cancelled_at),
      '報名ID': this.text(row.row_id),
      'LINE ID': this.text(row.line_id),
      '活動ID': this.text(row.activity_id),
      '活動名稱': this.text(row.activity_name),
      '姓名': this.text(row.name, '未命名'),
      '手機': this.text(row.phone),
      '身份': this.text(row.identity, '會員'),
      '簽到': checked,
      '付款狀態': this.text(row.payment_status),
      '報名狀態': cancelled ? '已取消' : '有效',
      '金額': Number(row.amount || 0) || 0,
      '開始時間': this.text(row.start_time),
      '活動說明': this.text(row.description),
      '宣傳圖': this.text(row.image_url),
      '報名時間': this.text(row.created_at)
    };
  },

  normalizeActivity(payload = {}) {
    const data = payload.data || payload;
    const activityId = this.pick(data, ['activityId', '活動ID'], this.pick(payload, ['activityId'])) || `ACT_${Date.now()}`;
    return {
      activity_id: activityId,
      name: this.pick(data, ['activityName', 'name', '活動名稱'], '未命名活動'),
      type: this.pick(data, ['activityType', 'type', '活動類型'], '活動'),
      fee_type: this.pick(data, ['feeType', '收費方式'], '免費'),
      price: Number(this.pick(data, ['price', '金額'], '0')) || 0,
      start_time: this.pick(data, ['startTime', '開始時間']),
      end_time: this.pick(data, ['endTime', '結束時間']),
      description: this.pick(data, ['description', '活動說明']),
      image_url: this.pick(data, ['imageUrl', '宣傳圖']),
      creator_id: this.pick(data, ['userId', 'creatorId'], this.pick(payload, ['userId'], 'admin')),
      network_id: this.pick(payload, ['authenticatedNetworkId'], this.pick(data, ['networkId', 'network_id', '歸屬網'], this.pick(payload, ['networkId'], 'admin'))),
      status: this.pick(data, ['status', '狀態'], '上架'),
      nfc_checkin_start: this.pick(data, ['nfcCheckinStart', 'NFC簽到開始']),
      nfc_checkin_end: this.pick(data, ['nfcCheckinEnd', 'NFC簽到結束']),
      nfc_same_day_only: this.bool(data.nfcCheckinSameDayOnly ?? data['NFC限當日'] ?? true) ? 1 : 0,
      is_series: this.bool(data.isBatch || data.isSeries) ? 1 : 0
    };
  },

  async ensureActivityNetworkScope(env) {
    if (!this.hasD1(env) || this._networkScopeReady) return;
    await env.ACTMASTER_DB.prepare("ALTER TABLE activities ADD COLUMN network_id TEXT NOT NULL DEFAULT 'admin'").run().catch(() => null);
    await env.ACTMASTER_DB.prepare(`
      UPDATE activities
      SET network_id = COALESCE(
        (
          SELECT CASE
            WHEN LOWER(COALESCE(users.role, '')) IN ('store','tenant') OR users.role IN ('店長','租戶') THEN users.line_id
            WHEN NULLIF(users.network_id, '') IS NOT NULL AND users.network_id <> 'admin' THEN users.network_id
            WHEN NULLIF(users.referrer_id, '') IS NOT NULL THEN users.referrer_id
            ELSE 'admin'
          END
          FROM users
          WHERE users.line_id = activities.creator_id
             OR users.row_id = activities.creator_id
          LIMIT 1
        ),
        'admin'
      )
      WHERE network_id = '' OR network_id = 'admin'
    `).run().catch(() => null);
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_activities_network_status ON activities(network_id, status, start_time)').run().catch(() => null);
    this._networkScopeReady = true;
  },

  async listActivities(payload, env, actor = null) {
    if (!this.hasD1(env)) return null;
    await this.ensureActivityNetworkScope(env);
    const role = actor
      ? SecurityModule.normalizeRole(actor.role)
      : SecurityModule.normalizeRole(payload.authenticatedRole || '');
    const requestedNetworkId = this.text(payload.networkId || payload.net || '');
    const actorNetworkId = this.text(actor?.networkId || payload.authenticatedNetworkId || 'admin', 'admin');
    const networkId = requestedNetworkId || actorNetworkId;
    const actorId = this.text(actor?.userId || payload.authenticatedUserId || payload.userId);
    const isAdmin = role === 'admin';
    const adminWantsAll = isAdmin && (!requestedNetworkId || requestedNetworkId === 'all' || requestedNetworkId === 'admin');
    const rows = adminWantsAll
      ? await D1ReadModule.all(env, 'SELECT * FROM activities ORDER BY COALESCE(start_time, created_at) DESC, created_at DESC LIMIT 500')
      : networkId === 'admin'
        ? actorId
          ? await D1ReadModule.all(env, `
              SELECT * FROM activities
              WHERE COALESCE(NULLIF(network_id, ''), 'admin') = 'admin'
                 OR creator_id = ?
              ORDER BY COALESCE(start_time, created_at) DESC, created_at DESC
              LIMIT 500
            `, [actorId])
          : await D1ReadModule.all(env, `
            SELECT * FROM activities
            WHERE COALESCE(NULLIF(network_id, ''), 'admin') = 'admin'
            ORDER BY COALESCE(start_time, created_at) DESC, created_at DESC
            LIMIT 500
          `)
      : actorId
        ? await D1ReadModule.all(env, `
            SELECT * FROM activities
            WHERE COALESCE(NULLIF(network_id, ''), 'admin') = ?
               OR creator_id = ?
            ORDER BY COALESCE(start_time, created_at) DESC, created_at DESC
            LIMIT 500
          `, [networkId, actorId])
        : await D1ReadModule.all(env, `
            SELECT * FROM activities
            WHERE COALESCE(NULLIF(network_id, ''), 'admin') = ?
            ORDER BY COALESCE(start_time, created_at) DESC, created_at DESC
            LIMIT 500
          `, [networkId]);
    return { success: true, data: rows.map(row => this.activityRow(row)).filter(Boolean) };
  },

  async getActivityById(payload, env, actor = null) {
    if (!this.hasD1(env)) return null;
    await this.ensureActivityNetworkScope(env);
    const activityId = this.pick(payload, ['activityId', '活動ID']);
    if (!activityId) return { success: false, error: 'Missing activityId' };
    const row = await D1ReadModule.first(env, 'SELECT * FROM activities WHERE activity_id = ? LIMIT 1', [activityId]);
    if (!row) return { success: false, error: '找不到活動資料' };

    const role = actor
      ? SecurityModule.normalizeRole(actor.role)
      : SecurityModule.normalizeRole(payload.authenticatedRole || '');
    const actorId = this.text(actor?.userId || payload.authenticatedUserId || payload.userId);
    const requestedNetwork = this.text(payload.networkId || payload.net || '');
    const actorNetwork = requestedNetwork || this.text(actor?.networkId || payload.authenticatedNetworkId || 'admin', 'admin');
    const activityNetwork = this.text(row.network_id, 'admin');
    const sameNetwork = (!activityNetwork || activityNetwork === 'admin')
      ? actorNetwork === 'admin'
      : activityNetwork === actorNetwork;

    let hasRegistration = false;
    if (actorId) {
      const reg = await D1ReadModule.first(env, "SELECT row_id FROM registrants WHERE activity_id = ? AND line_id = ? AND status <> 'cancelled' LIMIT 1", [activityId, actorId]).catch(() => null);
      hasRegistration = !!reg;
    }

    if (role !== 'admin' && !sameNetwork && !hasRegistration) {
      return { success: false, error: 'Access Denied: Activity outside your scope' };
    }
    return { success: true, data: this.activityRow(row) };
  },

  getActivityNetwork(activity) {
    const explicitNetwork = this.text(activity && (
      activity.networkId ||
      activity.network_id ||
      activity.net ||
      activity['歸屬網']
    ));
    if (explicitNetwork) return explicitNetwork;
    const creatorId = this.text(activity && (activity.creatorId || activity.creator_id || activity.userId));
    return creatorId && creatorId !== 'admin' ? creatorId : 'admin';
  },

  filterResultByActor(result, payload = {}, actor = null) {
    const role = actor
      ? SecurityModule.normalizeRole(actor.role)
      : SecurityModule.normalizeRole(payload.authenticatedRole || '');
    if (role === 'admin') return result;
    const requestedNetworkId = this.text(payload.networkId || payload.net || '');
    const networkId = requestedNetworkId || this.text(actor?.networkId || payload.authenticatedNetworkId || 'admin', 'admin');
    const canSee = (activity) => {
      const activityNetwork = this.getActivityNetwork(activity);
      if (!activityNetwork || activityNetwork === 'admin') return networkId === 'admin';
      return activityNetwork === networkId;
    };
    if (Array.isArray(result)) return result.filter(canSee);
    if (!result || typeof result !== 'object') return result;
    if (Array.isArray(result.data)) return { ...result, data: result.data.filter(canSee) };
    if (Array.isArray(result.activities)) return { ...result, activities: result.activities.filter(canSee) };
    if (Array.isArray(result.items)) return { ...result, items: result.items.filter(canSee) };
    return result;
  },

  async upsertActivity(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureActivityNetworkScope(env);
    const activity = this.normalizeActivity(payload);
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO activities (activity_id,name,type,fee_type,price,start_time,end_time,description,image_url,creator_id,network_id,status,is_series,nfc_checkin_start,nfc_checkin_end,nfc_same_day_only)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(activity_id) DO UPDATE SET
        name=excluded.name,type=excluded.type,fee_type=excluded.fee_type,price=excluded.price,start_time=excluded.start_time,
        end_time=excluded.end_time,description=excluded.description,image_url=excluded.image_url,network_id=excluded.network_id,status=excluded.status,
        is_series=excluded.is_series,nfc_checkin_start=excluded.nfc_checkin_start,nfc_checkin_end=excluded.nfc_checkin_end,
        nfc_same_day_only=excluded.nfc_same_day_only
    `).bind(activity.activity_id,activity.name,activity.type,activity.fee_type,activity.price,activity.start_time,activity.end_time,activity.description,activity.image_url,activity.creator_id,activity.network_id,activity.status,activity.is_series,activity.nfc_checkin_start,activity.nfc_checkin_end,activity.nfc_same_day_only).run();
    return activity;
  },

  async bulkAddRegistrants(payload, env) {
    const activity = await this.upsertActivity(payload, env);
    if (!activity) return null;
    const names = Array.isArray(payload.names) ? payload.names : [];
    for (let i = 0; i < names.length; i++) {
      const name = this.text(names[i]);
      if (!name) continue;
      await this.insertRegistration({
        activityId: activity.activity_id,
        activityName: activity.name,
        name,
        identity: payload.defaultIdentity || '會員',
        amount: activity.price,
        paymentStatus: activity.price > 0 ? '待付款' : '免費',
        startTime: activity.start_time,
        description: activity.description,
        imageUrl: activity.image_url
      }, env);
    }
    return { success: true, data: { activityId: activity.activity_id, inserted: names.filter(Boolean).length } };
  },

  async insertRegistration(payload, env) {
    const activityId = this.pick(payload, ['activityId', '活動ID']);
    if (!activityId) return { success: false, error: 'Missing activityId' };
    const lineId = this.pick(payload, ['userId', 'lineId', 'LINE ID']);
    if (lineId) {
      const existing = await D1ReadModule.first(env, "SELECT * FROM registrants WHERE activity_id = ? AND line_id = ? AND status <> 'cancelled' LIMIT 1", [activityId, lineId]);
      if (existing) return { success: true, data: this.registrantRow(existing), existed: true };
    }
    const activity = await D1ReadModule.first(env, 'SELECT * FROM activities WHERE activity_id = ? LIMIT 1', [activityId]);
    const rowId = this.pick(payload, ['rowId', 'registrationId']) || `REG_${activityId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const activityName = this.pick(payload, ['activityName', '活動名稱'], activity ? activity.name : '');
    const name = this.pick(payload, ['userName', 'name', '姓名'], '未命名');
    const phone = this.pick(payload, ['userPhone', 'phone', '手機']);
    const identity = this.pick(payload, ['defaultIdentity', 'identity', '身份'], '會員');
    const amount = Number(this.pick(payload, ['amount', 'price', '金額'], activity ? activity.price : 0)) || 0;
    const payment = this.pick(payload, ['paymentStatus', '付款狀態'], amount > 0 ? '待付款' : '免費');
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO registrants (row_id,line_id,activity_name,name,phone,identity,checked_in,payment_status,activity_id,amount,start_time,description,image_url,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(rowId,lineId,activityName,name,phone,identity,0,payment,activityId,amount,activity ? activity.start_time : '',activity ? activity.description : '',activity ? activity.image_url : '','active').run();
    return { success: true, data: { rowId, activityId }, existed: false };
  },

  async listRegistrants(payload, env) {
    if (!this.hasD1(env)) return null;
    const activityId = this.pick(payload, ['activityId', '活動ID']);
    const rows = activityId
      ? await D1ReadModule.all(env, 'SELECT * FROM registrants WHERE activity_id = ? ORDER BY created_at DESC LIMIT 500', [activityId])
      : await D1ReadModule.all(env, 'SELECT * FROM registrants ORDER BY created_at DESC LIMIT 500');
    return { success: true, data: rows.map(row => this.registrantRow(row)).filter(Boolean) };
  },

  async listMyRegistrations(payload, env) {
    if (!this.hasD1(env)) return null;
    const userId = this.pick(payload, ['userId', 'lineId']);
    const phone = this.pick(payload, ['phone', '手機']);
    const name = this.pick(payload, ['name', '姓名']);
    const rows = await D1ReadModule.all(env, `
      SELECT * FROM registrants
      WHERE (? <> '' AND line_id = ?) OR (? <> '' AND phone = ?) OR (? <> '' AND name = ?)
      ORDER BY created_at DESC LIMIT 200
    `, [userId,userId,phone,phone,name,name]);
    return { success: true, data: rows.map(row => this.registrantRow(row)).filter(Boolean) };
  },

  async cancelRegistration(payload, env) {
    const rowId = this.pick(payload, ['rowId', 'registrationId']);
    if (!rowId) return { success: false, error: 'Missing registrationId' };
    await env.ACTMASTER_DB.prepare("UPDATE registrants SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE row_id = ?").bind(rowId).run();
    return { success: true, data: { rowId, status: 'cancelled' } };
  },

  async toggleCheckin(payload, env, source = 'manual') {
    const rowId = this.pick(payload, ['rowId', 'registrationId', 'verifyCheckin']);
    if (!rowId) return { success: false, error: 'Missing registrationId' };
    const row = await D1ReadModule.first(env, "SELECT * FROM registrants WHERE row_id = ? AND status <> 'cancelled' LIMIT 1", [rowId]);
    if (!row) return { success: false, error: '找不到有效報名資料' };
    const next = Number(row.checked_in || 0) === 1 ? 0 : 1;
    await env.ACTMASTER_DB.prepare('UPDATE registrants SET checked_in = ?, nfc_checkin_time = ?, nfc_checkin_source = ? WHERE row_id = ?')
      .bind(next, next ? new Date().toISOString() : '', source, rowId).run();
    return { success: true, data: { rowId, checkedIn: next === 1 } };
  },

  taipeiNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date()).reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const time = `${parts.hour}:${parts.minute}`;
    return { date, time, localDateTime: `${date}T${time}` };
  },

  normalizeNfcWindowValue(value) {
    const raw = this.text(value).trim();
    if (!raw) return '';
    return raw.replace(' ', 'T').substring(0, 16);
  },

  isFullNfcDateTime(value) {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(this.normalizeNfcWindowValue(value));
  },

  async nfcCheckin(payload, env) {
    const activityId = this.pick(payload, ['activityId', 'checkin']);
    const userId = this.pick(payload, ['userId', 'lineId']);
    if (!activityId || !userId) return { success: false, error: '缺少活動或會員資料' };
    const activity = await D1ReadModule.first(env, 'SELECT * FROM activities WHERE activity_id = ? LIMIT 1', [activityId]);
    if (!activity || this.text(activity.status) !== '上架') return { success: false, error: '活動不存在或已下架' };
    const reg = await D1ReadModule.first(env, "SELECT * FROM registrants WHERE activity_id = ? AND line_id = ? AND status <> 'cancelled' LIMIT 1", [activityId, userId]);
    if (!reg) return { success: false, error: '尚未報名，無法簽到' };

    const start = this.text(activity.nfc_checkin_start);
    const end = this.text(activity.nfc_checkin_end);
    if (start && end) {
      const now = this.taipeiNow();
      const startWindow = this.normalizeNfcWindowValue(start);
      const endWindow = this.normalizeNfcWindowValue(end);
      if (this.isFullNfcDateTime(startWindow) || this.isFullNfcDateTime(endWindow)) {
        if (!this.isFullNfcDateTime(startWindow) || !this.isFullNfcDateTime(endWindow)) {
          return { success: false, error: 'NFC 簽到起訖需同時包含日期與時間' };
        }
        if (now.localDateTime < startWindow || now.localDateTime > endWindow) return { success: false, error: '目前不在 NFC 簽到時段' };
      } else {
        const activityDate = this.text(activity.start_time).substring(0, 10);
        if (activity.nfc_same_day_only !== 0 && activityDate && activityDate !== now.date) {
          return { success: false, error: 'NFC 簽到限活動當日' };
        }
        if (now.time < startWindow || now.time > endWindow) return { success: false, error: '目前不在 NFC 簽到時段' };
      }
    }

    if (Number(reg.checked_in || 0) === 1) return { success: true, data: { alreadyChecked: true, rowId: reg.row_id } };
    await env.ACTMASTER_DB.prepare('UPDATE registrants SET checked_in = 1, nfc_checkin_time = ?, nfc_checkin_source = ? WHERE row_id = ?')
      .bind(new Date().toISOString(), 'nfc', reg.row_id).run();
    return { success: true, data: { alreadyChecked: false, rowId: reg.row_id, awardedPoints: Number(activity.reward_points || 0) || 0 } };
  },

  async confirmPayment(payload, env) {
    const rowId = this.pick(payload, ['rowId', 'registrationId']);
    if (!rowId) return { success: false, error: 'Missing registrationId' };
    await env.ACTMASTER_DB.prepare("UPDATE registrants SET payment_status = '已付款' WHERE row_id = ?").bind(rowId).run();
    return { success: true, data: { rowId, paymentStatus: '已付款' } };
  },

  async removeActivity(payload, env) {
    const activityId = this.pick(payload, ['activityId', '活動ID']);
    if (!activityId) return { success: false, error: 'Missing activityId' };
    return await this.setActivityStatus({ activityId, status: '下架' }, env);
  },

  async setActivityStatus(payload, env) {
    const activityId = this.pick(payload, ['activityId', '活動ID']);
    const status = this.pick(payload, ['status', '狀態'], '上架') === '下架' ? '下架' : '上架';
    if (!activityId) return { success: false, error: 'Missing activityId' };

    const existing = await D1ReadModule.first(env, 'SELECT activity_id FROM activities WHERE activity_id = ? LIMIT 1', [activityId]);
    if (!existing) return { success: false, error: '找不到活動資料' };

    if (status === '下架') {
      await env.ACTMASTER_DB.prepare("UPDATE activities SET status = '下架', ever_unpublished = 1 WHERE activity_id = ?").bind(activityId).run();
    } else {
      await env.ACTMASTER_DB.prepare("UPDATE activities SET status = '上架' WHERE activity_id = ?").bind(activityId).run();
    }
    return { success: true, data: { activityId, status } };
  },

  async duplicateActivity(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureActivityNetworkScope(env);
    const activityId = this.pick(payload, ['activityId', '活動ID']);
    if (!activityId) return { success: false, error: 'Missing activityId' };
    const source = await D1ReadModule.first(env, 'SELECT * FROM activities WHERE activity_id = ? LIMIT 1', [activityId]);
    if (!source) return { success: false, error: '找不到活動資料' };

    const newActivityId = this.pick(payload, ['newActivityId']) || `ACT_${Date.now()}`;
    const copiedName = `${this.text(source.name, '未命名活動')}（複製）`;
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO activities (
        activity_id,name,type,fee_type,price,start_time,end_time,description,image_url,
        creator_id,network_id,status,is_series,nfc_checkin_start,nfc_checkin_end,nfc_same_day_only
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      newActivityId,
      copiedName,
      this.text(source.type, '活動'),
      this.text(source.fee_type, '免費'),
      Number(source.price || 0) || 0,
      this.text(source.start_time),
      this.text(source.end_time),
      this.text(source.description),
      this.text(source.image_url),
      this.text(source.creator_id, this.text(payload.authenticatedUserId || payload.userId, 'admin')),
      this.text(source.network_id, this.text(payload.authenticatedNetworkId || payload.networkId, 'admin')),
      '下架',
      Number(source.is_series || 0) || 0,
      this.text(source.nfc_checkin_start),
      this.text(source.nfc_checkin_end),
      source.nfc_same_day_only === 0 ? 0 : 1
    ).run();

    const copied = await D1ReadModule.first(env, 'SELECT * FROM activities WHERE activity_id = ? LIMIT 1', [newActivityId]);
    return { success: true, data: { activityId: newActivityId, sourceActivityId: activityId, activity: this.activityRow(copied) } };
  }
};

const D1PersonalTaskModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  number(value, fallback = 0) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  },

  async ensure(env) {
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS personal_tasks (
        task_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        task_type TEXT NOT NULL DEFAULT 'followup',
        related_name TEXT NOT NULL DEFAULT '',
        related_card_id TEXT NOT NULL DEFAULT '',
        start_time TEXT NOT NULL DEFAULT '',
        end_time TEXT NOT NULL DEFAULT '',
        remind_minutes INTEGER NOT NULL DEFAULT 30,
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        google_event_url TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT NOT NULL DEFAULT ''
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_personal_tasks_user_time ON personal_tasks(user_id, start_time)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_personal_tasks_user_status ON personal_tasks(user_id, status)').run();
  },

  taskRow(row) {
    if (!row) return null;
    return {
      taskId: this.text(row.task_id),
      userId: this.text(row.user_id),
      title: this.text(row.title),
      taskType: this.text(row.task_type, 'followup'),
      relatedName: this.text(row.related_name),
      relatedCardId: this.text(row.related_card_id),
      startTime: this.text(row.start_time),
      endTime: this.text(row.end_time),
      remindMinutes: this.number(row.remind_minutes, 30),
      notes: this.text(row.notes),
      status: this.text(row.status, 'pending'),
      googleEventUrl: this.text(row.google_event_url),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at),
      completedAt: this.text(row.completed_at)
    };
  },

  ownUserId(payload) {
    return this.text(payload.authenticatedUserId || payload.userId);
  },

  async list(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const rows = await D1ReadModule.all(env, `
      SELECT * FROM personal_tasks
      WHERE user_id = ? AND status <> 'deleted'
      ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
               COALESCE(NULLIF(start_time, ''), created_at) ASC,
               updated_at DESC
      LIMIT 200
    `, [userId]);
    return { success: true, data: rows.map(row => this.taskRow(row)).filter(Boolean) };
  },

  async save(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const taskId = this.text(payload.taskId || payload.task_id) || `TASK_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const title = this.text(payload.title);
    if (!title) return { success: false, error: '請輸入標題' };
    const taskType = this.text(payload.taskType || payload.task_type, 'followup');
    const relatedName = this.text(payload.relatedName || payload.related_name);
    const relatedCardId = this.text(payload.relatedCardId || payload.related_card_id);
    const startTime = this.text(payload.startTime || payload.start_time);
    const endTime = this.text(payload.endTime || payload.end_time);
    const remindMinutes = this.number(payload.remindMinutes || payload.remind_minutes, 30);
    const notes = this.text(payload.notes);
    const googleEventUrl = this.text(payload.googleEventUrl || payload.google_event_url);

    await env.ACTMASTER_DB.prepare(`
      INSERT INTO personal_tasks (
        task_id,user_id,title,task_type,related_name,related_card_id,start_time,end_time,
        remind_minutes,notes,status,google_event_url,created_at,updated_at,completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '')
      ON CONFLICT(task_id) DO UPDATE SET
        title=excluded.title,
        task_type=excluded.task_type,
        related_name=excluded.related_name,
        related_card_id=excluded.related_card_id,
        start_time=excluded.start_time,
        end_time=excluded.end_time,
        remind_minutes=excluded.remind_minutes,
        notes=excluded.notes,
        google_event_url=excluded.google_event_url,
        updated_at=CURRENT_TIMESTAMP
      WHERE personal_tasks.user_id = excluded.user_id
    `).bind(taskId, userId, title, taskType, relatedName, relatedCardId, startTime, endTime, remindMinutes, notes, googleEventUrl).run();

    const row = await D1ReadModule.first(env, 'SELECT * FROM personal_tasks WHERE task_id = ? AND user_id = ? LIMIT 1', [taskId, userId]);
    return { success: true, data: this.taskRow(row) };
  },

  async setStatus(payload, env, status) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    const taskId = this.text(payload.taskId || payload.task_id);
    if (!userId || !taskId) return { success: false, error: 'Missing taskId' };
    const completedAt = status === 'done' ? new Date().toISOString() : '';
    await env.ACTMASTER_DB.prepare(`
      UPDATE personal_tasks
      SET status = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE task_id = ? AND user_id = ?
    `).bind(status, completedAt, taskId, userId).run();
    return { success: true, data: { taskId, status } };
  }
};

const D1PersonalAssistantCoreModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  ownUserId(payload) {
    return this.text(payload.authenticatedUserId || payload.userId);
  },

  async ensure(env) {
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS personal_ai_cores (
        user_id TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL DEFAULT '',
        core_json TEXT NOT NULL DEFAULT '{}',
        summary_json TEXT NOT NULL DEFAULT '{}',
        summary_text TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_personal_ai_cores_updated ON personal_ai_cores(updated_at)').run();
  },

  parseCore(payload) {
    let core = payload && (payload.core || payload.coreJson || payload.data);
    if (typeof core === 'string') core = JSON.parse(core);
    if (!core || typeof core !== 'object' || Array.isArray(core)) throw new Error('JSON 格式不正確');
    if (core.schemaVersion !== 'personal_ai_assistant_core_v1') throw new Error('schemaVersion 不正確');
    return core;
  },

  summarize(core) {
    core = core || {};
    const owner = core.ownerProfile || {};
    const biz = core.businessIdentity || {};
    const crm = core.crmRules || {};
    const daily = core.dailyAssistantRules || {};
    const offers = Array.isArray(core.productsAndOffers) ? core.productsAndOffers : [];
    const tags = Array.isArray(crm.defaultTags) ? crm.defaultTags.filter(Boolean).slice(0, 12) : [];
    return {
      displayName: this.text(owner.displayName, '未命名'),
      companyName: this.text(owner.companyName),
      title: this.text(owner.title),
      positioning: this.text(biz.oneLinePositioning),
      serviceSummary: this.text(biz.serviceSummary),
      productCount: offers.length,
      tagCount: tags.length,
      tags,
      suggestionCount: Array.isArray(daily.cardScanSuggestions) ? daily.cardScanSuggestions.length : 0,
      isComplete: !!(core.uploadReview && core.uploadReview.isComplete)
    };
  },

  row(row) {
    if (!row) return { exists: false, core: null, summary: null, summaryText: '', updatedAt: '' };
    let core = null;
    let summary = null;
    try { core = JSON.parse(row.core_json || '{}'); } catch (e) { core = {}; }
    try { summary = JSON.parse(row.summary_json || '{}'); } catch (e) { summary = this.summarize(core); }
    return {
      exists: true,
      userId: this.text(row.user_id),
      schemaVersion: this.text(row.schema_version),
      core,
      summary,
      summaryText: this.text(row.summary_text),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at)
    };
  },

  async get(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const row = await D1ReadModule.first(env, 'SELECT * FROM personal_ai_cores WHERE user_id = ? LIMIT 1', [userId]);
    return { success: true, data: this.row(row) };
  },

  async save(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const core = this.parseCore(payload || {});
    const coreJson = JSON.stringify(core);
    if (coreJson.length > 120000) return { success: false, error: '資料包過大，請只保留標準 JSON 結果' };
    const summary = this.summarize(core);
    const summaryJson = JSON.stringify(summary);
    const summaryText = this.text(payload.summaryText || payload.summary_text).slice(0, 10000);

    await env.ACTMASTER_DB.prepare(`
      INSERT INTO personal_ai_cores (
        user_id,schema_version,core_json,summary_json,summary_text,created_at,updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        schema_version=excluded.schema_version,
        core_json=excluded.core_json,
        summary_json=excluded.summary_json,
        summary_text=excluded.summary_text,
        updated_at=CURRENT_TIMESTAMP
    `).bind(userId, core.schemaVersion, coreJson, summaryJson, summaryText).run();

    const row = await D1ReadModule.first(env, 'SELECT * FROM personal_ai_cores WHERE user_id = ? LIMIT 1', [userId]);
    return { success: true, data: this.row(row) };
  }
};

const D1AnnouncementModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  number(value, fallback = 20) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  },

  async ensure(env) {
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS announcements (
        announcement_id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        image_url TEXT NOT NULL DEFAULT '',
        action_label TEXT NOT NULL DEFAULT '',
        action_url TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_announcements_status_updated ON announcements(status, updated_at)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_announcements_updated ON announcements(updated_at)').run();
  },

  row(row) {
    if (!row) return null;
    return {
      announcementId: this.text(row.announcement_id),
      title: this.text(row.title),
      body: this.text(row.body),
      imageUrl: this.text(row.image_url),
      actionLabel: this.text(row.action_label),
      actionUrl: this.text(row.action_url),
      status: this.text(row.status, 'active'),
      createdBy: this.text(row.created_by),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at)
    };
  },

  async list(payload, env, admin = false) {
    await this.ensure(env);
    const limit = Math.min(Math.max(this.number(payload.limit, admin ? 100 : 10), 1), 100);
    const rows = admin
      ? await D1ReadModule.all(env, `
          SELECT * FROM announcements
          WHERE status <> 'deleted'
          ORDER BY COALESCE(NULLIF(updated_at, ''), created_at) DESC, created_at DESC
          LIMIT ?
        `, [limit])
      : await D1ReadModule.all(env, `
          SELECT * FROM announcements
          WHERE status = 'active'
          ORDER BY COALESCE(NULLIF(updated_at, ''), created_at) DESC, created_at DESC
          LIMIT ?
        `, [limit]);
    return { success: true, data: rows.map(row => this.row(row)).filter(Boolean) };
  },

  async save(payload, env) {
    await this.ensure(env);
    const announcementId = this.text(payload.announcementId || payload.announcement_id) || `ANN_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const title = this.text(payload.title);
    const body = this.text(payload.body);
    if (!title && !body) return { success: false, error: 'Missing announcement content' };
    const imageUrl = this.text(payload.imageUrl || payload.image_url);
    const actionLabel = this.text(payload.actionLabel || payload.action_label);
    const actionUrl = this.text(payload.actionUrl || payload.action_url);
    const status = ['active', 'hidden'].includes(this.text(payload.status)) ? this.text(payload.status) : 'active';
    const createdBy = this.text(payload.authenticatedUserId || payload.userId || payload.operatorId || payload.createdBy);

    await env.ACTMASTER_DB.prepare(`
      INSERT INTO announcements (
        announcement_id,title,body,image_url,action_label,action_url,status,created_by,created_at,updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(announcement_id) DO UPDATE SET
        title=excluded.title,
        body=excluded.body,
        image_url=excluded.image_url,
        action_label=excluded.action_label,
        action_url=excluded.action_url,
        status=excluded.status,
        updated_at=CURRENT_TIMESTAMP
    `).bind(announcementId, title, body, imageUrl, actionLabel, actionUrl, status, createdBy).run();

    const row = await D1ReadModule.first(env, 'SELECT * FROM announcements WHERE announcement_id = ? LIMIT 1', [announcementId]);
    return { success: true, data: this.row(row) };
  },

  async remove(payload, env) {
    await this.ensure(env);
    const announcementId = this.text(payload.announcementId || payload.announcement_id);
    if (!announcementId) return { success: false, error: 'Missing announcementId' };
    await env.ACTMASTER_DB.prepare(`
      UPDATE announcements
      SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
      WHERE announcement_id = ?
    `).bind(announcementId).run();
    return { success: true, data: { announcementId, status: 'deleted' } };
  }
};

const D1InboxModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  json(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  },

  ownUserId(payload) {
    return this.text(payload.authenticatedUserId || payload.userId || payload.lineId);
  },

  async identityIds(env, userId) {
    const id = this.text(userId);
    const ids = [];
    const add = value => {
      const next = this.text(value);
      if (next && !ids.includes(next)) ids.push(next);
    };
    add(id);
    const identity = await D1ReadModule.findUserByIdentity(env, id).catch(() => null);
    add(identity && identity.canonicalId);
    const user = identity && identity.user ? identity.user : null;
    add(user && user.line_id);
    add(user && user.row_id);
    add(user && user.legacy_line_id);
    add(user && user.point_line_id);
    const link = identity && identity.link ? identity.link : null;
    add(link && link.new_line_id);
    add(link && link.old_line_id);
    return ids.length ? ids : [id];
  },

  placeholders(values) {
    return (Array.isArray(values) ? values : []).map(() => '?').join(', ');
  },

  async ensure(env) {
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS inbox_items (
        message_id TEXT PRIMARY KEY,
        receiver_user_id TEXT NOT NULL,
        sender_user_id TEXT NOT NULL DEFAULT '',
        sender_card_id TEXT NOT NULL DEFAULT '',
        network_id TEXT NOT NULL DEFAULT 'admin',
        message_type TEXT NOT NULL DEFAULT 'message',
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL DEFAULT '{}',
        sender_snapshot_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'unread',
        coupon_status TEXT NOT NULL DEFAULT 'issued',
        coupon_redeemed_at TEXT NOT NULL DEFAULT '',
        coupon_redeemed_by TEXT NOT NULL DEFAULT '',
        coupon_redeem_note TEXT NOT NULL DEFAULT '',
        read_at TEXT NOT NULL DEFAULT '',
        archived_at TEXT NOT NULL DEFAULT '',
        expires_at TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_inbox_receiver_status ON inbox_items(receiver_user_id, status, created_at)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_inbox_receiver_created ON inbox_items(receiver_user_id, created_at)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_inbox_sender_created ON inbox_items(sender_user_id, created_at)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_inbox_network_created ON inbox_items(network_id, created_at)').run();
    await env.ACTMASTER_DB.prepare("ALTER TABLE inbox_items ADD COLUMN coupon_status TEXT NOT NULL DEFAULT 'issued'").run().catch(() => null);
    await env.ACTMASTER_DB.prepare("ALTER TABLE inbox_items ADD COLUMN coupon_redeemed_at TEXT NOT NULL DEFAULT ''").run().catch(() => null);
    await env.ACTMASTER_DB.prepare("ALTER TABLE inbox_items ADD COLUMN coupon_redeemed_by TEXT NOT NULL DEFAULT ''").run().catch(() => null);
    await env.ACTMASTER_DB.prepare("ALTER TABLE inbox_items ADD COLUMN coupon_redeem_note TEXT NOT NULL DEFAULT ''").run().catch(() => null);
  },

  async senderContext(env, senderUserId, senderCardId = '') {
    const senderId = this.text(senderUserId);
    const cardId = this.text(senderCardId);
    let card = null;
    let user = null;

    if (cardId) {
      card = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [cardId]).catch(() => null);
    }
    if (!card && senderId) {
      card = await D1ReadModule.first(env, `
        SELECT * FROM card_contacts
        WHERE line_id = ? OR creator_id = ?
        ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC
        LIMIT 1
      `, [senderId, senderId]).catch(() => null);
    }
    if (senderId) {
      user = await D1ReadModule.first(env, `
        SELECT * FROM users
        WHERE line_id = ? OR row_id = ? OR legacy_line_id = ? OR point_line_id = ?
        LIMIT 1
      `, [senderId, senderId, senderId, senderId]).catch(() => null);
    }

    const mappedCard = D1ReadModule.cardRow(card);
    const mappedUser = D1ReadModule.userRow(user);
    return {
      senderCard: mappedCard,
      senderUser: mappedUser,
      snapshot: {
        name: this.text(mappedUser && mappedUser.name, this.text(mappedCard && mappedCard.name, '未知寄件者')),
        phone: this.text(mappedUser && mappedUser.phone, this.text(mappedCard && mappedCard.mobile)),
        companyName: this.text(mappedCard && mappedCard.companyName),
        title: this.text(mappedUser && mappedUser.industry, this.text(mappedCard && mappedCard.title)),
        cardId: this.text(mappedCard && mappedCard.rowId, cardId),
        lineId: senderId
      }
    };
  },

  async receiverContext(env, receiverUserId) {
    const receiverId = this.text(receiverUserId);
    let user = null;
    let card = null;
    if (receiverId) {
      const identity = await D1ReadModule.findUserByIdentity(env, receiverId).catch(() => null);
      user = identity && identity.user ? identity.user : null;
      const canonicalId = this.text(identity && identity.canonicalId, receiverId);
      card = await D1ReadModule.first(env, `
        SELECT * FROM card_contacts
        WHERE line_id = ? OR creator_id = ?
        ORDER BY COALESCE(updated_at, created_at) DESC, row_id DESC
        LIMIT 1
      `, [canonicalId, canonicalId]).catch(() => null);
    }
    return {
      receiverUser: D1ReadModule.userRow(user),
      receiverCard: D1ReadModule.cardRow(card)
    };
  },

  itemRow(row, context = {}) {
    if (!row) return null;
    return {
      messageId: this.text(row.message_id),
      receiverUserId: this.text(row.receiver_user_id),
      senderUserId: this.text(row.sender_user_id),
      senderCardId: this.text(row.sender_card_id),
      networkId: this.text(row.network_id, 'admin'),
      messageType: this.text(row.message_type, 'message'),
      title: this.text(row.title),
      body: this.text(row.body),
      payload: this.json(row.payload_json),
      senderSnapshot: this.json(row.sender_snapshot_json, context.snapshot || {}),
      status: this.text(row.status, 'unread'),
      couponStatus: this.text(row.coupon_status, 'issued'),
      couponRedeemedAt: this.text(row.coupon_redeemed_at),
      couponRedeemedBy: this.text(row.coupon_redeemed_by),
      couponRedeemNote: this.text(row.coupon_redeem_note),
      readAt: this.text(row.read_at),
      archivedAt: this.text(row.archived_at),
      expiresAt: this.text(row.expires_at),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at),
      senderCard: context.senderCard || null,
      senderUser: context.senderUser || null,
      receiverCard: context.receiverCard || null,
      receiverUser: context.receiverUser || null,
      viewerRole: context.viewerRole || ''
    };
  },

  isVisibleSql() {
    return "(expires_at = '' OR expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)";
  },

  async count(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const ids = await this.identityIds(env, userId);
    const row = await D1ReadModule.first(env, `
      SELECT COUNT(*) AS unread
      FROM inbox_items
      WHERE receiver_user_id IN (${this.placeholders(ids)})
        AND status = 'unread'
        AND ${this.isVisibleSql()}
    `, ids);
    return { success: true, data: { unread: Number(row && row.unread) || 0 } };
  },

  async list(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const ids = await this.identityIds(env, userId);
    const status = this.text(payload.status);
    const type = this.text(payload.messageType || payload.type);
    const binds = [...ids];
    let where = `receiver_user_id IN (${this.placeholders(ids)}) AND archived_at = '' AND ${this.isVisibleSql()}`;
    if (status === 'unread' || status === 'read') {
      where += ' AND status = ?';
      binds.push(status);
    }
    if (type) {
      where += ' AND message_type = ?';
      binds.push(type);
    }
    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM inbox_items
      WHERE ${where}
      ORDER BY CASE WHEN status = 'unread' THEN 0 ELSE 1 END,
               created_at DESC,
               message_id DESC
      LIMIT 100
    `, binds);
    return { success: true, data: rows.map(row => this.itemRow(row)).filter(Boolean) };
  },

  async listSent(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    if (!userId) return { success: false, error: 'Missing userId' };
    const ids = await this.identityIds(env, userId);
    const type = this.text(payload.messageType || payload.type);
    const binds = [...ids];
    let where = `sender_user_id IN (${this.placeholders(ids)}) AND archived_at = '' AND ${this.isVisibleSql()}`;
    if (type) {
      where += ' AND message_type = ?';
      binds.push(type);
    }
    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM inbox_items
      WHERE ${where}
      ORDER BY created_at DESC, message_id DESC
      LIMIT 100
    `, binds);
    const enriched = [];
    for (const row of rows) {
      const receiver = await this.receiverContext(env, row.receiver_user_id).catch(() => ({}));
      const sender = await this.senderContext(env, row.sender_user_id, row.sender_card_id).catch(() => ({}));
      enriched.push(this.itemRow(row, { ...sender, ...receiver, viewerRole: 'sender' }));
    }
    return { success: true, data: enriched.filter(Boolean) };
  },

  async get(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    const messageId = this.text(payload.messageId || payload.message_id);
    if (!userId || !messageId) return { success: false, error: 'Missing messageId' };
    const ids = await this.identityIds(env, userId);
    const row = await D1ReadModule.first(env, `
      SELECT *
      FROM inbox_items
      WHERE message_id = ?
        AND (receiver_user_id IN (${this.placeholders(ids)}) OR sender_user_id IN (${this.placeholders(ids)}))
        AND archived_at = ''
        AND ${this.isVisibleSql()}
      LIMIT 1
    `, [messageId, ...ids, ...ids]);
    if (!row) return { success: false, error: '找不到這封訊息' };

    const viewerIsReceiver = ids.includes(this.text(row.receiver_user_id));
    if (viewerIsReceiver && this.text(row.status, 'unread') === 'unread') {
      await env.ACTMASTER_DB.prepare(`
        UPDATE inbox_items
        SET status = 'read', read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE message_id = ? AND receiver_user_id = ?
      `).bind(messageId, this.text(row.receiver_user_id)).run();
      row.status = 'read';
    }

    const context = await this.senderContext(env, row.sender_user_id, row.sender_card_id);
    const receiver = await this.receiverContext(env, row.receiver_user_id).catch(() => ({}));
    return { success: true, data: this.itemRow(row, { ...context, ...receiver, viewerRole: viewerIsReceiver ? 'receiver' : 'sender' }) };
  },

  async markRead(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    const messageId = this.text(payload.messageId || payload.message_id);
    if (!userId || !messageId) return { success: false, error: 'Missing messageId' };
    const ids = await this.identityIds(env, userId);
    await env.ACTMASTER_DB.prepare(`
      UPDATE inbox_items
      SET status = 'read', read_at = COALESCE(NULLIF(read_at, ''), CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
      WHERE message_id = ? AND receiver_user_id IN (${this.placeholders(ids)})
    `).bind(messageId, ...ids).run();
    return { success: true, data: { messageId, status: 'read' } };
  },

  async redeemCoupon(payload, env) {
    await this.ensure(env);
    const userId = this.ownUserId(payload);
    const messageId = this.text(payload.messageId || payload.message_id);
    if (!userId || !messageId) return { success: false, error: 'Missing messageId' };
    const ids = await this.identityIds(env, userId);
    const row = await D1ReadModule.first(env, `
      SELECT *
      FROM inbox_items
      WHERE message_id = ?
        AND receiver_user_id IN (${this.placeholders(ids)})
        AND message_type = 'coupon'
        AND archived_at = ''
        AND ${this.isVisibleSql()}
      LIMIT 1
    `, [messageId, ...ids]);
    if (!row) return { success: false, error: '找不到可核銷的優惠券' };
    if (this.text(row.coupon_redeemed_at) || this.text(row.coupon_status) === 'redeemed') {
      return { success: false, error: '這張優惠券已核銷，不能重複使用' };
    }

    const note = this.text(payload.note || payload.redeemNote);
    const result = await env.ACTMASTER_DB.prepare(`
      UPDATE inbox_items
      SET coupon_status = 'redeemed',
          coupon_redeemed_at = CURRENT_TIMESTAMP,
          coupon_redeemed_by = ?,
          coupon_redeem_note = ?,
          status = 'read',
          read_at = COALESCE(NULLIF(read_at, ''), CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE message_id = ?
        AND receiver_user_id IN (${this.placeholders(ids)})
        AND message_type = 'coupon'
        AND (coupon_redeemed_at = '' OR coupon_redeemed_at IS NULL)
        AND coupon_status <> 'redeemed'
    `).bind(userId, note, messageId, ...ids).run();

    if (!result || !result.success || Number(result.meta && result.meta.changes || 0) < 1) {
      return { success: false, error: '這張優惠券已核銷，不能重複使用' };
    }

    const updated = await D1ReadModule.first(env, 'SELECT * FROM inbox_items WHERE message_id = ? LIMIT 1', [messageId]);
    const context = await this.senderContext(env, updated.sender_user_id, updated.sender_card_id);
    const receiver = await this.receiverContext(env, updated.receiver_user_id).catch(() => ({}));
    return { success: true, data: this.itemRow(updated, { ...context, ...receiver, viewerRole: 'receiver' }) };
  },

  async searchRecipients(payload, env) {
    await this.ensure(env);
    const actorId = this.ownUserId(payload);
    const actorRole = this.text(payload.authenticatedRole || payload.role, 'user').toLowerCase();
    const actorNetwork = this.text(payload.authenticatedNetworkId || payload.networkId, 'admin');
    const keyword = this.text(payload.keyword || payload.query || payload.q);
    if (!actorId) return { success: false, error: 'Missing userId' };
    if (keyword.length < 2) return { success: true, data: [] };

    const like = `%${keyword}%`;
    const binds = [actorId, like, like, like, like];
    let scopeSql = '';
    if (actorRole === 'admin') {
      scopeSql = '';
    } else if (actorRole === 'store') {
      scopeSql = 'AND (line_id = ? OR row_id = ? OR network_id = ? OR referrer_id = ?)';
      binds.push(actorId, actorId, actorId, actorId);
    } else {
      scopeSql = 'AND (network_id = ? OR referrer_id = ?)';
      binds.push(actorNetwork, actorNetwork);
    }

    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM users
      WHERE line_id <> ?
        AND (name LIKE ? OR phone LIKE ? OR line_id LIKE ? OR store_id LIKE ?)
        AND ${this.activeRecipientSql()}
        ${scopeSql}
      ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, row_id DESC
      LIMIT 20
    `, [...binds, like]).catch(() => []);

    return {
      success: true,
      data: rows.map(row => D1ReadModule.userRow(row)).filter(Boolean).map(user => ({
        userId: user.userId,
        name: user.name,
        phone: user.phone,
        industry: user.industry,
        role: user.role,
        roleLabel: user.roleLabel,
        networkId: user.networkId,
        canReceiveInbox: true
      }))
    };
  },

  activeRecipientSql() {
    return "TRIM(COALESCE(line_id,'')) <> '' AND TRIM(COALESCE(name,'')) NOT IN ('', '未命名', '待補資料') AND TRIM(COALESCE(phone,'')) <> ''";
  },

  isActiveRecipient(row) {
    const userId = this.text(row && (row.line_id || row.row_id));
    const name = this.text(row && row.name);
    const phone = this.text(row && row.phone);
    return !!userId && !!phone && !!name && !['未命名', '待補資料'].includes(name);
  },

  canReachRecipient(payload, receiverRow) {
    const actorId = this.ownUserId(payload);
    const actorRole = this.text(payload.authenticatedRole || payload.role, 'user').toLowerCase();
    const actorNetwork = this.text(payload.authenticatedNetworkId || payload.networkId, 'admin');
    const receiverId = this.text(receiverRow && (receiverRow.line_id || receiverRow.row_id));
    const receiverNetwork = this.text(receiverRow && receiverRow.network_id, 'admin');
    const receiverReferrer = this.text(receiverRow && receiverRow.referrer_id);
    if (!actorId || !receiverId || actorId === receiverId) return false;
    if (actorRole === 'admin') return true;
    if (actorRole === 'store') {
      return receiverNetwork === actorId || receiverReferrer === actorId || receiverId === actorId;
    }
    return receiverNetwork === actorNetwork || receiverReferrer === actorNetwork;
  },

  async send(payload, env) {
    await this.ensure(env);
    const senderUserId = this.ownUserId(payload);
    let receiverUserId = this.text(payload.receiverUserId || payload.receiver_user_id || payload.toUserId);
    if (!receiverUserId && this.text(payload.receiverQuery || payload.keyword)) {
      const found = await this.searchRecipients({ ...payload, keyword: payload.receiverQuery || payload.keyword }, env);
      receiverUserId = this.text(found && found.data && found.data[0] && found.data[0].userId);
    }
    if (!senderUserId) return { success: false, error: 'Missing sender' };
    if (!receiverUserId) return { success: false, error: '請指定收件人' };
    if (receiverUserId === senderUserId) return { success: false, error: '不能寄給自己' };

    const receiver = await D1ReadModule.findUserByIdentity(env, receiverUserId).catch(() => null);
    if (!receiver || !receiver.user) return { success: false, error: '找不到收件人' };
    if (!this.isActiveRecipient(receiver.user)) return { success: false, error: '對方尚未完成會員註冊，無法接收站內訊息' };
    if (!this.canReachRecipient(payload, receiver.user)) return { success: false, error: '收件人不在可傳送範圍內' };

    const title = this.text(payload.title, '新訊息');
    const body = this.text(payload.body || payload.content);
    const messageType = this.text(payload.messageType || payload.type, 'message');
    const senderCardId = this.text(payload.senderCardId || payload.sender_card_id);
    const context = await this.senderContext(env, senderUserId, senderCardId);
    const messageId = this.text(payload.messageId || payload.message_id) || `MSG_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const networkId = this.text(payload.networkId || payload.authenticatedNetworkId || receiver.user.network_id || 'admin', 'admin');
    const expiresAt = this.text(payload.expiresAt || payload.expires_at);
    const messageCost = messageType === 'coupon' ? 50 : 10;
    const pointUserId = await PointModule.resolvePointUserId(env, senderUserId);
    const wallet = await PointModule.queryUserPoints({ pointUserId, point_type: 'gift_money' }, env);
    if (!wallet || !wallet.success) return { success: false, error: (wallet && wallet.error) || '無法確認點數餘額' };
    const balance = Number(wallet.data && wallet.data.balance || 0) || 0;
    if (balance < messageCost) return { success: false, error: `點數不足，${messageType === 'coupon' ? '寄送優惠券' : '傳送訊息'}需要 ${messageCost} 點` };

    const pointPayload = { ...(payload.payload && typeof payload.payload === 'object' ? payload.payload : {}) };
    pointPayload.pointCharge = { pointType: 'gift_money', points: -messageCost, status: 'pending', messageType };
    if (messageType === 'coupon') {
      pointPayload.coupon = { status: 'issued', issuedAt: new Date().toISOString(), singleUse: true };
    }
    const payloadJson = JSON.stringify(pointPayload);

    await env.ACTMASTER_DB.prepare(`
      INSERT INTO inbox_items (
        message_id, receiver_user_id, sender_user_id, sender_card_id, network_id,
        message_type, title, body, payload_json, sender_snapshot_json, status,
        read_at, archived_at, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unread', '', '', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      messageId,
      D1ReadModule.text(receiver.canonicalId || receiver.user.line_id || receiver.user.row_id, receiverUserId),
      senderUserId,
      this.text(context.snapshot && context.snapshot.cardId, senderCardId),
      networkId,
      messageType,
      title,
      body,
      payloadJson,
      JSON.stringify(context.snapshot || {}),
      expiresAt
    ).run();

    const debit = await PointModule.insertUserPoint({
      userId: pointUserId,
      points: -messageCost,
      pointType: 'gift_money',
      eventName: '收件匣傳訊扣點',
      eventContent: `傳送${this.text(messageType, 'message')}給 ${this.text(receiver.user.name, receiverUserId)}，扣除 ${messageCost} 點`,
      shop_remark: `messageId=${messageId};receiver=${receiverUserId};messageType=${messageType};cost=${messageCost}`
    }, env);

    if (!debit || !debit.success) {
      await env.ACTMASTER_DB.prepare('DELETE FROM inbox_items WHERE message_id = ?').bind(messageId).run().catch(() => null);
      return { success: false, error: (debit && debit.error) || '扣點失敗，訊息未送出' };
    }

    await env.ACTMASTER_DB.prepare(`
      UPDATE inbox_items
      SET payload_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE message_id = ?
    `).bind(JSON.stringify({
      ...pointPayload,
      pointCharge: { pointType: 'gift_money', points: -messageCost, status: 'sent', messageType, response: debit.data || null }
    }), messageId).run();

    await WebPushModule.notifyUser(receiverUserId, {
      title: '你有一封新訊息',
      body: `${this.text(context.snapshot && context.snapshot.name, '會員')} 傳送了 ${this.text(messageType, 'message')}`,
      url: '/LINE-/?open=inbox'
    }, env).catch(() => null);

    const row = await D1ReadModule.first(env, 'SELECT * FROM inbox_items WHERE message_id = ? LIMIT 1', [messageId]);
    return { success: true, data: this.itemRow(row, context) };
  }
};

const WebPushModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  base64Url(input) {
    let bytes;
    if (typeof input === 'string') bytes = new TextEncoder().encode(input);
    else bytes = new Uint8Array(input);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  },

  base64UrlToBytes(value) {
    const text = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = text + '='.repeat((4 - text.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  },

  async ensure(env) {
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        p256dh TEXT NOT NULL DEFAULT '',
        auth TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id, status, updated_at)').run();
  },

  async config(payload, env) {
    const publicKey = this.text(env.VAPID_PUBLIC_KEY);
    return {
      success: true,
      data: {
        enabled: !!publicKey,
        publicKey,
        reason: publicKey ? '' : '尚未設定 VAPID_PUBLIC_KEY'
      }
    };
  },

  async save(payload, env, request) {
    await this.ensure(env);
    const userId = this.text(payload.authenticatedUserId || payload.userId);
    const subscription = payload.subscription && typeof payload.subscription === 'object' ? payload.subscription : payload;
    const endpoint = this.text(subscription.endpoint);
    const keys = subscription.keys && typeof subscription.keys === 'object' ? subscription.keys : {};
    if (!userId || !endpoint) return { success: false, error: 'Missing push subscription' };
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, user_agent, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        status = 'active',
        updated_at = CURRENT_TIMESTAMP
    `).bind(
      endpoint,
      userId,
      this.text(keys.p256dh),
      this.text(keys.auth),
      this.text(payload.userAgent || (request && request.headers.get('user-agent')))
    ).run();
    return { success: true, data: { endpoint, status: 'active' } };
  },

  async remove(payload, env) {
    await this.ensure(env);
    const userId = this.text(payload.authenticatedUserId || payload.userId);
    const endpoint = this.text(payload.endpoint || (payload.subscription && payload.subscription.endpoint));
    if (!userId || !endpoint) return { success: false, error: 'Missing push subscription' };
    await env.ACTMASTER_DB.prepare(`
      UPDATE push_subscriptions
      SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
      WHERE endpoint = ? AND user_id = ?
    `).bind(endpoint, userId).run();
    return { success: true, data: { endpoint, status: 'deleted' } };
  },

  publicKeyParts(publicKey) {
    const bytes = this.base64UrlToBytes(publicKey);
    if (bytes.length !== 65 || bytes[0] !== 4) throw new Error('Invalid VAPID public key');
    return {
      x: this.base64Url(bytes.slice(1, 33)),
      y: this.base64Url(bytes.slice(33, 65))
    };
  },

  async privateKey(env) {
    const publicKey = this.text(env.VAPID_PUBLIC_KEY);
    const rawPrivate = this.text(env.VAPID_PRIVATE_KEY);
    const privateJwkText = this.text(env.VAPID_PRIVATE_JWK);
    if (privateJwkText) {
      return JSON.parse(privateJwkText);
    }
    if (!publicKey || !rawPrivate) throw new Error('Missing VAPID keys');
    const parts = this.publicKeyParts(publicKey);
    return { kty: 'EC', crv: 'P-256', x: parts.x, y: parts.y, d: rawPrivate, ext: true };
  },

  ecdsaSignatureToJose(signature) {
    const bytes = new Uint8Array(signature);
    if (bytes.length === 64) return this.base64Url(bytes);
    let offset = 0;
    if (bytes[offset++] !== 0x30) throw new Error('Invalid ECDSA signature');
    let seqLen = bytes[offset++];
    if (seqLen & 0x80) offset += (seqLen & 0x7f);
    if (bytes[offset++] !== 0x02) throw new Error('Invalid ECDSA signature');
    const rLen = bytes[offset++];
    let r = bytes.slice(offset, offset + rLen);
    offset += rLen;
    if (bytes[offset++] !== 0x02) throw new Error('Invalid ECDSA signature');
    const sLen = bytes[offset++];
    let s = bytes.slice(offset, offset + sLen);
    const normalize = part => {
      let start = 0;
      while (start < part.length - 1 && part[start] === 0) start++;
      part = part.slice(start);
      if (part.length > 32) part = part.slice(part.length - 32);
      const out = new Uint8Array(32);
      out.set(part, 32 - part.length);
      return out;
    };
    const out = new Uint8Array(64);
    out.set(normalize(r), 0);
    out.set(normalize(s), 32);
    return this.base64Url(out);
  },

  async vapidJwt(endpoint, env) {
    const aud = new URL(endpoint).origin;
    const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
    const sub = this.text(env.VAPID_SUBJECT, 'mailto:Fangwl591021@gmail.com');
    const header = this.base64Url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const body = this.base64Url(JSON.stringify({ aud, exp, sub }));
    const signingInput = `${header}.${body}`;
    const key = await crypto.subtle.importKey(
      'jwk',
      await this.privateKey(env),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(signingInput)
    );
    return `${signingInput}.${this.ecdsaSignatureToJose(signature)}`;
  },

  async send(subscription, env) {
    const publicKey = this.text(env.VAPID_PUBLIC_KEY);
    const endpoint = this.text(subscription && subscription.endpoint);
    if (!publicKey || !endpoint) return { ok: false, skipped: true };
    const jwt = await this.vapidJwt(endpoint, env);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        TTL: '120',
        Urgency: 'normal',
        Authorization: `vapid t=${jwt}, k=${publicKey}`
      }
    });
    return { ok: res.ok, status: res.status, text: res.ok ? '' : await res.text().catch(() => '') };
  },

  async notifyUser(userId, message, env) {
    await this.ensure(env);
    if (!this.text(env.VAPID_PUBLIC_KEY) || (!this.text(env.VAPID_PRIVATE_KEY) && !this.text(env.VAPID_PRIVATE_JWK))) {
      return { success: false, skipped: true, error: 'Missing VAPID keys' };
    }
    const ids = await D1InboxModule.identityIds(env, userId);
    const rows = await D1ReadModule.all(env, `
      SELECT *
      FROM push_subscriptions
      WHERE user_id IN (${D1InboxModule.placeholders(ids)}) AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 10
    `, ids).catch(() => []);
    let sent = 0;
    for (const row of rows) {
      const result = await this.send(row, env).catch(err => ({ ok: false, status: 0, text: String(err && err.message || err) }));
      if (result.ok) {
        sent++;
      } else if (result.status === 404 || result.status === 410) {
        await env.ACTMASTER_DB.prepare(`
          UPDATE push_subscriptions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE endpoint = ?
        `).bind(row.endpoint).run().catch(() => null);
      }
    }
    return { success: true, data: { sent, total: rows.length } };
  }
};

const AuthModule = {
  getCardLineId(card) {
    return String((card && (card['LINE ID'] || card.lineId || card.userId)) || '').trim();
  },

  buildProfileFromBoundCard(card, userId) {
    const company = String(card['公司名稱'] || '').trim();
    const title = String(card['職稱'] || '').trim();
    const phone = String(card['手機號碼'] || card['公司電話'] || '').trim();
    return {
      userId,
      name: String(card['姓名'] || card['英文名'] || '待補資料').trim(),
      phone,
      industry: title || company || '已綁定名片',
      birthday: '',
      role: 'user',
      networkId: String(card['歸屬網'] || 'admin').trim(),
      claimedCardRowId: card.rowId || '',
      companyName: company,
      title,
      profileStatus: phone ? 'active' : 'bound_card',
      source: 'bound_card'
    };
  },

  async ensureBoundCardUser(userId, env) {
    const cardsResult = await DBModule.forward('getCardContacts', { role: 'admin', networkId: 'admin' }, env);
    const cards = cardsResult && Array.isArray(cardsResult.data) ? cardsResult.data : (Array.isArray(cardsResult) ? cardsResult : []);
    const card = cards.find(c => this.getCardLineId(c) === userId);
    if (!card) return null;

    const profile = this.buildProfileFromBoundCard(card, userId);
    const result = await DBModule.forward('registerUser', profile, env);
    if (!result || !result.success) return null;
    if (env.ACTMASTER_KV) {
      try {
        await env.ACTMASTER_KV.delete(`U_PROFILE_${userId}`);
        await env.ACTMASTER_KV.put(`U_PROFILE_${userId}`, JSON.stringify(profile), { expirationTtl: 600 });
      } catch (e) { console.error("KV Write Error", e); }
    }
    return profile;
  },

  async getAllUsersWithBoundCards(payload, env) {
    try {
      const d1Result = await D1ReadModule.getAllUsers(payload || {}, env);
      if (d1Result && d1Result.success && Array.isArray(d1Result.data)) return d1Result;
    } catch (e) {
      console.error("D1 getAllUsers fallback", e);
    }

    const usersResult = await DBModule.forward('getAllUsers', payload, env);
    const cardsResult = await DBModule.forward('getCardContacts', { ...payload, role: 'admin', networkId: payload.networkId || 'admin' }, env);
    const users = usersResult && Array.isArray(usersResult.data) ? usersResult.data : (Array.isArray(usersResult) ? usersResult : []);
    const cards = cardsResult && Array.isArray(cardsResult.data) ? cardsResult.data : (Array.isArray(cardsResult) ? cardsResult : []);
    const seen = new Set(users.map(u => String(u.userId || '').trim()).filter(Boolean));
    const merged = [...users];

    cards.forEach(card => {
      const userId = this.getCardLineId(card);
      if (!userId || seen.has(userId)) return;
      seen.add(userId);
      merged.push(this.buildProfileFromBoundCard(card, userId));
    });

    return { success: true, data: merged };
  },

  async check(payload, env) {
    const userId = payload.userId;
    if (!userId) return { success: false, error: "Missing userId" };

    try {
      const d1Result = await D1ReadModule.checkUser(payload || {}, env);
      if (d1Result && d1Result.success && d1Result.data && d1Result.data.isRegistered) return d1Result;
    } catch (e) {
      console.error("D1 checkUser fallback", e);
    }

    if (env.ACTMASTER_KV) {
      try {
        // 🚨 修正：變更 Cache Key 前綴，瞬間作廢所有舊記憶
        const cached = await env.ACTMASTER_KV.get(`U_PROFILE_${userId}`, 'json');
        if (cached) {
          cached.role = SecurityModule.sanitizeRole(userId, cached.role, cached);
          return { success: true, data: { isRegistered: true, info: cached } };
        }
      } catch (e) { console.error("KV Read Error", e); }
    }

    const result = await DBModule.forward('checkUser', payload, env);

    if (result && result.success && result.data && result.data.isRegistered && env.ACTMASTER_KV) {
      try {
        // 🚨 修正：縮短快取為 600 秒 (10 分鐘)，避免資料庫變更卡住
        await env.ACTMASTER_KV.put(`U_PROFILE_${userId}`, JSON.stringify(result.data.info), { expirationTtl: 600 });
      } catch (e) { console.error("KV Write Error", e); }
    }

    if (!result || result.success === false || !result.data || !result.data.isRegistered) {
      const boundProfile = await this.ensureBoundCardUser(userId, env);
      if (boundProfile) {
        return { success: true, data: { isRegistered: true, info: boundProfile, source: 'bound_card' } };
      }
    }
    return result;
  },

  async updateAndClearCache(action, payload, env) {
    const forwardPayload = { ...payload };
    if (action === 'updateUserRole' && payload.targetUserId) {
      forwardPayload.userId = payload.targetUserId;
      forwardPayload.role = payload.newRole || payload.targetRole || payload.permission || payload.role;
      forwardPayload.operatorId = payload.operatorId || payload.authUserId || payload.userId || '';
    }

    const result = await DBModule.forward(action, forwardPayload, env);

    if (result && result.success && env.ACTMASTER_KV) {
      try {
        let targetUserId = null;
        if (action === 'updateUserRole') {
          targetUserId = payload.targetUserId || payload.userId;
        } else if (action === 'registerUser' || action === 'updateUserProfile') {
          targetUserId = payload.userId;
        }

        if (targetUserId) {
          // 🚨 修正：連帶修改清除指令的前綴
          await env.ACTMASTER_KV.delete(`U_PROFILE_${targetUserId}`);
        }
      } catch(e) { console.error("KV Delete Error", e); }
    }
    return result;
  },

  async adminSyncBoundCardUser(payload, env) {
    const profile = payload.profile || {};
    const targetUserId = payload.targetUserId || profile.userId;
    if (!targetUserId) return { success: false, error: "Missing targetUserId" };

    const nextProfile = {
      ...profile,
      userId: targetUserId,
      role: profile.role || 'user',
      profileStatus: profile.profileStatus || 'incomplete',
      source: profile.source || 'bound_card'
    };

    const result = await DBModule.forward('registerUser', nextProfile, env);
    if (result && result.success && env.ACTMASTER_KV) {
      try {
        await env.ACTMASTER_KV.delete(`U_PROFILE_${targetUserId}`);
      } catch(e) { console.error("KV Delete Error", e); }
    }
    return result;
  }
};

const ClaimModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  pick(payload, keys, fallback = '') {
    for (const key of keys) {
      const value = payload && payload[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return fallback;
  },

  async getCardForClaim(payload, env) {
    const rowId = this.pick(payload, ['claimRowId', 'rowId', 'cardId', 'claim']);
    if (!rowId) return { success: false, error: 'Missing claimRowId' };
    await D1ReadModule.ensureCardAccessColumns(env);
    const card = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]);
    if (!card) return { success: false, error: 'Card not found' };
    return { success: true, data: D1ReadModule.cardRow(card) };
  },

  async claimCardAndRegister(payload, env) {
    const rowId = this.pick(payload, ['claimRowId', 'rowId', 'cardId', 'claim']);
    const userId = this.pick(payload, ['authenticatedUserId', 'userId', 'lineId']);
    if (!rowId || !userId) return { success: false, error: 'Missing claimRowId or userId' };

    await D1ReadModule.ensureCardAccessColumns(env);
    const card = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]);
    if (!card) return { success: false, error: 'Card not found' };
    const existingOwner = this.text(card.line_id);
    if (existingOwner && existingOwner !== userId) return { success: false, error: 'Card already claimed by another user' };

    const networkId = this.pick(payload, ['networkId', 'network_id'], this.text(card.network_id, 'admin'));
    const ownerUserId = this.text(card.owner_user_id, this.text(card.creator_id) || userId);
    await env.ACTMASTER_DB.prepare(`
      UPDATE card_contacts
      SET line_id = ?, profile_user_id = ?, owner_user_id = ?, network_id = ?,
          source_type = CASE WHEN TRIM(COALESCE(source_type,'')) = '' THEN 'private_import' ELSE source_type END,
          visibility = 'private', pool_eligible = 0, updated_at = CURRENT_TIMESTAMP
      WHERE row_id = ?
    `).bind(userId, userId, ownerUserId, networkId, rowId).run();

    const profile = {
      userId,
      name: this.pick(payload, ['name', '姓名', '憪?'], this.text(card.name, userId)),
      phone: this.pick(payload, ['phone', '手機號碼', '???Ⅳ'], this.text(card.mobile || card.office_phone)),
      industry: this.pick(payload, ['industry', 'title', '職稱', '?瑞迂'], this.text(card.title || card.company_name)),
      companyName: this.pick(payload, ['companyName', 'company', '公司名稱', '?砍?迂'], this.text(card.company_name)),
      title: this.pick(payload, ['title', '職稱', '?瑞迂'], this.text(card.title)),
      networkId,
      referrerId: this.pick(payload, ['referrerId', '推薦人', '?刻鈭?']),
      claimedCardRowId: rowId,
      profileStatus: 'bound_card',
      source: 'claim_link'
    };

    const userResult = await D1WriteModule.upsertUser(profile, env);
    if (env.ACTMASTER_KV) {
      try { await env.ACTMASTER_KV.delete(`U_PROFILE_${userId}`); } catch (e) {}
    }
    const updatedCard = await D1ReadModule.first(env, 'SELECT * FROM card_contacts WHERE row_id = ? LIMIT 1', [rowId]);
    return {
      success: true,
      data: {
        claimed: true,
        rowId,
        userId,
        card: D1ReadModule.cardRow(updatedCard || card),
        user: userResult && userResult.data ? userResult.data : profile
      }
    };
  }
};

const TrackingModule = {
  async recordShareCardVisit(payload, env) {
    const visitorId = payload.visitorId || payload.userId;
    const shareCardId = payload.shareCardId || '';
    const referrerId = payload.referrerId || '';
    const networkId = payload.networkId || 'admin';

    if (!visitorId || !shareCardId) {
      return { success: false, error: 'Missing visitorId or shareCardId' };
    }
    if (referrerId && referrerId === visitorId) {
      return { success: true, data: { skipped: true, reason: 'self_referral' } };
    }

    const key = `FIRST_SHARE_TOUCH_${visitorId}`;
    if (env.ACTMASTER_KV) {
      const existing = await env.ACTMASTER_KV.get(key, 'json');
      if (existing) {
        return { success: true, data: { skipped: true, existing } };
      }
    }

    const record = {
      visitorId,
      shareCardId,
      referrerId,
      networkId,
      firstTouchOnly: true,
      touchedAt: new Date().toISOString()
    };

    const result = await DBModule.forward('recordShareCardVisit', record, env);

    if (env.ACTMASTER_KV && (!result || result.success !== false)) {
      await env.ACTMASTER_KV.put(key, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 365 });
    }

    return result && result.success !== undefined
      ? result
      : { success: true, data: record };
  }
};

const BONUS_POLICY_TYPE = 'left_right_independent_split';

const BonusPolicyModule = {
  getPolicy(payload = {}) {
    const bv = Number(payload.bv || payload.bonusBV || payload.bonusAmount || 3000);
    const splitBonus = Number(payload.bonusPolicy?.splitBonus || payload.splitBonus || Math.floor(bv / 2));
    return {
      type: BONUS_POLICY_TYPE,
      grossAmount: Number(payload.grossAmount || payload.price || payload.fee || payload.amount || 6300),
      bv,
      directFullBonus: Number(payload.bonusPolicy?.directFullBonus || payload.bonusPolicy?.independentBonus || payload.directFullBonus || bv),
      directSplitBonus: splitBonus,
      sponsorSplitBonus: Number(payload.bonusPolicy?.sponsorSplitBonus || payload.sponsorSplitBonus || (bv - splitBonus)),
      renewalReferralBonus: Number(payload.bonusPolicy?.renewalReferralBonus || payload.renewalReferralBonus || splitBonus),
      renewalPlacementBonus: Number(payload.bonusPolicy?.renewalPlacementBonus || payload.renewalPlacementBonus || splitBonus),
      qualificationRequired: 2,
      freezeDays: Number(payload.bonusPolicy?.freezeDays || payload.freezeDays || 14)
    };
  },

  normalizeSide(side) {
    const value = String(side || '').toLowerCase();
    if (value === 'left' || value === 'l' || value === '左') return 'left';
    if (value === 'right' || value === 'r' || value === '右') return 'right';
    return '';
  },

  isIndependent(profile = {}) {
    if (profile.isIndependent === true || profile.independent === true) return true;
    if (profile.independentAt || profile.independenceAt) return true;
    if (String(profile.qualificationStatus || '').toLowerCase() === 'independent') return true;
    const leftDone = !!(profile.qualificationLeftMemberId || profile.leftQualifiedMemberId || profile.leftQualified);
    const rightDone = !!(profile.qualificationRightMemberId || profile.rightQualifiedMemberId || profile.rightQualified);
    if (leftDone && rightDone) return true;
    return Number(profile.qualificationCount || profile.qualifiedCount || 0) >= 2;
  },

  getRecruiterProfile(payload = {}) {
    return {
      ...(payload.recruiter || {}),
      isIndependent: payload.recruiterIsIndependent ?? payload.isRecruiterIndependent,
      independentAt: payload.recruiterIndependentAt,
      qualificationCount: payload.recruiterQualificationCount,
      qualificationLeftMemberId: payload.recruiterQualificationLeftMemberId,
      qualificationRightMemberId: payload.recruiterQualificationRightMemberId
    };
  },

  resolveRecruiterId(payload = {}) {
    return payload.recruiterId || payload.sponsorId || payload.referrerId || payload.introducerId || payload.recommenderId || '';
  },

  resolveRecruiterSponsorId(payload = {}) {
    return payload.recruiterSponsorId || payload.sponsorSponsorId || payload.recruiterUplineId || payload.uplineSponsorId || '';
  },

  addTransaction(plan, item) {
    if (!item.memberId || Number(item.amount || 0) <= 0) return;
    const idSuffix = plan.transactions.length + 1;
    plan.transactions.push({
      transactionId: item.transactionId || `${plan.orderId}-${String(idSuffix).padStart(2, '0')}`,
      orderId: plan.orderId,
      memberId: item.memberId,
      sourceMemberId: plan.sourceMemberId,
      bonusType: item.bonusType,
      amount: Number(item.amount),
      currency: plan.currency,
      status: 'pending',
      freezeUntil: plan.freezeUntil,
      note: item.note || ''
    });
  },

  getEventTime(payload = {}) {
    const raw = payload.paidAt || payload.createdAt || Date.now();
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  },

  buildPlan(payload = {}) {
    const policy = this.getPolicy(payload);
    const now = this.getEventTime(payload);
    const freezeUntil = new Date(now.getTime() + policy.freezeDays * 24 * 60 * 60 * 1000).toISOString();
    const orderType = payload.orderType || 'tenant_annual_fee';
    const orderId = payload.orderId || '';
    const buyerId = payload.buyerId || payload.tenantId || payload.userId || '';
    const recruiterId = this.resolveRecruiterId(payload);
    const recruiterSponsorId = this.resolveRecruiterSponsorId(payload);
    const placementParentId = payload.placementParentId || payload.placementOwnerId || payload.parentId || '';
    const placementSide = this.normalizeSide(payload.placementSide || payload.qualificationSide);
    const recruiterProfile = this.getRecruiterProfile(payload);
    const recruiterIndependent = this.isIndependent(recruiterProfile);
    const plan = {
      policyType: policy.type,
      orderId,
      orderType,
      sourceMemberId: buyerId,
      currency: payload.currency || 'TWD',
      status: 'pending',
      freezeDays: policy.freezeDays,
      freezeUntil,
      policy,
      relationships: {
        recruiterId,
        recruiterSponsorId,
        placementParentId,
        placementSide
      },
      qualificationUpdate: null,
      transactions: [],
      warnings: []
    };

    if (!orderId) plan.warnings.push('missing_order_id');
    if (!buyerId) plan.warnings.push('missing_buyer_id');

    if (orderType === 'tenant_renewal_fee') {
      if (recruiterId) {
        this.addTransaction(plan, {
          memberId: recruiterId,
          bonusType: 'renewal_referral',
          amount: policy.renewalReferralBonus,
          note: '年度續約：直接推薦獎金'
        });
      } else {
        plan.warnings.push('missing_recruiter_for_renewal');
      }

      if (placementParentId) {
        this.addTransaction(plan, {
          memberId: placementParentId,
          bonusType: 'renewal_placement',
          amount: policy.renewalPlacementBonus,
          note: '年度續約：當下安置獎金'
        });
      } else {
        plan.warnings.push('missing_placement_parent_for_renewal');
      }
    } else {
      if (!recruiterId) {
        plan.warnings.push('missing_recruiter');
      } else if (recruiterIndependent) {
        this.addTransaction(plan, {
          memberId: recruiterId,
          bonusType: 'direct_full',
          amount: policy.directFullBonus,
          note: '推薦人已獨立，取得全額 BV'
        });
      } else {
        this.addTransaction(plan, {
          memberId: recruiterId,
          bonusType: 'direct_split',
          amount: policy.directSplitBonus,
          note: '推薦人未獨立，推薦人取得半額'
        });

        if (recruiterSponsorId) {
          this.addTransaction(plan, {
            memberId: recruiterSponsorId,
            bonusType: 'sponsor_split',
            amount: policy.sponsorSplitBonus,
            note: '推薦人未獨立，上線取得半額'
          });
        } else {
          plan.warnings.push('missing_recruiter_sponsor');
        }

        plan.qualificationUpdate = {
          ownerId: recruiterId,
          sourceMemberId: buyerId,
          side: placementSide,
          requiredCount: policy.qualificationRequired,
          countsTowardIndependence: true,
          completesIndependence: this.wouldCompleteIndependence(recruiterProfile, placementSide)
        };
        if (!placementSide) plan.warnings.push('missing_qualification_side');
      }
    }

    if (plan.warnings.length) plan.status = 'review_required';
    return plan;
  },

  wouldCompleteIndependence(profile = {}, side = '') {
    const normalizedSide = this.normalizeSide(side);
    const leftDone = !!(profile.qualificationLeftMemberId || profile.leftQualifiedMemberId || profile.leftQualified);
    const rightDone = !!(profile.qualificationRightMemberId || profile.rightQualifiedMemberId || profile.rightQualified);
    if (this.isIndependent(profile)) return false;
    if (normalizedSide === 'left') return rightDone;
    if (normalizedSide === 'right') return leftDone;
    return Number(profile.qualificationCount || profile.qualifiedCount || 0) >= 1;
  },

  preview(payload = {}) {
    return { success: true, data: this.buildPlan(payload) };
  },

  buildTreeQuery(payload = {}) {
    return {
      memberId: payload.memberId || payload.userId || '',
      treeType: payload.treeType || 'placement',
      depth: Math.min(10, Math.max(1, Number(payload.depth || 3))),
      includeBonusSummary: payload.includeBonusSummary !== false,
      includeQualification: true,
      policyType: BONUS_POLICY_TYPE
    };
  }
};

async function resolveOwnCardRowId(payload, env) {
  const userId = String((payload && payload.userId) || '').trim();
  if (!userId) return '';
  if (env.ACTMASTER_DB) {
    try {
      const card = await D1ReadModule.first(env, 'SELECT row_id FROM card_contacts WHERE line_id = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 1', [userId]);
      if (card && card.row_id) return card.row_id;
    } catch (e) {
      console.error('D1 resolveOwnCardRowId fallback', e);
    }
  }
  const cardsResult = await DBModule.forward('getCardContacts', { role: 'admin', networkId: 'admin' }, env);
  const cards = Array.isArray(cardsResult) ? cardsResult : (cardsResult && (cardsResult.data || cardsResult.cards)) || [];
  const card = cards.find(c => {
    const lineId = String(c['LINE ID'] || c.lineId || c.userId || '').trim();
    return lineId && lineId === userId;
  });
  return card && (card.rowId || card['rowId'] || card['Row ID'] || card.id || '');
}

const D1FinanceModule = {
  hasD1(env) {
    return !!(env && env.ACTMASTER_DB);
  },

  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  pick(source, keys, fallback = '') {
    for (const key of keys) {
      const value = source && source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return fallback;
  },

  orderRow(row) {
    if (!row) return null;
    let raw = {};
    try { raw = row.raw_json ? JSON.parse(row.raw_json) : {}; } catch (e) {}
    return {
      ...raw,
      orderId: this.text(row.order_id),
      id: this.text(row.order_id),
      rowId: this.text(row.order_id),
      orderType: this.text(row.order_type),
      buyerId: this.text(row.buyer_id),
      tenantId: this.text(row.buyer_id),
      buyerName: this.text(row.buyer_name),
      tenantName: this.text(row.buyer_name),
      networkId: this.text(row.network_id, 'admin'),
      productCode: this.text(row.product_code),
      productName: this.text(row.product_name),
      grossAmount: Number(row.gross_amount || 0) || 0,
      fee: Number(row.gross_amount || 0) || 0,
      price: Number(row.gross_amount || 0) || 0,
      netAmount: Number(row.net_amount || 0) || 0,
      taxAmount: Number(row.tax_amount || 0) || 0,
      taxRate: Number(row.tax_rate || 0) || 0,
      bv: Number(row.bv || 0) || 0,
      currency: this.text(row.currency, 'TWD'),
      paymentStatus: this.text(row.payment_status),
      status: this.text(row.payment_status),
      paymentProvider: this.text(row.payment_provider),
      paymentNo: this.text(row.payment_no),
      paidAt: this.text(row.paid_at),
      bonusStatus: this.text(row.bonus_status),
      sponsorId: this.text(row.sponsor_id),
      recruiterId: this.text(row.recruiter_id),
      placementParentId: this.text(row.placement_parent_id),
      placementSide: this.text(row.placement_side),
      qualificationSide: this.text(row.placement_side),
      bonusPolicyType: this.text(row.bonus_policy_type),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at)
    };
  },

  bonusRow(row) {
    if (!row) return null;
    let raw = {};
    try { raw = row.raw_json ? JSON.parse(row.raw_json) : {}; } catch (e) {}
    return {
      ...raw,
      txId: this.text(row.tx_id),
      transactionId: this.text(row.tx_id),
      orderId: this.text(row.order_id),
      beneficiaryId: this.text(row.beneficiary_id),
      memberId: this.text(row.beneficiary_id),
      sourceUserId: this.text(row.source_user_id),
      networkId: this.text(row.network_id, 'admin'),
      bonusType: this.text(row.bonus_type),
      amount: Number(row.amount || 0) || 0,
      bv: Number(row.bv || 0) || 0,
      status: this.text(row.status),
      freezeUntil: this.text(row.freeze_until),
      settledAt: this.text(row.settled_at),
      note: this.text(row.note),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at)
    };
  },

  async upsertOrder(order, env) {
    const raw = JSON.stringify(order || {});
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO orders (order_id,order_type,buyer_id,buyer_name,network_id,product_code,product_name,gross_amount,net_amount,tax_amount,tax_rate,bv,currency,payment_status,payment_provider,payment_no,paid_at,bonus_status,sponsor_id,recruiter_id,placement_parent_id,placement_side,bonus_policy_type,raw_json,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(order_id) DO UPDATE SET
        order_type=excluded.order_type,buyer_id=excluded.buyer_id,buyer_name=excluded.buyer_name,network_id=excluded.network_id,
        product_code=excluded.product_code,product_name=excluded.product_name,gross_amount=excluded.gross_amount,net_amount=excluded.net_amount,
        tax_amount=excluded.tax_amount,tax_rate=excluded.tax_rate,bv=excluded.bv,currency=excluded.currency,payment_status=excluded.payment_status,
        payment_provider=excluded.payment_provider,payment_no=excluded.payment_no,paid_at=excluded.paid_at,bonus_status=excluded.bonus_status,
        sponsor_id=excluded.sponsor_id,recruiter_id=excluded.recruiter_id,placement_parent_id=excluded.placement_parent_id,
        placement_side=excluded.placement_side,bonus_policy_type=excluded.bonus_policy_type,raw_json=excluded.raw_json,updated_at=CURRENT_TIMESTAMP
    `).bind(
      order.orderId, order.orderType, order.buyerId, order.buyerName, order.networkId, order.productCode, order.productName,
      order.grossAmount, order.netAmount, order.taxAmount, order.taxRate, order.bv, order.currency, order.paymentStatus,
      order.paymentProvider, order.paymentNo, order.paidAt || '', order.bonusStatus, order.sponsorId, order.recruiterId,
      order.placementParentId, order.placementSide, order.bonusPolicyType, raw
    ).run();
  },

  async createOrder(payload, env) {
    if (!this.hasD1(env)) return null;
    const order = MLMModule.normalizeOrder(payload || {});
    if (!order.buyerId) return { success: false, error: 'Missing buyerId' };
    if (order.grossAmount <= 0 || order.bv < 0) return { success: false, error: 'Invalid order amount or BV' };
    order.bonusPlanPreview = BonusPolicyModule.buildPlan(order);
    await this.upsertOrder(order, env);
    return { success: true, data: this.orderRow(await D1ReadModule.first(env, 'SELECT * FROM orders WHERE order_id = ? LIMIT 1', [order.orderId])) };
  },

  async markOrderPaid(payload, env) {
    if (!this.hasD1(env)) return null;
    const orderId = this.pick(payload, ['orderId']);
    if (!orderId) return { success: false, error: 'Missing orderId' };
    const row = await D1ReadModule.first(env, 'SELECT * FROM orders WHERE order_id = ? LIMIT 1', [orderId]);
    if (!row) return { success: false, error: '找不到訂單' };
    const current = this.orderRow(row);
    const merged = MLMModule.normalizeOrder({ ...current, ...payload, paymentStatus: 'paid', status: 'paid', paidAt: payload.paidAt || new Date().toISOString() });
    merged.bonusStatus = payload.triggerBonus === false ? 'not_generated' : 'generated';
    const bonusPlan = BonusPolicyModule.buildPlan(merged);
    merged.bonusPlan = bonusPlan;
    await this.upsertOrder(merged, env);

    if (payload.triggerBonus !== false) {
      await env.ACTMASTER_DB.prepare('DELETE FROM bonus_transactions WHERE order_id = ?').bind(orderId).run();
      for (let i = 0; i < bonusPlan.transactions.length; i++) {
        const tx = bonusPlan.transactions[i];
        const txId = tx.transactionId || `${orderId}-B${i + 1}`;
        await env.ACTMASTER_DB.prepare(`
          INSERT INTO bonus_transactions (tx_id,order_id,beneficiary_id,source_user_id,network_id,bonus_type,amount,bv,status,freeze_until,note,raw_json,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        `).bind(
          txId, orderId, tx.memberId, bonusPlan.sourceMemberId, merged.networkId, tx.bonusType,
          tx.amount, tx.amount, 'frozen', tx.freezeUntil || bonusPlan.freezeUntil, tx.note || '', JSON.stringify(tx)
        ).run();
      }
    }

    return { success: true, data: { ...this.orderRow(await D1ReadModule.first(env, 'SELECT * FROM orders WHERE order_id = ? LIMIT 1', [orderId])), bonusPlan } };
  },

  async updateOrderStatus(payload, env, status) {
    if (!this.hasD1(env)) return null;
    const orderId = this.pick(payload, ['orderId']);
    if (!orderId) return { success: false, error: 'Missing orderId' };
    const bonusStatus = status === 'refunded' ? 'reversed' : status;
    await env.ACTMASTER_DB.prepare('UPDATE orders SET payment_status = ?, bonus_status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?')
      .bind(status, bonusStatus, orderId).run();
    await env.ACTMASTER_DB.prepare('UPDATE bonus_transactions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?')
      .bind(status === 'refunded' ? 'reversed' : 'cancelled', orderId).run();
    return { success: true, data: { orderId, status } };
  },

  async updateOrderPaymentProvider(payload, env) {
    if (!this.hasD1(env)) return null;
    const orderId = this.pick(payload, ['orderId']);
    if (!orderId) return { success: false, error: 'Missing orderId' };
    await env.ACTMASTER_DB.prepare(`
      UPDATE orders
      SET payment_provider = ?, payment_no = ?, raw_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ?
    `).bind(
      payload.paymentProvider || 'newebpay',
      payload.paymentNo || '',
      JSON.stringify(payload.raw || {}),
      orderId
    ).run();
    return { success: true, data: this.orderRow(await D1ReadModule.first(env, 'SELECT * FROM orders WHERE order_id = ? LIMIT 1', [orderId])) };
  },

  async listOrders(payload, env) {
    if (!this.hasD1(env)) return null;
    const page = Math.max(1, Number(payload.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(payload.pageSize || 20)));
    const offset = (page - 1) * pageSize;
    const status = this.text(payload.status || 'all');
    const orderType = this.text(payload.orderType);
    const actorRole = this.text(payload.authenticatedRole || payload.role || '').toLowerCase();
    const actorId = this.text(payload.authenticatedUserId || '');
    let buyerId = this.text(payload.buyerId);
    if (actorId && actorRole !== 'admin' && buyerId && buyerId !== actorId) {
      return { success: false, error: 'Access Denied: Cannot query another user order' };
    }
    if (actorId && actorRole !== 'admin' && !buyerId) buyerId = actorId;
    const rows = await D1ReadModule.all(env, `
      SELECT * FROM orders
      WHERE (? = 'all' OR payment_status = ?)
        AND (? = '' OR order_type = ?)
        AND (? = '' OR buyer_id = ?)
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [status,status,orderType,orderType,buyerId,buyerId,pageSize,offset]);
    const count = await D1ReadModule.first(env, `
      SELECT COUNT(*) AS total FROM orders
      WHERE (? = 'all' OR payment_status = ?)
        AND (? = '' OR order_type = ?)
        AND (? = '' OR buyer_id = ?)
    `, [status,status,orderType,orderType,buyerId,buyerId]);
    return { success: true, data: rows.map(row => this.orderRow(row)), orders: rows.map(row => this.orderRow(row)), total: Number(count?.total || 0), page, pageSize };
  },

  async listBonusTransactions(payload, env) {
    if (!this.hasD1(env)) return null;
    const page = Math.max(1, Number(payload.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(payload.pageSize || 20)));
    const offset = (page - 1) * pageSize;
    const status = this.text(payload.status || 'all');
    const actorRole = this.text(payload.authenticatedRole || payload.role || '').toLowerCase();
    const actorId = this.text(payload.authenticatedUserId || '');
    let memberId = this.text(payload.memberId || payload.beneficiaryId);
    if (actorId && actorRole !== 'admin' && memberId && memberId !== actorId) {
      return { success: false, error: 'Access Denied: Cannot query another user bonus' };
    }
    if (actorId && actorRole !== 'admin' && !memberId) memberId = actorId;
    const rows = await D1ReadModule.all(env, `
      SELECT * FROM bonus_transactions
      WHERE (? = 'all' OR status = ?)
        AND (? = '' OR beneficiary_id = ?)
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [status,status,memberId,memberId,pageSize,offset]);
    return { success: true, data: rows.map(row => this.bonusRow(row)), transactions: rows.map(row => this.bonusRow(row)), page, pageSize };
  },

  ym(value = '') {
    const source = String(value || '').trim();
    const match = source.match(/^(\d{4})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}`;
    return new Date().toISOString().slice(0, 7);
  },

  periodEnd(period) {
    const safePeriod = this.ym(period);
    const [year, month] = safePeriod.split('-').map(Number);
    return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();
  },

  parseJson(value) {
    try { return value ? JSON.parse(value) : {}; } catch (e) { return {}; }
  },

  async ensureSettlementSchema(env) {
    if (!this.hasD1(env)) return false;
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS settlement_batches (
        batch_id TEXT PRIMARY KEY,
        period TEXT NOT NULL,
        network_id TEXT DEFAULT 'admin',
        status TEXT DEFAULT 'draft',
        gross_amount REAL DEFAULT 0,
        withholding_tax REAL DEFAULT 0,
        nhi_fee REAL DEFAULT 0,
        net_amount REAL DEFAULT 0,
        item_count INTEGER DEFAULT 0,
        created_by TEXT DEFAULT '',
        locked_at TEXT DEFAULT '',
        paid_at TEXT DEFAULT '',
        raw_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.ACTMASTER_DB.prepare(`
      CREATE TABLE IF NOT EXISTS settlement_items (
        item_id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL,
        tx_id TEXT NOT NULL UNIQUE,
        beneficiary_id TEXT NOT NULL,
        beneficiary_name TEXT DEFAULT '',
        network_id TEXT DEFAULT 'admin',
        gross_amount REAL DEFAULT 0,
        withholding_tax REAL DEFAULT 0,
        nhi_fee REAL DEFAULT 0,
        net_amount REAL DEFAULT 0,
        invoice_required INTEGER DEFAULT 0,
        kyc_status TEXT DEFAULT '',
        status TEXT DEFAULT 'draft',
        raw_json TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(batch_id) REFERENCES settlement_batches(batch_id)
      )
    `).run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_settlement_batches_period ON settlement_batches(period, network_id, status)').run();
    await env.ACTMASTER_DB.prepare('CREATE INDEX IF NOT EXISTS idx_settlement_items_batch ON settlement_items(batch_id, beneficiary_id)').run();
    return true;
  },

  settlementBatchRow(row) {
    if (!row) return null;
    const raw = this.parseJson(row.raw_json);
    return {
      ...raw,
      batchId: this.text(row.batch_id),
      period: this.text(row.period),
      networkId: this.text(row.network_id, 'admin'),
      status: this.text(row.status, 'draft'),
      grossAmount: Number(row.gross_amount || 0) || 0,
      withholdingTax: Number(row.withholding_tax || 0) || 0,
      nhiFee: Number(row.nhi_fee || 0) || 0,
      netAmount: Number(row.net_amount || 0) || 0,
      itemCount: Number(row.item_count || 0) || 0,
      createdBy: this.text(row.created_by),
      lockedAt: this.text(row.locked_at),
      paidAt: this.text(row.paid_at),
      createdAt: this.text(row.created_at),
      updatedAt: this.text(row.updated_at)
    };
  },

  async buildMonthlySettlement(payload, env) {
    await this.ensureSettlementSchema(env);
    const period = this.ym(payload.period || payload.month || payload.periodStart || '');
    const endAt = payload.periodEnd || this.periodEnd(period);
    const networkId = this.text(payload.networkId || 'admin');
    const withholdingRate = Math.max(0, Number(payload.withholdingRate || 0)) / 100;
    const nhiRate = Math.max(0, Number(payload.nhiRate || 0)) / 100;
    const params = [endAt, endAt, networkId, networkId];
    const rows = await D1ReadModule.all(env, `
      SELECT
        bt.*,
        u.name AS beneficiary_name,
        u.phone AS beneficiary_phone,
        u.socials AS beneficiary_socials
      FROM bonus_transactions bt
      LEFT JOIN users u ON u.line_id = bt.beneficiary_id OR u.row_id = bt.beneficiary_id
      LEFT JOIN settlement_items si ON si.tx_id = bt.tx_id
      WHERE bt.status IN ('frozen','payable')
        AND (bt.freeze_until = '' OR bt.freeze_until IS NULL OR bt.freeze_until <= ?)
        AND (bt.created_at = '' OR bt.created_at IS NULL OR bt.created_at <= ?)
        AND (? = 'all' OR ? = '' OR bt.network_id = ?)
        AND si.tx_id IS NULL
      ORDER BY bt.created_at ASC
      LIMIT 5000
    `, [params[0], params[1], params[2], params[3], params[3]]);

    const grouped = new Map();
    rows.forEach(row => {
      const tx = this.bonusRow(row);
      const beneficiaryId = tx.beneficiaryId;
      if (!beneficiaryId) return;
      const socials = this.parseJson(row.beneficiary_socials);
      const dealer = socials.dealerProfile || socials.distributorProfile || {};
      const dealerType = this.text(dealer.dealerType || dealer.businessType || '');
      const invoiceRequired = dealerType === 'company' || dealerType === 'sole_proprietor' || !!dealer.taxId || !!dealer.uniformNo;
      const gross = Number(tx.amount || 0) || 0;
      const withholdingTax = Math.round(gross * withholdingRate);
      const nhiFee = Math.round(gross * nhiRate);
      const net = Math.max(0, gross - withholdingTax - nhiFee);
      if (!grouped.has(beneficiaryId)) {
        grouped.set(beneficiaryId, {
          beneficiaryId,
          beneficiaryName: this.text(row.beneficiary_name, beneficiaryId),
          networkId: tx.networkId || networkId,
          grossAmount: 0,
          withholdingTax: 0,
          nhiFee: 0,
          netAmount: 0,
          invoiceRequired,
          kycStatus: this.text(dealer.kycStatus || dealer.status || ''),
          taxId: this.text(dealer.taxId || dealer.uniformNo || ''),
          transactions: []
        });
      }
      const item = grouped.get(beneficiaryId);
      item.grossAmount += gross;
      item.withholdingTax += withholdingTax;
      item.nhiFee += nhiFee;
      item.netAmount += net;
      item.invoiceRequired = item.invoiceRequired || invoiceRequired;
      item.transactions.push({ ...tx, withholdingTax, nhiFee, netAmount: net });
    });

    const items = Array.from(grouped.values());
    const totals = items.reduce((sum, item) => ({
      grossAmount: sum.grossAmount + item.grossAmount,
      withholdingTax: sum.withholdingTax + item.withholdingTax,
      nhiFee: sum.nhiFee + item.nhiFee,
      netAmount: sum.netAmount + item.netAmount,
      transactionCount: sum.transactionCount + item.transactions.length
    }), { grossAmount: 0, withholdingTax: 0, nhiFee: 0, netAmount: 0, transactionCount: 0 });

    return {
      period,
      networkId,
      periodEnd: endAt,
      withholdingRate: withholdingRate * 100,
      nhiRate: nhiRate * 100,
      itemCount: items.length,
      items,
      totals
    };
  },

  async previewMonthlySettlement(payload, env) {
    if (!this.hasD1(env)) return null;
    const preview = await this.buildMonthlySettlement(payload || {}, env);
    return { success: true, data: preview, preview };
  },

  async createSettlementBatch(payload, env) {
    if (!this.hasD1(env)) return null;
    const preview = await this.buildMonthlySettlement(payload || {}, env);
    if (!preview.items.length) return { success: false, error: '本期沒有可結算獎金', data: preview };
    const existing = await D1ReadModule.first(env, `
      SELECT * FROM settlement_batches
      WHERE period = ? AND network_id = ? AND status IN ('draft','locked','paid')
      ORDER BY created_at DESC LIMIT 1
    `, [preview.period, preview.networkId]);
    if (existing && !payload.force) {
      return { success: false, error: '本月份已有結算批次', data: this.settlementBatchRow(existing), preview };
    }

    const batchId = payload.batchId || `SET-${preview.period.replace('-', '')}-${Date.now().toString(36).toUpperCase()}`;
    const createdBy = this.text(payload.operatorId || payload.userId || '');
    await env.ACTMASTER_DB.prepare(`
      INSERT INTO settlement_batches (batch_id, period, network_id, status, gross_amount, withholding_tax, nhi_fee, net_amount, item_count, created_by, raw_json, updated_at)
      VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      batchId, preview.period, preview.networkId, preview.totals.grossAmount, preview.totals.withholdingTax,
      preview.totals.nhiFee, preview.totals.netAmount, preview.itemCount, createdBy, JSON.stringify(preview)
    ).run();

    for (const item of preview.items) {
      for (const tx of item.transactions) {
        const itemId = `${batchId}-${tx.txId}`;
        await env.ACTMASTER_DB.prepare(`
          INSERT INTO settlement_items (item_id, batch_id, tx_id, beneficiary_id, beneficiary_name, network_id, gross_amount, withholding_tax, nhi_fee, net_amount, invoice_required, kyc_status, status, raw_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, CURRENT_TIMESTAMP)
        `).bind(
          itemId, batchId, tx.txId, item.beneficiaryId, item.beneficiaryName, item.networkId,
          tx.amount, tx.withholdingTax, tx.nhiFee, tx.netAmount, item.invoiceRequired ? 1 : 0,
          item.kycStatus, JSON.stringify({ item, transaction: tx })
        ).run();
      }
    }

    const row = await D1ReadModule.first(env, 'SELECT * FROM settlement_batches WHERE batch_id = ? LIMIT 1', [batchId]);
    return { success: true, data: this.settlementBatchRow(row), preview };
  },

  async listSettlementBatches(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureSettlementSchema(env);
    const period = this.text(payload.period || payload.month || '');
    const networkId = this.text(payload.networkId || 'admin');
    const rows = await D1ReadModule.all(env, `
      SELECT * FROM settlement_batches
      WHERE (? = '' OR period = ?)
        AND (? = 'all' OR ? = '' OR network_id = ?)
      ORDER BY period DESC, created_at DESC
      LIMIT 100
    `, [period, period, networkId, networkId, networkId]);
    return { success: true, data: rows.map(row => this.settlementBatchRow(row)), batches: rows.map(row => this.settlementBatchRow(row)) };
  },

  async lockSettlementBatch(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureSettlementSchema(env);
    const batchId = this.pick(payload, ['batchId']);
    if (!batchId) return { success: false, error: 'Missing batchId' };
    const batch = await D1ReadModule.first(env, 'SELECT * FROM settlement_batches WHERE batch_id = ? LIMIT 1', [batchId]);
    if (!batch) return { success: false, error: '找不到結算批次' };
    if (batch.status === 'paid') return { success: false, error: '已付款批次不能重新鎖定' };
    await env.ACTMASTER_DB.prepare("UPDATE settlement_batches SET status = 'locked', locked_at = ?, updated_at = CURRENT_TIMESTAMP WHERE batch_id = ?")
      .bind(new Date().toISOString(), batchId).run();
    await env.ACTMASTER_DB.prepare("UPDATE settlement_items SET status = 'locked', updated_at = CURRENT_TIMESTAMP WHERE batch_id = ?")
      .bind(batchId).run();
    await env.ACTMASTER_DB.prepare(`
      UPDATE bonus_transactions SET status = 'payable', settled_at = COALESCE(NULLIF(settled_at, ''), ?), updated_at = CURRENT_TIMESTAMP
      WHERE tx_id IN (SELECT tx_id FROM settlement_items WHERE batch_id = ?)
    `).bind(new Date().toISOString(), batchId).run();
    const row = await D1ReadModule.first(env, 'SELECT * FROM settlement_batches WHERE batch_id = ? LIMIT 1', [batchId]);
    return { success: true, data: this.settlementBatchRow(row) };
  },

  async markSettlementPaid(payload, env) {
    if (!this.hasD1(env)) return null;
    await this.ensureSettlementSchema(env);
    const batchId = this.pick(payload, ['batchId']);
    if (!batchId) return { success: false, error: 'Missing batchId' };
    const batch = await D1ReadModule.first(env, 'SELECT * FROM settlement_batches WHERE batch_id = ? LIMIT 1', [batchId]);
    if (!batch) return { success: false, error: '找不到結算批次' };
    if (batch.status !== 'locked') return { success: false, error: '請先鎖定結算批次再付款' };
    const paidAt = payload.paidAt || new Date().toISOString();
    await env.ACTMASTER_DB.prepare("UPDATE settlement_batches SET status = 'paid', paid_at = ?, updated_at = CURRENT_TIMESTAMP WHERE batch_id = ?")
      .bind(paidAt, batchId).run();
    await env.ACTMASTER_DB.prepare("UPDATE settlement_items SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE batch_id = ?")
      .bind(batchId).run();
    await env.ACTMASTER_DB.prepare(`
      UPDATE bonus_transactions SET status = 'paid', settled_at = COALESCE(NULLIF(settled_at, ''), ?), updated_at = CURRENT_TIMESTAMP
      WHERE tx_id IN (SELECT tx_id FROM settlement_items WHERE batch_id = ?)
    `).bind(paidAt, batchId).run();
    const row = await D1ReadModule.first(env, 'SELECT * FROM settlement_batches WHERE batch_id = ? LIMIT 1', [batchId]);
    return { success: true, data: this.settlementBatchRow(row) };
  },

  async getOrganizationTree(payload, env) {
    if (!this.hasD1(env)) return null;
    const actorRole = this.text(payload.authenticatedRole || payload.role || '').toLowerCase();
    const actorId = this.text(payload.authenticatedUserId || '');
    let rootId = this.text(payload.memberId || payload.userId);
    if (actorId && actorRole !== 'admin' && rootId && rootId !== actorId) {
      return { success: false, error: 'Access Denied: Cannot query another user organization' };
    }
    if (actorId && actorRole !== 'admin' && !rootId) rootId = actorId;
    if (!rootId) return { success: false, error: 'Missing memberId' };
    const treeType = this.text(payload.treeType || 'placement');
    const depth = Math.min(10, Math.max(1, Number(payload.depth || 3)));
    const users = await D1ReadModule.all(env, 'SELECT * FROM users LIMIT 2000');
    const orders = await D1ReadModule.all(env, "SELECT * FROM orders WHERE payment_status = 'paid' LIMIT 5000");
    const bonuses = await D1ReadModule.all(env, "SELECT beneficiary_id, SUM(amount) AS total FROM bonus_transactions WHERE status IN ('frozen','payable','paid') GROUP BY beneficiary_id");
    const userMap = new Map(users.map(row => [this.text(row.line_id || row.row_id), row]));
    const bonusMap = new Map(bonuses.map(row => [this.text(row.beneficiary_id), Number(row.total || 0) || 0]));
    const childrenMap = new Map();
    const qualifiedSides = new Map();

    const addChild = (parentId, childId, side, relation) => {
      if (!parentId || !childId || parentId === childId) return;
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      const list = childrenMap.get(parentId);
      if (!list.some(item => item.memberId === childId && item.relation === relation)) list.push({ memberId: childId, placementSide: side || '', relation });
    };

    orders.forEach(order => {
      const buyerId = this.text(order.buyer_id);
      const recruiterId = this.text(order.recruiter_id || order.sponsor_id);
      const parentId = treeType === 'sponsor' ? recruiterId : this.text(order.placement_parent_id || recruiterId);
      const side = this.text(order.placement_side);
      addChild(parentId, buyerId, side, treeType);
      if (recruiterId && side) {
        if (!qualifiedSides.has(recruiterId)) qualifiedSides.set(recruiterId, new Set());
        qualifiedSides.get(recruiterId).add(side);
      }
    });

    users.forEach(user => {
      const childId = this.text(user.line_id || user.row_id);
      const parentId = this.text(user.referrer_id);
      if (treeType === 'sponsor') addChild(parentId, childId, '', 'referrer');
    });

    const buildNode = (memberId, level, side = '') => {
      const user = userMap.get(memberId) || { line_id: memberId, name: memberId, role: 'user' };
      const children = level >= depth ? [] : (childrenMap.get(memberId) || [])
        .sort((a, b) => (a.placementSide || '').localeCompare(b.placementSide || '') || a.memberId.localeCompare(b.memberId))
        .map(child => buildNode(child.memberId, level + 1, child.placementSide));
      const sides = qualifiedSides.get(memberId) || new Set();
      return {
        memberId,
        userId: memberId,
        id: memberId,
        name: this.text(user.name, memberId),
        phone: this.text(user.phone),
        role: this.text(user.role, 'user'),
        networkId: this.text(user.network_id, 'admin'),
        placementSide: side,
        independent: sides.has('left') && sides.has('right'),
        qualificationCount: sides.size,
        qualificationLeftMemberId: sides.has('left') ? 'qualified' : '',
        qualificationRightMemberId: sides.has('right') ? 'qualified' : '',
        bonusTotal: bonusMap.get(memberId) || 0,
        children
      };
    };

    const root = buildNode(rootId, 0);
    return { success: true, data: { root, nodes: [root], treeType, depth }, tree: root };
  }
};

const PaymentModule = {
  text(value, fallback = '') {
    const next = String(value ?? '').trim();
    return next || fallback;
  },

  gatewayUrl(merchantId) {
    const id = String(merchantId || '').toUpperCase();
    return id.includes('TEST') || id.includes('DUMMY')
      ? 'https://ccore.newebpay.com/MPG/mpg_gateway'
      : 'https://core.newebpay.com/MPG/mpg_gateway';
  },

  credentials(env) {
    return {
      merchantId: this.text(env.NEWEBPAY_MERCHANT_ID || env.NEWEBPAY_MERCHANTID),
      hashKey: this.text(env.NEWEBPAY_HASH_KEY),
      hashIv: this.text(env.NEWEBPAY_HASH_IV)
    };
  },

  merchantOrderNo(orderId) {
    const base = String(orderId || '').replace(/[^A-Za-z0-9]/g, '').slice(-20);
    return `LC${Date.now().toString().slice(-8)}${base}`.slice(0, 30);
  },

  buildReturnUrl(payload) {
    return this.text(payload.returnUrl || payload.clientBackUrl || 'https://fangwl591021.github.io/LINE-/?payment=tenant');
  },

  buildNotifyUrl(env, payload) {
    return this.text(payload.notifyUrl || env.NEWEBPAY_NOTIFY_URL || 'https://line-engine.fangwl591021.workers.dev/newebpay/notify');
  },

  async prepareTenantCardPayment(payload, env) {
    if (!env.ACTMASTER_DB) return { success: false, error: 'Missing ACTMASTER_DB binding' };
    const orderId = this.text(payload.orderId);
    if (!orderId) return { success: false, error: 'Missing orderId' };
    const orderRow = await D1ReadModule.first(env, 'SELECT * FROM orders WHERE order_id = ? LIMIT 1', [orderId]);
    if (!orderRow) return { success: false, error: '找不到訂單' };
    const order = D1FinanceModule.orderRow(orderRow);
    const actorId = this.text(payload.authenticatedUserId);
    const actorRole = this.text(payload.authenticatedRole || payload.role).toLowerCase();
    if (actorId && actorRole !== 'admin' && actorRole !== 'store' && order.buyerId !== actorId) {
      return { success: false, error: 'Access Denied: Cannot pay another user order' };
    }
    if (!['pending_payment', 'pending', ''].includes(String(order.paymentStatus || '').toLowerCase())) {
      return { success: false, error: '此訂單不是待付款狀態' };
    }

    const creds = this.credentials(env);
    if (!creds.merchantId || !creds.hashKey || !creds.hashIv) {
      return { success: false, error: '尚未設定藍新刷卡 MerchantID / HashKey / HashIV' };
    }
    if (creds.hashKey.length !== 32 || creds.hashIv.length !== 16) {
      return { success: false, error: '藍新 HashKey 或 HashIV 長度不正確' };
    }

    const merchantOrderNo = this.merchantOrderNo(orderId);
    const amount = Math.max(1, Math.round(Number(order.grossAmount || payload.amount || 0)));
    const tradeInfo = {
      MerchantID: creds.merchantId,
      RespondType: 'JSON',
      TimeStamp: Math.floor(Date.now() / 1000).toString(),
      Version: '2.0',
      MerchantOrderNo: merchantOrderNo,
      Amt: amount,
      ItemDesc: String(order.productName || '租戶年費').replace(/[^\u4e00-\u9fa5A-Za-z0-9 _-]/g, '').slice(0, 45),
      ReturnURL: this.buildReturnUrl(payload),
      NotifyURL: this.buildNotifyUrl(env, payload),
      Email: this.text(payload.email || ''),
      LoginType: 0
    };
    const tradeInfoStr = Object.keys(tradeInfo).map(key => `${key}=${encodeURIComponent(tradeInfo[key])}`).join('&');
    const encrypted = await NewebPayCrypto.aesEncrypt(tradeInfoStr, creds.hashKey, creds.hashIv);
    const tradeSha = await NewebPayCrypto.sha256(`HashKey=${creds.hashKey}&${encrypted}&HashIV=${creds.hashIv}`);
    const raw = {
      ...D1FinanceModule.parseJson(orderRow.raw_json),
      newebpay: {
        merchantOrderNo,
        amount,
        preparedAt: new Date().toISOString(),
        gateway: this.gatewayUrl(creds.merchantId)
      }
    };
    await D1FinanceModule.updateOrderPaymentProvider({
      orderId,
      paymentProvider: 'newebpay',
      paymentNo: merchantOrderNo,
      raw
    }, env);

    return {
      success: true,
      data: {
        GatewayUrl: this.gatewayUrl(creds.merchantId),
        MerchantID: creds.merchantId,
        TradeInfo: encrypted,
        TradeSha: tradeSha,
        Version: '2.0',
        MerchantOrderNo: merchantOrderNo,
        orderId,
        amount
      }
    };
  },

  async handleNewebpayNotify(request, env, ctx) {
    const rawText = await request.text();
    const form = new URLSearchParams(rawText);
    const tradeInfo = form.get('TradeInfo');
    if (!tradeInfo) return new Response('OK', { status: 200 });
    ctx.waitUntil((async () => {
      try {
        const creds = this.credentials(env);
        if (!creds.hashKey || !creds.hashIv) throw new Error('Missing NewebPay credentials');
        const decrypted = await NewebPayCrypto.aesDecrypt(tradeInfo, creds.hashKey, creds.hashIv);
        const data = JSON.parse(decrypted);
        const result = data.Result || {};
        const merchantOrderNo = result.MerchantOrderNo || '';
        if (data.Status === 'SUCCESS' && merchantOrderNo) {
          const order = await D1ReadModule.first(env, "SELECT * FROM orders WHERE payment_provider = 'newebpay' AND payment_no = ? LIMIT 1", [merchantOrderNo]);
          if (order) {
            await MLMModule.markOrderPaid({
              orderId: order.order_id,
              paymentProvider: 'newebpay',
              paymentNo: result.TradeNo || merchantOrderNo,
              paidAt: result.PayTime || new Date().toISOString(),
              triggerBonus: true
            }, env);
          }
        }
      } catch (e) {
        console.error('NewebPay notify error', e);
      }
    })());
    return new Response('OK', { status: 200 });
  }
};

const TenantOrderModule = {
  async createTenantBonusOrder(payload, env) {
    const d1Result = await D1FinanceModule.createOrder({
      ...payload,
      buyerId: payload.tenantId || payload.userId || payload.buyerId,
      buyerName: payload.tenantName || payload.buyerName || '',
      orderType: 'tenant_annual_fee',
      productCode: 'TENANT_ANNUAL',
      productName: payload.productName || '租戶年費',
      grossAmount: Number(payload.fee || payload.price || payload.grossAmount || 6300),
      bv: Number(payload.bv || 3000)
    }, env);
    if (d1Result) return d1Result;

    const now = new Date().toISOString();
    const order = {
      orderId: payload.orderId || 'TEN-' + Date.now().toString() + Math.random().toString(36).substring(2, 6).toUpperCase(),
      tenantId: payload.tenantId || payload.userId || '',
      tenantName: payload.tenantName || '',
      networkId: payload.networkId || 'admin',
      productName: payload.productName || '租戶年費',
      fee: Number(payload.fee || payload.price || 6300),
      price: Number(payload.price || payload.fee || 6300),
      bv: Number(payload.bv || 3000),
      taxIncluded: payload.taxIncluded !== false,
      taxRate: Number(payload.taxRate || 5),
      status: payload.status || 'pending_payment',
      paymentProvider: payload.paymentProvider || 'manual',
      paymentNo: payload.paymentNo || '',
      sponsorId: payload.sponsorId || payload.recruiterId || payload.referrerId || '',
      recruiterId: payload.recruiterId || payload.sponsorId || payload.referrerId || '',
      recruiterSponsorId: payload.recruiterSponsorId || payload.sponsorSponsorId || payload.recruiterUplineId || '',
      placementParentId: payload.placementParentId || payload.placementOwnerId || payload.parentId || '',
      placementSide: BonusPolicyModule.normalizeSide(payload.placementSide || payload.qualificationSide),
      bonusPolicyType: BONUS_POLICY_TYPE,
      createdAt: now,
      updatedAt: now
    };

    const result = await DBModule.forward('createTenantBonusOrder', order, env);
    return result && result.success !== false ? result : { success: true, data: order };
  },

  async markTenantOrderPaid(payload, env) {
    const d1Result = await D1FinanceModule.markOrderPaid(payload, env);
    if (d1Result) return d1Result;

    const now = new Date().toISOString();
    const paidPayload = {
      ...payload,
      status: 'paid',
      paidAt: payload.paidAt || now,
      updatedAt: now,
      triggerBonus: true,
      freezeDays: payload.bonusPolicy?.freezeDays || 14
    };
    return await DBModule.forward('markTenantOrderPaid', paidPayload, env);
  },

  async cancelTenantBonusOrder(payload, env) {
    const d1Result = await D1FinanceModule.updateOrderStatus(payload, env, 'cancelled');
    if (d1Result) return d1Result;

    return await DBModule.forward('cancelTenantBonusOrder', {
      ...payload,
      status: 'cancelled',
      updatedAt: new Date().toISOString()
    }, env);
  }
};

const MLMModule = {
  normalizeOrder(payload) {
    const now = new Date().toISOString();
    const grossAmount = Number(payload.grossAmount || payload.price || payload.fee || payload.amount || 0);
    const taxRate = Number(payload.taxRate || 5);
    const netAmount = payload.netAmount !== undefined
      ? Number(payload.netAmount)
      : Math.round(grossAmount / (1 + taxRate / 100));

    return {
      orderId: payload.orderId || 'ORD-' + Date.now().toString() + Math.random().toString(36).substring(2, 8).toUpperCase(),
      orderType: payload.orderType || 'tenant_annual_fee',
      buyerId: payload.buyerId || payload.tenantId || payload.userId || '',
      buyerName: payload.buyerName || payload.tenantName || '',
      networkId: payload.networkId || 'admin',
      productCode: payload.productCode || 'TENANT_ANNUAL',
      productName: payload.productName || '租戶年費',
      grossAmount,
      netAmount,
      taxAmount: Math.max(0, grossAmount - netAmount),
      taxRate,
      bv: Number(payload.bv || payload.bonusBV || 3000),
      currency: payload.currency || 'TWD',
      paymentStatus: payload.paymentStatus || payload.status || 'pending_payment',
      paymentProvider: payload.paymentProvider || 'manual',
      paymentNo: payload.paymentNo || payload.tradeNo || '',
      bonusStatus: payload.bonusStatus || 'not_generated',
      bonusPolicyType: payload.bonusPolicyType || payload.bonusPolicy?.type || BONUS_POLICY_TYPE,
      sponsorId: payload.sponsorId || payload.recruiterId || payload.referrerId || '',
      recruiterId: payload.recruiterId || payload.sponsorId || payload.referrerId || '',
      recruiterSponsorId: payload.recruiterSponsorId || payload.sponsorSponsorId || payload.recruiterUplineId || '',
      placementParentId: payload.placementParentId || payload.placementOwnerId || payload.parentId || '',
      placementSide: BonusPolicyModule.normalizeSide(payload.placementSide || payload.qualificationSide),
      qualificationSide: BonusPolicyModule.normalizeSide(payload.qualificationSide || payload.placementSide),
      recruiterIsIndependent: payload.recruiterIsIndependent ?? payload.isRecruiterIndependent ?? false,
      recruiterIndependentAt: payload.recruiterIndependentAt || '',
      recruiterQualificationCount: Number(payload.recruiterQualificationCount || 0),
      recruiterQualificationLeftMemberId: payload.recruiterQualificationLeftMemberId || '',
      recruiterQualificationRightMemberId: payload.recruiterQualificationRightMemberId || '',
      createdAt: payload.createdAt || now,
      updatedAt: now,
      source: payload.source || 'admin'
    };
  },

  async createOrder(payload, env) {
    const d1Result = await D1FinanceModule.createOrder(payload, env);
    if (d1Result) return d1Result;

    const order = this.normalizeOrder(payload);
    if (!order.buyerId) return { success: false, error: 'Missing buyerId' };
    if (order.grossAmount <= 0 || order.bv < 0) return { success: false, error: 'Invalid order amount or BV' };

    const key = `ORDER_LOCK_${order.orderId}`;
    if (env.ACTMASTER_KV) {
      const exists = await env.ACTMASTER_KV.get(key);
      if (exists) return { success: false, error: 'Duplicate orderId' };
      await env.ACTMASTER_KV.put(key, '1', { expirationTtl: 60 * 60 * 24 * 30 });
    }

    return await DBModule.forward('mlmCreateOrder', {
      ...order,
      bonusPlanPreview: BonusPolicyModule.buildPlan(order)
    }, env);
  },

  async markOrderPaid(payload, env) {
    const d1Result = await D1FinanceModule.markOrderPaid(payload, env);
    if (d1Result) return d1Result;

    const orderId = payload.orderId || '';
    const paymentNo = payload.paymentNo || payload.tradeNo || '';
    if (!orderId) return { success: false, error: 'Missing orderId' };

    if (paymentNo && env.ACTMASTER_KV) {
      const paymentKey = `PAYMENT_LOCK_${payload.paymentProvider || 'manual'}_${paymentNo}`;
      const existing = await env.ACTMASTER_KV.get(paymentKey);
      if (existing) {
        return { success: true, data: { skipped: true, reason: 'duplicate_payment_callback' } };
      }
      await env.ACTMASTER_KV.put(paymentKey, orderId, { expirationTtl: 60 * 60 * 24 * 365 });
    }

    const planInput = {
      ...payload,
      orderId,
      paidAt: payload.paidAt || new Date().toISOString()
    };
    const bonusPlan = BonusPolicyModule.buildPlan(planInput);
    const paidPayload = {
      ...payload,
      paymentStatus: 'paid',
      status: 'paid',
      paidAt: planInput.paidAt,
      triggerBonus: payload.triggerBonus !== false,
      freezeDays: Number(payload.freezeDays || payload.bonusPolicy?.freezeDays || 14),
      bonusPolicy: {
        type: BONUS_POLICY_TYPE,
        directFullBonus: Number(payload.bonusPolicy?.directFullBonus || payload.bonusPolicy?.independentBonus || payload.bv || 3000),
        directSplitBonus: Number(payload.bonusPolicy?.directSplitBonus || payload.bonusPolicy?.splitBonus || Math.floor(Number(payload.bv || 3000) / 2)),
        sponsorSplitBonus: Number(payload.bonusPolicy?.sponsorSplitBonus || Math.ceil(Number(payload.bv || 3000) / 2)),
        renewalReferralBonus: Number(payload.bonusPolicy?.renewalReferralBonus || Math.floor(Number(payload.bv || 3000) / 2)),
        renewalPlacementBonus: Number(payload.bonusPolicy?.renewalPlacementBonus || Math.floor(Number(payload.bv || 3000) / 2)),
        qualificationRequired: 2,
        freezeDays: Number(payload.bonusPolicy?.freezeDays || payload.freezeDays || 14)
      },
      bonusPolicyType: BONUS_POLICY_TYPE,
      bonusPlan,
      bonusStatus: payload.triggerBonus === false ? 'not_generated' : bonusPlan.status,
      updatedAt: new Date().toISOString()
    };

    return await DBModule.forward('mlmMarkOrderPaid', paidPayload, env);
  },

  async cancelOrder(payload, env) {
    if (!payload.orderId) return { success: false, error: 'Missing orderId' };
    const d1Result = await D1FinanceModule.updateOrderStatus(payload, env, 'cancelled');
    if (d1Result) return d1Result;

    return await DBModule.forward('mlmCancelOrder', {
      ...payload,
      paymentStatus: 'cancelled',
      status: 'cancelled',
      bonusStatus: 'cancelled',
      updatedAt: new Date().toISOString()
    }, env);
  },

  async refundOrder(payload, env) {
    if (!payload.orderId) return { success: false, error: 'Missing orderId' };
    const d1Result = await D1FinanceModule.updateOrderStatus(payload, env, 'refunded');
    if (d1Result) return d1Result;

    return await DBModule.forward('mlmRefundOrder', {
      ...payload,
      paymentStatus: 'refunded',
      status: 'refunded',
      reversalRequired: true,
      updatedAt: new Date().toISOString()
    }, env);
  },

  async listOrders(payload, env) {
    const d1Result = await D1FinanceModule.listOrders(payload, env);
    if (d1Result) return d1Result;

    return await DBModule.forward('mlmListOrders', {
      page: Number(payload.page || 1),
      pageSize: Math.min(100, Number(payload.pageSize || 20)),
      status: payload.status || 'all',
      keyword: payload.keyword || '',
      buyerId: payload.buyerId || '',
      networkId: payload.networkId || '',
      orderType: payload.orderType || '',
      bonusPolicyType: payload.bonusPolicyType || ''
    }, env);
  },

  async listBonusTransactions(payload, env) {
    const d1Result = await D1FinanceModule.listBonusTransactions(payload, env);
    if (d1Result) return d1Result;

    return await DBModule.forward('mlmListBonusTransactions', {
      page: Number(payload.page || 1),
      pageSize: Math.min(100, Number(payload.pageSize || 20)),
      status: payload.status || 'all',
      memberId: payload.memberId || '',
      batchId: payload.batchId || ''
    }, env);
  },

  async createSettlementBatch(payload, env) {
    const d1Result = await D1FinanceModule.createSettlementBatch(payload, env);
    if (d1Result) return d1Result;

    return await DBModule.forward('mlmCreateSettlementBatch', {
      batchId: payload.batchId || 'BAT-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).substring(2, 6).toUpperCase(),
      periodStart: payload.periodStart || '',
      periodEnd: payload.periodEnd || '',
      status: 'draft',
      createdBy: payload.operatorId || payload.userId || '',
      createdAt: new Date().toISOString()
    }, env);
  },

  async lockSettlementBatch(payload, env) {
    if (!payload.batchId) return { success: false, error: 'Missing batchId' };
    const d1Result = await D1FinanceModule.lockSettlementBatch(payload, env);
    if (d1Result) return d1Result;

    return await DBModule.forward('mlmLockSettlementBatch', {
      ...payload,
      status: 'locked',
      lockedAt: new Date().toISOString()
    }, env);
  },

  async listSettlementBatches(payload, env) {
    const d1Result = await D1FinanceModule.listSettlementBatches(payload, env);
    if (d1Result) return d1Result;
    return await DBModule.forward('mlmListSettlementBatches', payload, env);
  },

  async previewMonthlySettlement(payload, env) {
    const d1Result = await D1FinanceModule.previewMonthlySettlement(payload, env);
    if (d1Result) return d1Result;
    return await DBModule.forward('mlmPreviewMonthlySettlement', payload, env);
  },

  async markSettlementPaid(payload, env) {
    const d1Result = await D1FinanceModule.markSettlementPaid(payload, env);
    if (d1Result) return d1Result;
    return await DBModule.forward('mlmMarkSettlementPaid', {
      ...payload,
      status: 'paid',
      paidAt: payload.paidAt || new Date().toISOString()
    }, env);
  },

  async getMemberTree(payload, env) {
    const d1Result = await D1FinanceModule.getOrganizationTree(payload, env);
    if (d1Result) return d1Result;

    return await DBModule.forward('mlmGetMemberTree', BonusPolicyModule.buildTreeQuery(payload), env);
  },

  async previewBonusPlan(payload, env) {
    return BonusPolicyModule.preview(payload);
  },

  async getOrganizationTree(payload, env) {
    const d1Result = await D1FinanceModule.getOrganizationTree(payload, env);
    if (d1Result) return d1Result;

    const query = BonusPolicyModule.buildTreeQuery(payload);
    const result = await DBModule.forward('mlmGetOrganizationTree', query, env);
    if (result && result.success !== false) return result;
    return await DBModule.forward('mlmGetMemberTree', query, env);
  }
};

// ==================== 請求分發器 (Action Dispatcher) ====================
async function dispatchAction(action, payload, request, env) {
  const authz = await SecurityModule.authorizeAction(action, payload, request, env);
  if (!authz.allowed) {
    return { success: false, error: authz.error || 'Access Denied' };
  }
  const actor = authz.actor;
  // 1. 資安防護：LIFF Token 驗證 (過渡相容模式)
  const legacyAuthSkipActions = new Set(['mlmListOrders', 'getTenantBonusOrders', 'prepareTenantCardPayment']);
  if (payload.userId && !actor && !legacyAuthSkipActions.has(action)) {
    const token = payload.lineAccessToken || request.headers.get('Authorization')?.replace('Bearer ', '');
    if (token) {
      // 若前端有傳 Token，則嚴格驗證是否被偽造
      const isValid = await SecurityModule.verifyLineAuth(payload.userId, token, env);
      if (!isValid) {
        return { success: false, error: "Access Denied: Invalid or Expired LINE Token" };
      }
    } else {
      // 【過渡期處理】若前端程式還沒更新傳送 Token，暫時放行非高敏感操作，讓舊系統能登入
      const strictActions = ['updateUserRole', 'adminSyncBoundCardUser', 'auditDataConsistency', 'repairDataConsistency', 'previewIdentityMigration', 'confirmIdentityMerge', 'listDuplicateCardBindings', 'resolveDuplicateCardBinding', 'mlmCreateOrder', 'mlmMarkOrderPaid', 'mlmCancelOrder', 'mlmRefundOrder', 'mlmCreateSettlementBatch', 'mlmLockSettlementBatch', 'mlmListSettlementBatches', 'mlmPreviewMonthlySettlement', 'mlmMarkSettlementPaid'];
      if (strictActions.includes(action)) {
        return { success: false, error: "Access Denied: Missing LINE Token for sensitive action" };
      }
    }
  }

  // 2. 資安防護：OpenAI 限流機制
  const aiActions = ['recognizeCardWithGPT4o', 'matchmakeContacts', 'calculateFateTags', 'reviewCardSafety', 'generateCardCopy'];
  if (aiActions.includes(action) && (actor?.userId || payload.userId)) {
    const allowed = await SecurityModule.checkRateLimit(actor?.userId || payload.userId, action, env, actor?.role || payload.role);
    if (!allowed) {
      return { success: false, error: "Daily AI quota exceeded for this action. Please try again tomorrow." };
    }
  }

  // 格式校正沙盒
  const writeActions = ['registerUser', 'updateUserProfile', 'saveCard', 'updateCard'];
  if (writeActions.includes(action)) {
    const data = payload.data || payload;
    ['手機', '手機號碼', '公司電話', '統一編號', '傳真'].forEach(k => {
      if (data[k]) data[k] = Utils.formatPhone(data[k]);
    });
  }

  if (action === 'updateCard' && (!payload.rowId || String(payload.rowId).trim() === '')) {
    const rowId = await resolveOwnCardRowId(payload, env);
    if (rowId) payload.rowId = rowId;
  }

  switch (action) {
    case 'checkUser':              return await AuthModule.check(payload, env);
    case 'getCardForClaim':        return await ClaimModule.getCardForClaim(payload || {}, env);
    case 'claimCardAndRegister':   return await ClaimModule.claimCardAndRegister(payload || {}, env);
    case 'getAllUsers':            return await AuthModule.getAllUsersWithBoundCards(payload, env);
    case 'getCardContacts': {
      try {
        const d1Result = await D1ReadModule.getCardContacts(payload || {}, env);
        if (d1Result && d1Result.success && Array.isArray(d1Result.data)) return d1Result;
      } catch (e) {
        console.error("D1 getCardContacts fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'getCrmContacts': {
      try {
        const d1Result = await D1ReadModule.getCrmContacts(payload || {}, env);
        if (d1Result && d1Result.success && Array.isArray(d1Result.data)) return d1Result;
      } catch (e) {
        console.error("D1 getCrmContacts fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'registerUser':
    case 'updateUserProfile': {
      try {
        const d1Result = await D1WriteModule.upsertUser(payload || {}, env);
        if (d1Result && d1Result.success !== false) return d1Result;
      } catch (e) {
        console.error("D1 upsertUser fallback", e);
      }
      return await AuthModule.updateAndClearCache(action, payload, env);
    }
    case 'linkUserIdentity': {
      try {
        const d1Result = await D1ReadModule.linkUserIdentity(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 linkUserIdentity fallback", e);
      }
      return { success: false, error: '身份合併失敗' };
    }
    case 'updateUserRole': {
      try {
        const d1Result = await D1WriteModule.updateUserRole(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 updateUserRole fallback", e);
      }
      return await AuthModule.updateAndClearCache(action, payload, env);
    }
    case 'auditDataConsistency':
      return await D1ConsistencyModule.audit(payload || {}, env);
    case 'repairDataConsistency':
      return await D1ConsistencyModule.repair(payload || {}, env);
    case 'previewIdentityMigration':
      return await D1ReadModule.previewIdentityMigration(payload || {}, env);
    case 'confirmIdentityMerge':
      return await D1WriteModule.confirmIdentityMerge(payload || {}, env);
    case 'listDuplicateCardBindings':
      return await D1ConsistencyModule.listDuplicateBindings(payload || {}, env);
    case 'resolveDuplicateCardBinding':
      return await D1ConsistencyModule.resolveDuplicateBinding(payload || {}, env);
    case 'saveCard':
    case 'updateCard': {
      try {
        const d1Result = await D1WriteModule.upsertCard(payload || {}, env);
        if (d1Result && d1Result.success !== false) return d1Result;
      } catch (e) {
        console.error("D1 upsertCard fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'deleteCard': {
      try {
        const d1Result = await D1WriteModule.deleteCard(payload || {}, env);
        if (d1Result && d1Result.success !== false) return d1Result;
      } catch (e) {
        console.error("D1 deleteCard fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'unlinkCard': {
      try {
        const d1Result = await D1WriteModule.unlinkCard(payload || {}, env);
        if (d1Result && d1Result.success !== false) return d1Result;
      } catch (e) {
        console.error("D1 unlinkCard fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'adminSyncBoundCardUser': {
      try {
        const profile = { ...(payload.profile || {}), userId: payload.targetUserId || payload.profile?.userId, role: payload.profile?.role || 'user' };
        const d1Result = await D1WriteModule.upsertUser(profile, env);
        if (d1Result && d1Result.success !== false) return d1Result;
      } catch (e) {
        console.error("D1 adminSyncBoundCardUser fallback", e);
      }
      return await AuthModule.adminSyncBoundCardUser(payload, env);
    }
    case 'getPublicActivities':
    case 'getAllActivities':
    case 'getActivities': {
      let listActor = actor;
      try {
        if (!listActor && payload && payload.lineAccessToken) {
          listActor = await SecurityModule.getActor(payload, request, env).catch(() => null);
        }
        const d1Result = await D1ActivityModule.listActivities(payload || {}, env, listActor);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 listActivities fallback", e);
      }
      const fallbackResult = await DBModule.forward(action, payload, env);
      return D1ActivityModule.filterResultByActor(fallbackResult, payload || {}, listActor);
    }
    case 'getActivityById': {
      try {
        const d1Result = await D1ActivityModule.getActivityById(payload || {}, env, actor);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 getActivityById fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'bulkAddRegistrants': {
      try {
        const d1Result = await D1ActivityModule.bulkAddRegistrants(payload || {}, env);
        if (d1Result && d1Result.success !== false) return d1Result;
      } catch (e) {
        console.error("D1 bulkAddRegistrants fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'updateActivity': {
      try {
        const d1Result = await D1ActivityModule.upsertActivity(payload || {}, env);
        if (d1Result) return { success: true, data: { activityId: d1Result.activity_id } };
      } catch (e) {
        console.error("D1 updateActivity fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'joinActivity': {
      try {
        const d1Result = await D1ActivityModule.insertRegistration(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 joinActivity fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'getActivityRegistrants': {
      try {
        const d1Result = await D1ActivityModule.listRegistrants(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 listRegistrants fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'getMyActivities':
    case 'getUserActivities':
    case 'getMyRegistrations':
    case 'getUserRegistrations': {
      try {
        const d1Result = await D1ActivityModule.listMyRegistrations(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 listMyRegistrations fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'cancelActivityRegistration':
    case 'cancelRegistration':
    case 'unregisterActivity':
    case 'removeActivityRegistration': {
      try {
        const d1Result = await D1ActivityModule.cancelRegistration(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 cancelRegistration fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'toggleCheckin': {
      try {
        const d1Result = await D1ActivityModule.toggleCheckin(payload || {}, env, 'manual');
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 toggleCheckin fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'nfcCheckin': {
      try {
        const d1Result = await D1ActivityModule.nfcCheckin(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 nfcCheckin fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'confirmPayment': {
      try {
        const d1Result = await D1ActivityModule.confirmPayment(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 confirmPayment fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'removeAct': {
      try {
        const d1Result = await D1ActivityModule.removeActivity(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 removeAct fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'setActivityStatus': {
      try {
        const d1Result = await D1ActivityModule.setActivityStatus(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 setActivityStatus fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'duplicateActivity': {
      try {
        const d1Result = await D1ActivityModule.duplicateActivity(payload || {}, env);
        if (d1Result) return d1Result;
      } catch (e) {
        console.error("D1 duplicateActivity fallback", e);
      }
      return await DBModule.forward(action, payload, env);
    }
    case 'listPersonalTasks':
      return await D1PersonalTaskModule.list(payload || {}, env);
    case 'savePersonalTask':
      return await D1PersonalTaskModule.save(payload || {}, env);
    case 'completePersonalTask':
      return await D1PersonalTaskModule.setStatus(payload || {}, env, 'done');
    case 'deletePersonalTask':
      return await D1PersonalTaskModule.setStatus(payload || {}, env, 'deleted');
    case 'listAnnouncements':
      return await D1AnnouncementModule.list(payload || {}, env, false);
    case 'listAdminAnnouncements':
      return await D1AnnouncementModule.list(payload || {}, env, true);
    case 'saveAnnouncement':
      return await D1AnnouncementModule.save(payload || {}, env);
    case 'deleteAnnouncement':
      return await D1AnnouncementModule.remove(payload || {}, env);
    case 'updateCrmContact':
      return await D1ReadModule.updateCrmContact(payload || {}, env);
    case 'getInboxCount':
      return await D1InboxModule.count(payload || {}, env);
    case 'listInboxItems':
      return await D1InboxModule.list(payload || {}, env);
    case 'listSentInboxItems':
      return await D1InboxModule.listSent(payload || {}, env);
    case 'getInboxItem':
      return await D1InboxModule.get(payload || {}, env);
    case 'markInboxRead':
      return await D1InboxModule.markRead(payload || {}, env);
    case 'searchInboxRecipients':
      return await D1InboxModule.searchRecipients(payload || {}, env);
    case 'sendInboxMessage':
      return await D1InboxModule.send(payload || {}, env);
    case 'redeemInboxCoupon':
      return await D1InboxModule.redeemCoupon(payload || {}, env);
    case 'getWebPushConfig':
      return await WebPushModule.config(payload || {}, env);
    case 'saveWebPushSubscription':
      return await WebPushModule.save(payload || {}, env, request);
    case 'deleteWebPushSubscription':
      return await WebPushModule.remove(payload || {}, env);
    case 'getPersonalAssistantCore':
      return await D1PersonalAssistantCoreModule.get(payload || {}, env);
    case 'savePersonalAssistantCore':
      return await D1PersonalAssistantCoreModule.save(payload || {}, env);
    
    case 'recognizeCardWithGPT4o': return await AIModule.recognize(payload, env);
    case 'matchmakeContacts':      return await AIModule.matchmaking(payload, env);
    case 'calculateFateTags':      return await AIModule.fateTags(payload, env);
    case 'reviewCardSafety':       return await AIModule.reviewCardSafety(payload, env);
    case 'generateCardCopy':       return await AIModule.generateCardCopy(payload, env);
    case 'queryUserPoints':        return await PointModule.queryUserPoints(payload || {}, env);
    case 'dailyPointCheckin':      return await PointModule.dailyCheckin(payload || {}, env);
    case 'getStorePointCustomer':  return await PointModule.getStorePointCustomer(payload || {}, env);
    case 'storeAdjustCustomerPoints': return await PointModule.storeAdjustCustomerPoints(payload || {}, env);
    case 'listStorePointCashierLogs': return await PointModule.listStorePointCashierLogs(payload || {}, env);
    case 'recordShareCardVisit':   return await TrackingModule.recordShareCardVisit(payload, env);
    case 'prepareTenantCardPayment': return await PaymentModule.prepareTenantCardPayment(payload, env);
    case 'createTenantBonusOrder': return await TenantOrderModule.createTenantBonusOrder(payload, env);
    case 'markTenantOrderPaid':    return await TenantOrderModule.markTenantOrderPaid(payload, env);
    case 'cancelTenantBonusOrder': return await TenantOrderModule.cancelTenantBonusOrder(payload, env);
    case 'mlmCreateOrder':         return await MLMModule.createOrder(payload, env);
    case 'mlmMarkOrderPaid':       return await MLMModule.markOrderPaid(payload, env);
    case 'mlmCancelOrder':         return await MLMModule.cancelOrder(payload, env);
    case 'mlmRefundOrder':         return await MLMModule.refundOrder(payload, env);
    case 'mlmListOrders':          return await MLMModule.listOrders(payload, env);
    case 'mlmListBonusTransactions': return await MLMModule.listBonusTransactions(payload, env);
    case 'mlmListSettlementBatches': return await MLMModule.listSettlementBatches(payload, env);
    case 'mlmPreviewMonthlySettlement': return await MLMModule.previewMonthlySettlement(payload, env);
    case 'mlmCreateSettlementBatch': return await MLMModule.createSettlementBatch(payload, env);
    case 'mlmLockSettlementBatch': return await MLMModule.lockSettlementBatch(payload, env);
    case 'mlmMarkSettlementPaid': return await MLMModule.markSettlementPaid(payload, env);
    case 'mlmGetMemberTree':       return await MLMModule.getMemberTree(payload, env);
    case 'mlmPreviewBonusPlan':     return await MLMModule.previewBonusPlan(payload, env);
    case 'mlmGetOrganizationTree':  return await MLMModule.getOrganizationTree(payload, env);
    case 'd1BackfillFromGas':       return await D1BackfillModule.backfillFromGas(payload, env);
    case 'buildFlexMessage':       return { success: true, data: MessagingModule.buildFlex(payload) };
    case 'uploadImageToR2':        return { success: true, url: await StorageModule.upload(payload.base64Image, env) };
    case 'deployRichMenu':         return await LineOAModule.deployRichMenu(payload, env);
    case 'extractLineVoomMedia':    return await LineOAModule.extractLineVoomMedia(payload, env);
    default:                       return await DBModule.forward(action, payload, env);
  }
}

// ==================== 主入口 (Worker Entry) ====================
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
    }
    try {
      const url = new URL(request.url);
      if (url.pathname === '/newebpay/notify') {
        return await PaymentModule.handleNewebpayNotify(request, env, ctx || { waitUntil: promise => promise });
      }
      if (request.method !== 'POST') return Utils.jsonResponse({ status: "ACTMASTER API v6.0 Running with Edge Security (Compatibility Mode)" });
      const body = await request.json();
      const result = await dispatchAction(body.action, body.payload || {}, request, env);
      return Utils.jsonResponse(result);
    } catch (err) {
      return Utils.jsonResponse({ success: false, error: "Critical Error: " + err.message }, 500);
    }
  }
};

